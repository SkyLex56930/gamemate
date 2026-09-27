-- GameMate Companion V16 — appels vocaux privés entre amis
-- Projet cible : nkbolxajtgsblwcwxlfm

begin;

alter table public.profile_privacy_settings
  add column if not exists allow_direct_calls boolean not null default true;

create table if not exists public.direct_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ringing'
    check (status in ('ringing', 'active', 'declined', 'missed', 'cancelled', 'ended')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  answered_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  constraint direct_calls_distinct_users check (caller_id <> callee_id)
);

create index if not exists direct_calls_caller_started_idx
  on public.direct_calls(caller_id, started_at desc);
create index if not exists direct_calls_callee_started_idx
  on public.direct_calls(callee_id, started_at desc);
create index if not exists direct_calls_ended_by_idx
  on public.direct_calls(ended_by)
  where ended_by is not null;
create index if not exists direct_calls_open_idx
  on public.direct_calls(status, expires_at)
  where status in ('ringing', 'active');

alter table public.direct_calls enable row level security;

drop policy if exists direct_calls_read_participants_v16 on public.direct_calls;
create policy direct_calls_read_participants_v16
on public.direct_calls
for select
to authenticated
using ((select auth.uid()) in (caller_id, callee_id));

revoke all on table public.direct_calls from anon;
revoke insert, update, delete on table public.direct_calls from authenticated;
grant select on table public.direct_calls to authenticated;

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
      when exists (
        select 1 from public.direct_calls dc
        where dc.status = 'active' and a.user_id in (dc.caller_id, dc.callee_id)
      ) then 'En appel'
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

create or replace function public.can_access_direct_call(requested_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_call_id uuid;
begin
  if v_uid is null or requested_topic is null or requested_topic !~ '^direct-call:[0-9a-fA-F-]{36}$' then
    return false;
  end if;

  begin
    v_call_id := split_part(requested_topic, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.direct_calls c
    where c.id = v_call_id
      and v_uid in (c.caller_id, c.callee_id)
      and c.status in ('ringing', 'active')
  );
end;
$$;

create or replace function public.expire_my_direct_calls_v16()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.direct_calls
  set status = 'missed', ended_at = coalesce(ended_at, now())
  where status = 'ringing'
    and expires_at <= now()
    and v_uid in (caller_id, callee_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.start_direct_call_v16(p_callee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_call public.direct_calls%rowtype;
begin
  if v_caller_id is null then raise exception 'not_authenticated'; end if;
  if p_callee_id is null or p_callee_id = v_caller_id then raise exception 'invalid_recipient'; end if;
  if not exists (select 1 from public.profiles where id = p_callee_id) then raise exception 'recipient_not_found'; end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_caller_id and blocked_id = p_callee_id)
       or (blocker_id = p_callee_id and blocked_id = v_caller_id)
  ) then raise exception 'user_blocked'; end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_caller_id and addressee_id = p_callee_id)
        or (requester_id = p_callee_id and addressee_id = v_caller_id))
  ) then raise exception 'recipient_not_friend'; end if;
  if coalesce((
    select allow_direct_calls
    from public.profile_privacy_settings
    where user_id = p_callee_id
  ), true) = false then raise exception 'direct_calls_disabled'; end if;

  update public.direct_calls
  set status = 'missed', ended_at = coalesce(ended_at, now())
  where status = 'ringing' and expires_at <= now()
    and (v_caller_id in (caller_id, callee_id) or p_callee_id in (caller_id, callee_id));

  if exists (
    select 1 from public.direct_calls
    where status in ('ringing', 'active')
      and v_caller_id in (caller_id, callee_id)
  ) then raise exception 'already_in_call'; end if;

  if exists (
    select 1 from public.direct_calls
    where status in ('ringing', 'active')
      and p_callee_id in (caller_id, callee_id)
  ) then raise exception 'recipient_busy'; end if;

  insert into public.direct_calls(caller_id, callee_id)
  values(v_caller_id, p_callee_id)
  returning * into v_call;

  return to_jsonb(v_call);
end;
$$;

create or replace function public.respond_direct_call_v16(p_call_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_call public.direct_calls%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_call from public.direct_calls where id = p_call_id for update;
  if not found or v_call.callee_id <> v_uid then raise exception 'call_not_found'; end if;
  if v_call.status <> 'ringing' then return to_jsonb(v_call); end if;

  if v_call.expires_at <= now() then
    update public.direct_calls
    set status = 'missed', ended_at = now()
    where id = p_call_id
    returning * into v_call;
    return to_jsonb(v_call);
  end if;

  update public.direct_calls
  set status = case when p_accept then 'active' else 'declined' end,
      answered_at = case when p_accept then now() else null end,
      ended_at = case when p_accept then null else now() end,
      ended_by = case when p_accept then null else v_uid end
  where id = p_call_id
  returning * into v_call;

  return to_jsonb(v_call);
end;
$$;

create or replace function public.end_direct_call_v16(p_call_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_call public.direct_calls%rowtype;
  v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_call from public.direct_calls where id = p_call_id for update;
  if not found or v_uid not in (v_call.caller_id, v_call.callee_id) then raise exception 'call_not_found'; end if;
  if v_call.status not in ('ringing', 'active') then return to_jsonb(v_call); end if;

  v_status := case
    when v_call.status = 'active' then 'ended'
    when v_uid = v_call.caller_id then 'cancelled'
    else 'declined'
  end;

  update public.direct_calls
  set status = v_status, ended_at = now(), ended_by = v_uid
  where id = p_call_id
  returning * into v_call;

  return to_jsonb(v_call);
end;
$$;

create or replace function public.get_direct_call_details_v16(p_call_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'caller_id', c.caller_id,
    'callee_id', c.callee_id,
    'status', case when c.status = 'ringing' and c.expires_at <= now() then 'missed' else c.status end,
    'started_at', c.started_at,
    'expires_at', c.expires_at,
    'answered_at', c.answered_at,
    'ended_at', c.ended_at,
    'ended_by', c.ended_by,
    'other_user_id', case when c.caller_id = auth.uid() then c.callee_id else c.caller_id end,
    'other_display_name', p.display_name,
    'other_username', p.username,
    'other_avatar_url', p.avatar_url
  )
  from public.direct_calls c
  join public.profiles p on p.id = case when c.caller_id = auth.uid() then c.callee_id else c.caller_id end
  where c.id = p_call_id and auth.uid() in (c.caller_id, c.callee_id);
$$;

create or replace function public.get_my_direct_call_history_v16(p_limit integer default 30)
returns table (
  call_id uuid,
  other_user_id uuid,
  other_display_name text,
  other_username text,
  other_avatar_url text,
  direction text,
  status text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.direct_calls
  set status = 'missed', ended_at = coalesce(ended_at, now())
  where status = 'ringing' and expires_at <= now()
    and v_uid in (caller_id, callee_id);

  return query
  select
    c.id,
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    case when c.caller_id = v_uid then 'outgoing' else 'incoming' end,
    c.status,
    c.started_at,
    c.answered_at,
    c.ended_at,
    case when c.answered_at is null then 0 else greatest(0, extract(epoch from (coalesce(c.ended_at, now()) - c.answered_at))::integer) end
  from public.direct_calls c
  join public.profiles p on p.id = case when c.caller_id = v_uid then c.callee_id else c.caller_id end
  where v_uid in (c.caller_id, c.callee_id)
  order by c.started_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

create or replace function public.update_my_profile_privacy_v16(
  p_show_bio boolean,
  p_show_region boolean,
  p_show_language boolean,
  p_show_games boolean,
  p_show_gaming_dna boolean,
  p_show_looking_for boolean,
  p_show_availability boolean,
  p_show_last_seen boolean,
  p_allow_friend_requests boolean,
  p_allow_squad_invites boolean,
  p_allow_direct_calls boolean
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
    allow_friend_requests, allow_squad_invites, allow_direct_calls, updated_at
  ) values (
    v_user_id, coalesce(p_show_bio, true), coalesce(p_show_region, true),
    coalesce(p_show_language, true), coalesce(p_show_games, true),
    coalesce(p_show_gaming_dna, true), coalesce(p_show_looking_for, true),
    coalesce(p_show_availability, true), coalesce(p_show_last_seen, true),
    coalesce(p_allow_friend_requests, true), coalesce(p_allow_squad_invites, true),
    coalesce(p_allow_direct_calls, true), now()
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
    allow_direct_calls = excluded.allow_direct_calls,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

drop policy if exists "gamemate direct call read" on realtime.messages;
create policy "gamemate direct call read"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and public.can_access_direct_call((select realtime.topic()))
);

drop policy if exists "gamemate direct call write" on realtime.messages;
create policy "gamemate direct call write"
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and public.can_access_direct_call((select realtime.topic()))
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_calls'
  ) then
    alter publication supabase_realtime add table public.direct_calls;
  end if;
end;
$$;

revoke all on function public.can_access_direct_call(text) from public, anon;
revoke all on function public.expire_my_direct_calls_v16() from public, anon;
revoke all on function public.start_direct_call_v16(uuid) from public, anon;
revoke all on function public.respond_direct_call_v16(uuid, boolean) from public, anon;
revoke all on function public.end_direct_call_v16(uuid) from public, anon;
revoke all on function public.get_direct_call_details_v16(uuid) from public, anon;
revoke all on function public.get_my_direct_call_history_v16(integer) from public, anon;
revoke all on function public.update_my_profile_privacy_v16(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;

grant execute on function public.can_access_direct_call(text) to authenticated;
grant execute on function public.expire_my_direct_calls_v16() to authenticated;
grant execute on function public.start_direct_call_v16(uuid) to authenticated;
grant execute on function public.respond_direct_call_v16(uuid, boolean) to authenticated;
grant execute on function public.end_direct_call_v16(uuid) to authenticated;
grant execute on function public.get_direct_call_details_v16(uuid) to authenticated;
grant execute on function public.get_my_direct_call_history_v16(integer) to authenticated;
grant execute on function public.update_my_profile_privacy_v16(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

commit;
