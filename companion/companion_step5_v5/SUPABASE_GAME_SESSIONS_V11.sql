-- GameMate Companion V11 — sessions de jeu de squad
-- À exécuter une seule fois dans l'éditeur SQL Supabase.

begin;

create schema if not exists private;

create table if not exists public.squad_game_sessions (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  game_id bigint references public.games(id) on delete set null,
  mode text not null,
  server_region text,
  status text not null default 'ready_check',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  constraint squad_game_sessions_mode_length check (char_length(mode) between 1 and 60),
  constraint squad_game_sessions_region_length check (
    server_region is null or char_length(server_region) <= 60
  ),
  constraint squad_game_sessions_status_check check (
    status in ('ready_check', 'in_game', 'finished', 'cancelled')
  )
);

create unique index if not exists squad_game_sessions_one_active_idx
  on public.squad_game_sessions (squad_id)
  where status in ('ready_check', 'in_game');

create index if not exists squad_game_sessions_squad_created_idx
  on public.squad_game_sessions (squad_id, created_at desc);

create table if not exists public.squad_game_session_members (
  session_id uuid not null references public.squad_game_sessions(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  readiness text not null default 'not_ready',
  preferred_role text,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id),
  constraint squad_game_session_members_readiness_check check (
    readiness in ('not_ready', 'ready', 'away')
  ),
  constraint squad_game_session_members_role_length check (
    preferred_role is null or char_length(preferred_role) <= 40
  )
);

create index if not exists squad_game_session_members_squad_idx
  on public.squad_game_session_members (squad_id, session_id);

create index if not exists squad_game_session_members_user_idx
  on public.squad_game_session_members (user_id, updated_at desc);

create table if not exists public.squad_session_notifications (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  session_id uuid not null references public.squad_game_sessions(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint squad_session_notifications_kind_check check (
    kind in ('ready_check', 'session_started', 'session_finished', 'replay')
  ),
  constraint squad_session_notifications_title_length check (char_length(title) between 1 and 90),
  constraint squad_session_notifications_message_length check (char_length(message) between 1 and 240)
);

create index if not exists squad_session_notifications_recipient_idx
  on public.squad_session_notifications (recipient_id, read_at, created_at desc);

alter table public.squad_game_sessions enable row level security;
alter table public.squad_game_session_members enable row level security;
alter table public.squad_session_notifications enable row level security;

revoke all on public.squad_game_sessions from anon, authenticated;
revoke all on public.squad_game_session_members from anon, authenticated;
revoke all on public.squad_session_notifications from anon, authenticated;

grant select on public.squad_game_sessions to authenticated;
grant select on public.squad_game_session_members to authenticated;
grant select, update (read_at) on public.squad_session_notifications to authenticated;

create or replace function private.is_squad_member(
  requested_squad_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.squad_members sm
    where sm.squad_id = requested_squad_id
      and sm.user_id = requested_user_id
  );
$$;

create or replace function private.is_squad_owner(
  requested_squad_id uuid,
  requested_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.squads s
    where s.id = requested_squad_id
      and s.owner_id = requested_user_id
  );
$$;

revoke all on function private.is_squad_member(uuid, uuid) from public;
revoke all on function private.is_squad_owner(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_squad_member(uuid, uuid) to authenticated;
grant execute on function private.is_squad_owner(uuid, uuid) to authenticated;

drop policy if exists "squad members read game sessions" on public.squad_game_sessions;
create policy "squad members read game sessions"
on public.squad_game_sessions
for select
to authenticated
using (
  (select private.is_squad_member(squad_id, (select auth.uid())))
);

drop policy if exists "squad members read session states" on public.squad_game_session_members;
create policy "squad members read session states"
on public.squad_game_session_members
for select
to authenticated
using (
  (select private.is_squad_member(squad_id, (select auth.uid())))
);

drop policy if exists "users read own squad session notifications" on public.squad_session_notifications;
create policy "users read own squad session notifications"
on public.squad_session_notifications
for select
to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "users mark own squad session notifications" on public.squad_session_notifications;
create policy "users mark own squad session notifications"
on public.squad_session_notifications
for update
to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

create or replace function public.create_squad_game_session(
  p_squad_id uuid,
  p_game_id bigint,
  p_mode text,
  p_server_region text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_mode text := nullif(btrim(p_mode), '');
  v_region text := nullif(btrim(p_server_region), '');
  v_game_name text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.is_squad_owner(p_squad_id, v_user_id) then
    raise exception 'only_owner_can_create_session';
  end if;

  if v_mode is null or char_length(v_mode) > 60 then
    raise exception 'invalid_session_mode';
  end if;

  if v_region is not null and char_length(v_region) > 60 then
    raise exception 'invalid_server_region';
  end if;

  select g.name into v_game_name
  from public.games g
  where g.id = p_game_id;

  insert into public.squad_game_sessions (
    squad_id,
    game_id,
    mode,
    server_region,
    status,
    created_by
  )
  values (
    p_squad_id,
    p_game_id,
    v_mode,
    v_region,
    'ready_check',
    v_user_id
  )
  returning id into v_session_id;

  insert into public.squad_game_session_members (
    session_id,
    squad_id,
    user_id,
    readiness
  )
  select v_session_id, p_squad_id, sm.user_id, 'not_ready'
  from public.squad_members sm
  where sm.squad_id = p_squad_id
  on conflict (session_id, user_id) do nothing;

  insert into public.squad_session_notifications (
    squad_id,
    session_id,
    recipient_id,
    actor_id,
    kind,
    title,
    message
  )
  select
    p_squad_id,
    v_session_id,
    sm.user_id,
    v_user_id,
    'ready_check',
    'Nouvelle session de jeu',
    coalesce(v_game_name, 'Jeu à définir') || ' · ' || v_mode
  from public.squad_members sm
  where sm.squad_id = p_squad_id
    and sm.user_id <> v_user_id;

  return v_session_id;
exception
  when unique_violation then
    raise exception 'active_session_exists';
end;
$$;

create or replace function public.update_squad_game_session(
  p_session_id uuid,
  p_game_id bigint,
  p_mode text,
  p_server_region text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_status text;
  v_mode text := nullif(btrim(p_mode), '');
  v_region text := nullif(btrim(p_server_region), '');
begin
  select s.squad_id, s.status into v_squad_id, v_status
  from public.squad_game_sessions s
  where s.id = p_session_id;

  if v_squad_id is null then raise exception 'session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then
    raise exception 'only_owner_can_edit_session';
  end if;
  if v_status <> 'ready_check' then raise exception 'session_already_started'; end if;
  if v_mode is null or char_length(v_mode) > 60 then raise exception 'invalid_session_mode'; end if;
  if v_region is not null and char_length(v_region) > 60 then raise exception 'invalid_server_region'; end if;

  update public.squad_game_sessions
  set game_id = p_game_id,
      mode = v_mode,
      server_region = v_region,
      updated_at = now()
  where id = p_session_id;
end;
$$;

create or replace function public.set_squad_game_presence(
  p_session_id uuid,
  p_readiness text,
  p_preferred_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_status text;
  v_role text := nullif(btrim(p_preferred_role), '');
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_readiness not in ('not_ready', 'ready', 'away') then raise exception 'invalid_readiness'; end if;
  if v_role is not null and char_length(v_role) > 40 then raise exception 'invalid_preferred_role'; end if;

  select s.squad_id, s.status into v_squad_id, v_status
  from public.squad_game_sessions s
  where s.id = p_session_id;

  if v_squad_id is null then raise exception 'session_not_found'; end if;
  if v_status not in ('ready_check', 'in_game') then raise exception 'session_closed'; end if;
  if not private.is_squad_member(v_squad_id, v_user_id) then raise exception 'not_squad_member'; end if;

  insert into public.squad_game_session_members (
    session_id,
    squad_id,
    user_id,
    readiness,
    preferred_role,
    updated_at
  )
  values (
    p_session_id,
    v_squad_id,
    v_user_id,
    p_readiness,
    v_role,
    now()
  )
  on conflict (session_id, user_id) do update
  set readiness = excluded.readiness,
      preferred_role = excluded.preferred_role,
      updated_at = now();
end;
$$;

create or replace function public.start_squad_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_status text;
begin
  select s.squad_id, s.status into v_squad_id, v_status
  from public.squad_game_sessions s
  where s.id = p_session_id
  for update;

  if v_squad_id is null then raise exception 'session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then raise exception 'only_owner_can_start_session'; end if;
  if v_status <> 'ready_check' then raise exception 'session_not_ready_check'; end if;

  if exists (
    select 1
    from public.squad_members sm
    left join public.squad_game_session_members m
      on m.session_id = p_session_id
      and m.squad_id = sm.squad_id
      and m.user_id = sm.user_id
    where sm.squad_id = v_squad_id
      and coalesce(m.readiness, 'not_ready') = 'not_ready'
  ) then
    raise exception 'members_not_ready';
  end if;

  if not exists (
    select 1
    from public.squad_game_session_members m
    join public.squad_members sm
      on sm.squad_id = m.squad_id and sm.user_id = m.user_id
    where m.session_id = p_session_id
      and sm.squad_id = v_squad_id
      and m.readiness = 'ready'
  ) then
    raise exception 'no_ready_members';
  end if;

  update public.squad_game_sessions
  set status = 'in_game', started_at = now(), ended_at = null, updated_at = now()
  where id = p_session_id;

  insert into public.squad_session_notifications (
    squad_id, session_id, recipient_id, actor_id, kind, title, message
  )
  select
    v_squad_id,
    p_session_id,
    sm.user_id,
    v_user_id,
    'session_started',
    'La partie commence',
    'Ta squad vient de lancer la session.'
  from public.squad_members sm
  where sm.squad_id = v_squad_id
    and sm.user_id <> v_user_id;
end;
$$;

create or replace function public.finish_squad_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_status text;
begin
  select s.squad_id, s.status into v_squad_id, v_status
  from public.squad_game_sessions s
  where s.id = p_session_id
  for update;

  if v_squad_id is null then raise exception 'session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then raise exception 'only_owner_can_finish_session'; end if;
  if v_status <> 'in_game' then raise exception 'session_not_in_game'; end if;

  update public.squad_game_sessions
  set status = 'finished', ended_at = now(), updated_at = now()
  where id = p_session_id;

  insert into public.squad_session_notifications (
    squad_id, session_id, recipient_id, actor_id, kind, title, message
  )
  select
    v_squad_id,
    p_session_id,
    sm.user_id,
    v_user_id,
    'session_finished',
    'Partie terminée',
    'Le chef a terminé la session. Vous pouvez rejouer.'
  from public.squad_members sm
  where sm.squad_id = v_squad_id
    and sm.user_id <> v_user_id;
end;
$$;

create or replace function public.replay_squad_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_status text;
begin
  select s.squad_id, s.status into v_squad_id, v_status
  from public.squad_game_sessions s
  where s.id = p_session_id
  for update;

  if v_squad_id is null then raise exception 'session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then raise exception 'only_owner_can_replay_session'; end if;
  if v_status <> 'finished' then raise exception 'session_not_finished'; end if;

  update public.squad_game_sessions
  set status = 'ready_check', started_at = null, ended_at = null, updated_at = now()
  where id = p_session_id;

  insert into public.squad_game_session_members (
    session_id, squad_id, user_id, readiness, preferred_role, updated_at
  )
  select p_session_id, v_squad_id, sm.user_id, 'not_ready', null, now()
  from public.squad_members sm
  where sm.squad_id = v_squad_id
  on conflict (session_id, user_id) do update
  set readiness = 'not_ready',
      preferred_role = null,
      updated_at = now();

  insert into public.squad_session_notifications (
    squad_id, session_id, recipient_id, actor_id, kind, title, message
  )
  select
    v_squad_id,
    p_session_id,
    sm.user_id,
    v_user_id,
    'replay',
    'On relance ?',
    'Un nouveau ready-check vient de commencer.'
  from public.squad_members sm
  where sm.squad_id = v_squad_id
    and sm.user_id <> v_user_id;
exception
  when unique_violation then
    raise exception 'active_session_exists';
end;
$$;

create or replace function public.cancel_squad_game_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_status text;
begin
  select s.squad_id, s.status into v_squad_id, v_status
  from public.squad_game_sessions s
  where s.id = p_session_id
  for update;

  if v_squad_id is null then raise exception 'session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then raise exception 'only_owner_can_cancel_session'; end if;
  if v_status not in ('ready_check', 'finished') then raise exception 'cannot_cancel_running_session'; end if;

  update public.squad_game_sessions
  set status = 'cancelled', updated_at = now()
  where id = p_session_id;
end;
$$;

revoke all on function public.create_squad_game_session(uuid, bigint, text, text) from public;
revoke all on function public.update_squad_game_session(uuid, bigint, text, text) from public;
revoke all on function public.set_squad_game_presence(uuid, text, text) from public;
revoke all on function public.start_squad_game_session(uuid) from public;
revoke all on function public.finish_squad_game_session(uuid) from public;
revoke all on function public.replay_squad_game_session(uuid) from public;
revoke all on function public.cancel_squad_game_session(uuid) from public;

revoke all on function public.create_squad_game_session(uuid, bigint, text, text) from anon;
revoke all on function public.update_squad_game_session(uuid, bigint, text, text) from anon;
revoke all on function public.set_squad_game_presence(uuid, text, text) from anon;
revoke all on function public.start_squad_game_session(uuid) from anon;
revoke all on function public.finish_squad_game_session(uuid) from anon;
revoke all on function public.replay_squad_game_session(uuid) from anon;
revoke all on function public.cancel_squad_game_session(uuid) from anon;

grant execute on function public.create_squad_game_session(uuid, bigint, text, text) to authenticated;
grant execute on function public.update_squad_game_session(uuid, bigint, text, text) to authenticated;
grant execute on function public.set_squad_game_presence(uuid, text, text) to authenticated;
grant execute on function public.start_squad_game_session(uuid) to authenticated;
grant execute on function public.finish_squad_game_session(uuid) to authenticated;
grant execute on function public.replay_squad_game_session(uuid) to authenticated;
grant execute on function public.cancel_squad_game_session(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'squad_game_sessions'
  ) then
    alter publication supabase_realtime add table public.squad_game_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'squad_game_session_members'
  ) then
    alter publication supabase_realtime add table public.squad_game_session_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'squad_session_notifications'
  ) then
    alter publication supabase_realtime add table public.squad_session_notifications;
  end if;
end;
$$;

commit;
