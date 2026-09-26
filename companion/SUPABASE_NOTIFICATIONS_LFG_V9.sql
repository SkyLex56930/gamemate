-- GameMate Companion — Step 9 / Notifications persistantes LFG
-- À exécuter après SUPABASE_LFG_LIVE_V8.sql sur une nouvelle base.

create table if not exists public.user_notifications_v9 (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in (
    'lfg_application_received',
    'lfg_application_withdrawn',
    'lfg_application_accepted',
    'lfg_application_declined',
    'lfg_post_closed'
  )),
  title text not null check (char_length(title) between 1 and 90),
  body text not null check (char_length(body) between 1 and 240),
  entity_type text not null default 'lfg_post' check (entity_type in ('lfg_post', 'lfg_application', 'squad')),
  entity_id uuid,
  action_target text not null default 'lfg' check (action_target in ('lfg', 'squad', 'profile', 'messages')),
  metadata jsonb not null default '{}'::jsonb,
  event_key text not null check (char_length(event_key) between 8 and 180),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);

create index if not exists user_notifications_v9_recipient_created_idx
  on public.user_notifications_v9(recipient_id, created_at desc);
create index if not exists user_notifications_v9_unread_idx
  on public.user_notifications_v9(recipient_id, created_at desc)
  where read_at is null;
create index if not exists user_notifications_v9_actor_idx
  on public.user_notifications_v9(actor_id)
  where actor_id is not null;

alter table public.user_notifications_v9 enable row level security;

drop policy if exists notifications_v9_select_own on public.user_notifications_v9;
create policy notifications_v9_select_own
on public.user_notifications_v9
for select
to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists notifications_v9_update_read_state_own on public.user_notifications_v9;
create policy notifications_v9_update_read_state_own
on public.user_notifications_v9
for update
to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

revoke all on table public.user_notifications_v9 from public, anon, authenticated;
grant select on table public.user_notifications_v9 to authenticated;
grant update (read_at) on table public.user_notifications_v9 to authenticated;

create or replace function public.get_my_notifications_v9(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  notification_id uuid,
  kind text,
  title text,
  body text,
  actor_id uuid,
  actor_display_name text,
  actor_username text,
  actor_avatar_url text,
  entity_type text,
  entity_id uuid,
  action_target text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.id,
    n.kind,
    n.title,
    n.body,
    n.actor_id,
    coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Joueur GameMate'),
    p.username,
    p.avatar_url,
    n.entity_type,
    n.entity_id,
    n.action_target,
    n.metadata,
    n.read_at,
    n.created_at
  from public.user_notifications_v9 n
  left join public.profiles p on p.id = n.actor_id
  where n.recipient_id = (select auth.uid())
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.get_unread_notification_count_v9()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.user_notifications_v9
  where recipient_id = (select auth.uid())
    and read_at is null;
$$;

create or replace function public.mark_notification_read_v9(p_notification_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_read_at timestamptz;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  update public.user_notifications_v9
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = v_uid
  returning read_at into v_read_at;

  if not found then raise exception 'notification_not_found'; end if;

  return jsonb_build_object(
    'status', 'read',
    'notification_id', p_notification_id,
    'read_at', v_read_at
  );
end;
$$;

create or replace function public.mark_all_notifications_read_v9()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  update public.user_notifications_v9
  set read_at = now()
  where recipient_id = v_uid and read_at is null;

  get diagnostics v_count = row_count;
  return jsonb_build_object('status', 'read', 'updated_count', v_count);
end;
$$;

create or replace function public.handle_lfg_application_notification_v9()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_game_id bigint;
  v_game_name text;
  v_post_title text;
  v_squad_id uuid;
  v_actor_name text;
  v_recipient_id uuid;
  v_actor_id uuid;
  v_kind text;
  v_title text;
  v_body text;
  v_action_target text := 'lfg';
  v_entity_type text := 'lfg_post';
  v_entity_id uuid;
  v_event_time timestamptz;
  v_event_key text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  select lp.owner_id, lp.game_id, g.name, lp.title, lp.squad_id
    into v_owner_id, v_game_id, v_game_name, v_post_title, v_squad_id
  from public.lfg_posts_v8 lp
  join public.games g on g.id = lp.game_id
  where lp.id = new.post_id;

  if v_owner_id is null then return new; end if;

  select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Un joueur')
    into v_actor_name
  from public.profiles p
  where p.id = new.applicant_id;

  v_actor_name := coalesce(v_actor_name, 'Un joueur');
  v_entity_id := new.post_id;

  if new.status = 'pending' then
    v_recipient_id := v_owner_id;
    v_actor_id := new.applicant_id;
    v_kind := 'lfg_application_received';
    v_title := 'Nouvelle candidature';
    v_body := left(v_actor_name || ' souhaite rejoindre « ' || v_post_title || ' » sur ' || v_game_name || '.', 240);
    v_event_time := new.created_at;
  elsif new.status = 'cancelled' then
    v_recipient_id := v_owner_id;
    v_actor_id := new.applicant_id;
    v_kind := 'lfg_application_withdrawn';
    v_title := 'Candidature retirée';
    v_body := left(v_actor_name || ' a retiré sa candidature pour « ' || v_post_title || ' ».', 240);
    v_event_time := coalesce(new.responded_at, now());
  elsif new.status = 'accepted' then
    v_recipient_id := new.applicant_id;
    v_actor_id := v_owner_id;
    v_kind := 'lfg_application_accepted';
    v_title := 'Candidature acceptée';
    v_body := left('Tu peux rejoindre la squad de « ' || v_post_title || ' » sur ' || v_game_name || '.', 240);
    v_event_time := coalesce(new.responded_at, now());
    v_action_target := 'squad';
    v_entity_type := case when v_squad_id is null then 'lfg_post' else 'squad' end;
    v_entity_id := coalesce(v_squad_id, new.post_id);
  elsif new.status = 'declined' then
    v_recipient_id := new.applicant_id;
    v_actor_id := v_owner_id;
    v_kind := 'lfg_application_declined';
    v_title := 'Candidature mise à jour';
    v_body := left('Ta candidature pour « ' || v_post_title || ' » sur ' || v_game_name || ' n’a pas été retenue.', 240);
    v_event_time := coalesce(new.responded_at, now());
  else
    return new;
  end if;

  if v_recipient_id is null or v_recipient_id = v_actor_id then return new; end if;

  v_event_key := 'lfg_application:' || new.id::text || ':' || new.status || ':' ||
    floor(extract(epoch from v_event_time) * 1000)::bigint::text;

  insert into public.user_notifications_v9 (
    recipient_id, actor_id, kind, title, body, entity_type, entity_id,
    action_target, metadata, event_key, created_at
  ) values (
    v_recipient_id, v_actor_id, v_kind, v_title, v_body, v_entity_type, v_entity_id,
    v_action_target,
    jsonb_build_object(
      'post_id', new.post_id,
      'application_id', new.id,
      'application_status', new.status,
      'game_id', v_game_id,
      'squad_id', v_squad_id
    ),
    v_event_key,
    now()
  )
  on conflict (recipient_id, event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists lfg_application_notification_v9 on public.lfg_applications_v8;
create trigger lfg_application_notification_v9
after insert or update of status on public.lfg_applications_v8
for each row execute function public.handle_lfg_application_notification_v9();

revoke all on function public.get_my_notifications_v9(integer, timestamptz) from public, anon;
revoke all on function public.get_unread_notification_count_v9() from public, anon;
revoke all on function public.mark_notification_read_v9(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read_v9() from public, anon;
revoke all on function public.handle_lfg_application_notification_v9() from public, anon, authenticated;
grant execute on function public.get_my_notifications_v9(integer, timestamptz) to authenticated;
grant execute on function public.get_unread_notification_count_v9() to authenticated;
grant execute on function public.mark_notification_read_v9(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read_v9() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notifications_v9'
  ) then
    alter publication supabase_realtime add table public.user_notifications_v9;
  end if;
end;
$$;
