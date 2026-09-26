-- GameMate Companion V15 — présence sociale et invitations sécurisées
-- Projet cible : nkbolxajtgsblwcwxlfm

begin;

alter table public.user_presence
  add column if not exists custom_status text,
  add column if not exists activity_game_id bigint references public.games(id) on delete set null,
  add column if not exists activity_text text;

alter table public.user_presence
  drop constraint if exists user_presence_status_check;

update public.user_presence
set status = 'dnd'
where status = 'busy';

alter table public.user_presence
  add constraint user_presence_status_check
  check (status in ('online', 'away', 'dnd', 'invisible', 'offline')),
  add constraint user_presence_custom_status_check
  check (custom_status is null or char_length(custom_status) <= 80),
  add constraint user_presence_activity_text_check
  check (activity_text is null or char_length(activity_text) <= 80);

alter table public.profile_privacy_settings
  add column if not exists show_last_seen boolean not null default true;

drop policy if exists user_presence_read_authenticated on public.user_presence;
drop policy if exists user_presence_read_circle_v15 on public.user_presence;

create policy user_presence_read_circle_v15
on public.user_presence
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (
    status <> 'invisible'
    and (
      exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = (select auth.uid()) and f.addressee_id = user_presence.user_id)
            or
            (f.addressee_id = (select auth.uid()) and f.requester_id = user_presence.user_id)
          )
      )
      or exists (
        select 1
        from public.squad_members mine
        join public.squad_members theirs on theirs.squad_id = mine.squad_id
        join public.squads s on s.id = mine.squad_id and s.status = 'temporary'
        where mine.user_id = (select auth.uid())
          and theirs.user_id = user_presence.user_id
      )
    )
  )
);

revoke all on table public.user_presence from anon;
grant select, insert, update on table public.user_presence to authenticated;

create index if not exists user_presence_activity_game_idx
  on public.user_presence(activity_game_id)
  where activity_game_id is not null;

create or replace function public.set_my_presence(p_status text)
returns public.user_presence
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := case when p_status = 'busy' then 'dnd' else p_status end;
  v_row public.user_presence;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_status not in ('online', 'away', 'dnd', 'invisible', 'offline') then
    raise exception 'invalid_presence_status';
  end if;

  insert into public.user_presence(user_id, status, last_seen_at, updated_at)
  values(v_uid, v_status, now(), now())
  on conflict(user_id) do update
    set status = excluded.status,
        last_seen_at = now(),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_my_presence_v15(
  p_status text,
  p_custom_status text default null,
  p_activity_game_id bigint default null,
  p_activity_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := case when p_status = 'busy' then 'dnd' else p_status end;
  v_custom text := nullif(btrim(p_custom_status), '');
  v_activity text := nullif(btrim(p_activity_text), '');
  v_row public.user_presence;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_status not in ('online', 'away', 'dnd', 'invisible') then
    raise exception 'invalid_presence_status';
  end if;
  if v_custom is not null and char_length(v_custom) > 80 then
    raise exception 'custom_status_too_long';
  end if;
  if v_activity is not null and char_length(v_activity) > 80 then
    raise exception 'activity_text_too_long';
  end if;
  if p_activity_game_id is not null
     and not exists (select 1 from public.games where id = p_activity_game_id and is_active = true) then
    raise exception 'game_not_found';
  end if;

  insert into public.user_presence(
    user_id, status, custom_status, activity_game_id, activity_text, last_seen_at, updated_at
  ) values (
    v_uid, v_status, v_custom, p_activity_game_id, v_activity, now(), now()
  )
  on conflict(user_id) do update
    set status = excluded.status,
        custom_status = excluded.custom_status,
        activity_game_id = excluded.activity_game_id,
        activity_text = excluded.activity_text,
        last_seen_at = now(),
        updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.get_my_presence_v15()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select jsonb_build_object(
    'user_id', v_uid,
    'status', coalesce(up.status, 'online'),
    'custom_status', up.custom_status,
    'activity_game_id', up.activity_game_id,
    'activity_game_name', g.name,
    'activity_text', up.activity_text,
    'last_seen_at', up.last_seen_at
  )
  into v_result
  from (select 1) seed
  left join public.user_presence up on up.user_id = v_uid
  left join public.games g on g.id = up.activity_game_id;

  return v_result;
end;
$$;

create or replace function public.get_presence_v15(p_user_ids uuid[])
returns table (
  user_id uuid,
  status text,
  custom_status text,
  activity_game_id bigint,
  activity_game_name text,
  activity_text text,
  last_seen_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  with caller as (
    select auth.uid() as id
  ), requested as (
    select distinct u.user_id
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as u(user_id)
    limit 100
  ), allowed as (
    select r.user_id
    from requested r, caller c
    where c.id is not null
      and (
        r.user_id = c.id
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = c.id and f.addressee_id = r.user_id)
              or (f.addressee_id = c.id and f.requester_id = r.user_id))
        )
        or exists (
          select 1
          from public.squad_members mine
          join public.squad_members theirs on theirs.squad_id = mine.squad_id
          join public.squads s on s.id = mine.squad_id and s.status = 'temporary'
          where mine.user_id = c.id and theirs.user_id = r.user_id
        )
      )
  )
  select
    a.user_id,
    case
      when up.user_id is null
        or up.status in ('offline', 'invisible')
        or up.last_seen_at < now() - interval '90 seconds'
      then 'offline'
      else up.status
    end as status,
    case
      when up.status in ('offline', 'invisible')
        or up.last_seen_at < now() - interval '90 seconds'
      then null
      else up.custom_status
    end as custom_status,
    case when up.status in ('offline', 'invisible') or up.last_seen_at < now() - interval '90 seconds' then null else up.activity_game_id end,
    case when up.status in ('offline', 'invisible') or up.last_seen_at < now() - interval '90 seconds' then null else g.name end,
    case when up.status in ('offline', 'invisible') or up.last_seen_at < now() - interval '90 seconds' then null else up.activity_text end,
    case
      when up.status = 'invisible' then null
      when a.user_id = (select id from caller) then up.last_seen_at
      when coalesce(privacy.show_last_seen, true) then up.last_seen_at
      else null
    end as last_seen_at
  from allowed a
  left join public.user_presence up on up.user_id = a.user_id
  left join public.games g on g.id = up.activity_game_id
  left join public.profile_privacy_settings privacy on privacy.user_id = a.user_id;
$$;

create or replace function public.update_my_profile_privacy_v15(
  p_show_bio boolean,
  p_show_region boolean,
  p_show_language boolean,
  p_show_games boolean,
  p_show_gaming_dna boolean,
  p_show_looking_for boolean,
  p_show_availability boolean,
  p_show_last_seen boolean,
  p_allow_friend_requests boolean,
  p_allow_squad_invites boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.profile_privacy_settings%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  insert into public.profile_privacy_settings (
    user_id, show_bio, show_region, show_language, show_games,
    show_gaming_dna, show_looking_for, show_availability, show_last_seen,
    allow_friend_requests, allow_squad_invites, updated_at
  ) values (
    v_user_id, coalesce(p_show_bio, true), coalesce(p_show_region, true),
    coalesce(p_show_language, true), coalesce(p_show_games, true),
    coalesce(p_show_gaming_dna, true), coalesce(p_show_looking_for, true),
    coalesce(p_show_availability, true), coalesce(p_show_last_seen, true),
    coalesce(p_allow_friend_requests, true), coalesce(p_allow_squad_invites, true), now()
  )
  on conflict (user_id) do update set
    show_bio = excluded.show_bio,
    show_region = excluded.show_region,
    show_language = excluded.show_language,
    show_games = excluded.show_games,
    show_gaming_dna = excluded.show_gaming_dna,
    show_looking_for = excluded.show_looking_for,
    show_availability = excluded.show_availability,
    show_last_seen = excluded.show_last_seen,
    allow_friend_requests = excluded.allow_friend_requests,
    allow_squad_invites = excluded.allow_squad_invites,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.invite_to_squad(
  p_recipient_id uuid,
  p_game_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
  v_squad public.squads%rowtype;
  v_invite_id uuid;
  v_members int;
begin
  if v_sender is null then raise exception 'not_authenticated'; end if;
  if p_recipient_id is null or p_recipient_id = v_sender then raise exception 'invalid_recipient'; end if;
  if not exists(select 1 from public.profiles where id = p_recipient_id) then raise exception 'recipient_not_found'; end if;
  if exists(select 1 from public.user_blocks where (blocker_id = v_sender and blocked_id = p_recipient_id) or (blocker_id = p_recipient_id and blocked_id = v_sender)) then raise exception 'user_blocked'; end if;
  if not exists(select 1 from public.friendships where status = 'accepted' and ((requester_id = v_sender and addressee_id = p_recipient_id) or (requester_id = p_recipient_id and addressee_id = v_sender))) then raise exception 'recipient_not_friend'; end if;
  if coalesce((select allow_squad_invites from public.profile_privacy_settings where user_id = p_recipient_id), true) = false then
    raise exception 'squad_invites_disabled';
  end if;

  select s.* into v_squad
  from public.squads s
  join public.squad_members sm on sm.squad_id = s.id
  where sm.user_id = v_sender and s.status = 'temporary'
  order by s.created_at desc limit 1;

  if not found then
    insert into public.squads(owner_id, game_id, status, name, max_members)
    values(v_sender, p_game_id, 'temporary', 'Ma squad', 6)
    returning * into v_squad;
    insert into public.squad_members(squad_id, user_id, role)
    values(v_squad.id, v_sender, 'owner');
  end if;

  if v_squad.owner_id <> v_sender then raise exception 'only_owner_can_invite'; end if;
  if exists(select 1 from public.squad_members where squad_id = v_squad.id and user_id = p_recipient_id) then
    return jsonb_build_object('status', 'already_member', 'squad_id', v_squad.id);
  end if;

  select count(*) into v_members from public.squad_members where squad_id = v_squad.id;
  if v_members >= v_squad.max_members then raise exception 'squad_full'; end if;

  select id into v_invite_id
  from public.squad_invites
  where squad_id = v_squad.id and recipient_id = p_recipient_id and status = 'pending'
  limit 1;

  if v_invite_id is not null then
    update public.squad_invites set created_at = now(), sender_id = v_sender where id = v_invite_id;
    return jsonb_build_object('status', 'already_pending', 'squad_id', v_squad.id, 'invite_id', v_invite_id);
  end if;

  insert into public.squad_invites(squad_id, sender_id, recipient_id, status)
  values(v_squad.id, v_sender, p_recipient_id, 'pending')
  returning id into v_invite_id;

  return jsonb_build_object('status', 'invited', 'squad_id', v_squad.id, 'invite_id', v_invite_id);
end;
$$;

revoke all on function public.set_my_presence(text) from public, anon;
revoke all on function public.update_my_presence_v15(text, text, bigint, text) from public, anon;
revoke all on function public.get_my_presence_v15() from public, anon;
revoke all on function public.get_presence_v15(uuid[]) from public, anon;
revoke all on function public.update_my_profile_privacy_v15(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.invite_to_squad(uuid, bigint) from public, anon;

grant execute on function public.set_my_presence(text) to authenticated;
grant execute on function public.update_my_presence_v15(text, text, bigint, text) to authenticated;
grant execute on function public.get_my_presence_v15() to authenticated;
grant execute on function public.get_presence_v15(uuid[]) to authenticated;
grant execute on function public.update_my_profile_privacy_v15(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.invite_to_squad(uuid, bigint) to authenticated;

commit;
