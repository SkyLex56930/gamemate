-- GameMate mobile V20: notifications Android/iOS pour messages et invitations.
-- Executer apres les scripts sociaux existants. Aucun envoi ne part sans appareil inscrit.

begin;

create extension if not exists pg_net with schema extensions;

create table if not exists public.mobile_push_devices (
  token text primary key check (
    char_length(token) between 25 and 255
    and (token like 'ExpoPushToken[%]' or token like 'ExponentPushToken[%]')
  ),
  user_id uuid not null references auth.users(id) on delete cascade,
  messages_enabled boolean not null default true,
  friend_requests_enabled boolean not null default true,
  invitations_enabled boolean not null default true,
  message_preview_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists mobile_push_devices_user_idx
  on public.mobile_push_devices (user_id, updated_at desc);

alter table public.mobile_push_devices enable row level security;
revoke all on public.mobile_push_devices from public, anon, authenticated;

create or replace function public.register_mobile_push_device(
  p_token text,
  p_messages boolean,
  p_friend_requests boolean,
  p_invitations boolean,
  p_message_preview boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_token is null or char_length(p_token) not between 25 and 255
    or not (p_token like 'ExpoPushToken[%]' or p_token like 'ExponentPushToken[%]')
  then raise exception 'invalid_push_token'; end if;

  insert into public.mobile_push_devices (
    token, user_id, messages_enabled, friend_requests_enabled,
    invitations_enabled, message_preview_enabled, updated_at
  ) values (
    p_token, v_user_id, coalesce(p_messages, false), coalesce(p_friend_requests, false),
    coalesce(p_invitations, false), coalesce(p_message_preview, false), now()
  )
  on conflict (token) do update set
    user_id = excluded.user_id,
    messages_enabled = excluded.messages_enabled,
    friend_requests_enabled = excluded.friend_requests_enabled,
    invitations_enabled = excluded.invitations_enabled,
    message_preview_enabled = excluded.message_preview_enabled,
    updated_at = now();

  -- Conserver au plus cinq appareils par compte.
  delete from public.mobile_push_devices d
  where d.user_id = v_user_id and d.token not in (
    select recent.token from public.mobile_push_devices recent
    where recent.user_id = v_user_id
    order by recent.updated_at desc limit 5
  );
end;
$$;

create or replace function public.unregister_mobile_push_device(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.mobile_push_devices
  where token = p_token and user_id = (select auth.uid());
$$;

revoke all on function public.register_mobile_push_device(text,boolean,boolean,boolean,boolean) from public, anon;
revoke all on function public.unregister_mobile_push_device(text) from public, anon;
grant execute on function public.register_mobile_push_device(text,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.unregister_mobile_push_device(text) to authenticated;

create or replace function public.send_mobile_push_for_social_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_actor uuid;
  v_name text;
  v_title text;
  v_body text;
  v_kind text;
  v_message_body text;
  v_data jsonb;
  v_device public.mobile_push_devices%rowtype;
begin
  if tg_table_name = 'messages' then
    select case when c.user_a = new.sender_id then c.user_b else c.user_a end
    into v_recipient
    from public.conversations c
    where c.id = new.conversation_id and new.sender_id in (c.user_a, c.user_b);
    v_actor := new.sender_id;
    v_kind := 'message';
    v_message_body := new.body;
    v_data := jsonb_build_object('kind', v_kind, 'conversationId', new.conversation_id,
      'senderId', new.sender_id, 'eventId', new.id);
  elsif tg_table_name = 'friendships' then
    if new.status <> 'pending' then return new; end if;
    if tg_op = 'UPDATE' then
      if old.status = 'pending' then return new; end if;
    end if;
    v_recipient := new.addressee_id;
    v_actor := new.requester_id;
    v_kind := 'friend_request';
    v_data := jsonb_build_object('kind', v_kind, 'requestId', new.id, 'eventId', new.id);
  elsif tg_table_name = 'squad_invites' then
    if new.status <> 'pending' then return new; end if;
    if tg_op = 'UPDATE' then
      if old.status = 'pending' then return new; end if;
    end if;
    v_recipient := new.recipient_id;
    v_actor := new.sender_id;
    v_kind := 'squad_invite';
    v_data := jsonb_build_object('kind', v_kind, 'inviteId', new.id, 'eventId', new.id);
  else
    return new;
  end if;

  if v_recipient is null or v_actor = v_recipient then return new; end if;

  select coalesce(nullif(left(trim(p.display_name), 55), ''),
    nullif(left(trim(p.username), 55), ''), 'Un joueur')
  into v_name from public.profiles p where p.id = v_actor;
  v_name := coalesce(v_name, 'Un joueur');

  if v_kind = 'message' then
    v_title := 'Message de ' || v_name;
  elsif v_kind = 'friend_request' then
    v_title := 'Nouvelle demande d’ami';
    v_body := v_name || ' souhaite t’ajouter.';
  else
    v_title := 'Invitation d’équipe';
    v_body := v_name || ' t’invite à rejoindre son équipe.';
  end if;

  for v_device in
    select * from public.mobile_push_devices d
    where d.user_id = v_recipient and d.updated_at > now() - interval '90 days'
      and case v_kind
        when 'message' then d.messages_enabled
        when 'friend_request' then d.friend_requests_enabled
        else d.invitations_enabled
      end
  loop
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', v_device.token,
          'title', left(v_title, 90),
          'body', left(case when v_kind = 'message'
            then case when v_device.message_preview_enabled then v_message_body
              else 'Tu as reçu un message.' end
            else v_body end, 180),
          'data', v_data,
          'sound', 'default',
          'channelId', 'gamemate',
          'priority', 'high'
        ),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    exception when others then
      raise log 'GameMate push non planifie pour un evenement % : %', v_kind, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function public.send_mobile_push_for_social_event() from public, anon, authenticated;

drop trigger if exists gamemate_mobile_push_message on public.messages;
create trigger gamemate_mobile_push_message
after insert on public.messages
for each row execute function public.send_mobile_push_for_social_event();

drop trigger if exists gamemate_mobile_push_friend_request on public.friendships;
create trigger gamemate_mobile_push_friend_request
after insert or update of status on public.friendships
for each row execute function public.send_mobile_push_for_social_event();

drop trigger if exists gamemate_mobile_push_squad_invite on public.squad_invites;
create trigger gamemate_mobile_push_squad_invite
after insert or update of status on public.squad_invites
for each row execute function public.send_mobile_push_for_social_event();

commit;
