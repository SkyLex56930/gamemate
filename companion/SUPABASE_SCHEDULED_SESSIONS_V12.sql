-- GameMate Companion V12 — sessions de jeu planifiées
-- À exécuter après SUPABASE_GAME_SESSIONS_V11.sql.

begin;

create table if not exists public.squad_scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  game_id bigint references public.games(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  mode text not null,
  server_region text,
  starts_at timestamptz not null,
  duration_minutes integer not null default 120,
  max_players integer not null default 6,
  notes text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint squad_scheduled_sessions_title_length check (char_length(title) between 3 and 80),
  constraint squad_scheduled_sessions_mode_length check (char_length(mode) between 1 and 60),
  constraint squad_scheduled_sessions_region_length check (server_region is null or char_length(server_region) <= 60),
  constraint squad_scheduled_sessions_duration_check check (duration_minutes between 30 and 480),
  constraint squad_scheduled_sessions_players_check check (max_players between 2 and 12),
  constraint squad_scheduled_sessions_notes_length check (notes is null or char_length(notes) <= 500),
  constraint squad_scheduled_sessions_status_check check (status in ('scheduled', 'cancelled', 'completed'))
);

create index if not exists squad_scheduled_sessions_upcoming_idx
  on public.squad_scheduled_sessions (squad_id, starts_at)
  where status = 'scheduled';

create table if not exists public.squad_scheduled_session_responses (
  session_id uuid not null references public.squad_scheduled_sessions(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id),
  constraint squad_scheduled_session_response_check check (response in ('going', 'maybe', 'declined'))
);

create index if not exists squad_scheduled_session_responses_squad_idx
  on public.squad_scheduled_session_responses (squad_id, session_id);

create table if not exists public.squad_scheduled_session_notifications (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  scheduled_session_id uuid not null references public.squad_scheduled_sessions(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint squad_scheduled_notification_kind_check check (kind in ('scheduled_created', 'scheduled_updated', 'scheduled_cancelled')),
  constraint squad_scheduled_notification_title_length check (char_length(title) between 1 and 90),
  constraint squad_scheduled_notification_message_length check (char_length(message) between 1 and 240)
);

create index if not exists squad_scheduled_notifications_recipient_idx
  on public.squad_scheduled_session_notifications (recipient_id, read_at, created_at desc);

alter table public.squad_scheduled_sessions enable row level security;
alter table public.squad_scheduled_session_responses enable row level security;
alter table public.squad_scheduled_session_notifications enable row level security;

revoke all on public.squad_scheduled_sessions from public, anon, authenticated;
revoke all on public.squad_scheduled_session_responses from public, anon, authenticated;
revoke all on public.squad_scheduled_session_notifications from public, anon, authenticated;

grant select on public.squad_scheduled_sessions to authenticated;
grant select on public.squad_scheduled_session_responses to authenticated;
grant select, update (read_at) on public.squad_scheduled_session_notifications to authenticated;

drop policy if exists "squad members read scheduled sessions" on public.squad_scheduled_sessions;
create policy "squad members read scheduled sessions"
on public.squad_scheduled_sessions for select to authenticated
using ((select private.is_squad_member(squad_id, (select auth.uid()))));

drop policy if exists "squad members read scheduled responses" on public.squad_scheduled_session_responses;
create policy "squad members read scheduled responses"
on public.squad_scheduled_session_responses for select to authenticated
using ((select private.is_squad_member(squad_id, (select auth.uid()))));

drop policy if exists "users read own scheduled notifications" on public.squad_scheduled_session_notifications;
create policy "users read own scheduled notifications"
on public.squad_scheduled_session_notifications for select to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "users mark own scheduled notifications" on public.squad_scheduled_session_notifications;
create policy "users mark own scheduled notifications"
on public.squad_scheduled_session_notifications for update to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

create or replace function public.get_my_scheduled_sessions_v12(
  p_squad_id uuid default null,
  p_limit integer default 12
)
returns table (
  session_id uuid,
  squad_id uuid,
  squad_name text,
  game_id bigint,
  game_name text,
  title text,
  mode text,
  server_region text,
  starts_at timestamptz,
  duration_minutes integer,
  max_players integer,
  notes text,
  status text,
  created_by uuid,
  going_count bigint,
  maybe_count bigint,
  my_response text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ss.id,
    ss.squad_id,
    s.name,
    ss.game_id,
    g.name,
    ss.title,
    ss.mode,
    ss.server_region,
    ss.starts_at,
    ss.duration_minutes,
    ss.max_players,
    ss.notes,
    ss.status,
    ss.created_by,
    (select count(*) from public.squad_scheduled_session_responses r where r.session_id = ss.id and r.response = 'going'),
    (select count(*) from public.squad_scheduled_session_responses r where r.session_id = ss.id and r.response = 'maybe'),
    (select r.response from public.squad_scheduled_session_responses r where r.session_id = ss.id and r.user_id = (select auth.uid())),
    ss.created_at,
    ss.updated_at
  from public.squad_scheduled_sessions ss
  join public.squads s on s.id = ss.squad_id
  left join public.games g on g.id = ss.game_id
  where (p_squad_id is null or ss.squad_id = p_squad_id)
    and ss.status = 'scheduled'
    and ss.starts_at >= now() - interval '4 hours'
  order by ss.starts_at asc
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

create or replace function public.create_scheduled_session_v12(
  p_squad_id uuid,
  p_game_id bigint,
  p_title text,
  p_mode text,
  p_server_region text,
  p_starts_at timestamptz,
  p_duration_minutes integer default 120,
  p_max_players integer default 6,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_title text := nullif(btrim(p_title), '');
  v_mode text := nullif(btrim(p_mode), '');
  v_region text := nullif(btrim(p_server_region), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_game_name text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not private.is_squad_owner(p_squad_id, v_user_id) then raise exception 'only_owner_can_schedule'; end if;
  if v_title is null or char_length(v_title) not between 3 and 80 then raise exception 'invalid_title'; end if;
  if v_mode is null or char_length(v_mode) > 60 then raise exception 'invalid_mode'; end if;
  if v_region is not null and char_length(v_region) > 60 then raise exception 'invalid_region'; end if;
  if v_notes is not null and char_length(v_notes) > 500 then raise exception 'invalid_notes'; end if;
  if p_starts_at <= now() + interval '5 minutes' then raise exception 'invalid_start_time'; end if;
  if p_duration_minutes not between 30 and 480 then raise exception 'invalid_duration'; end if;
  if p_max_players not between 2 and 12 then raise exception 'invalid_max_players'; end if;

  select g.name into v_game_name from public.games g where g.id = p_game_id;

  insert into public.squad_scheduled_sessions (
    squad_id, game_id, created_by, title, mode, server_region, starts_at,
    duration_minutes, max_players, notes
  ) values (
    p_squad_id, p_game_id, v_user_id, v_title, v_mode, v_region, p_starts_at,
    p_duration_minutes, p_max_players, v_notes
  ) returning id into v_session_id;

  insert into public.squad_scheduled_session_responses (session_id, squad_id, user_id, response)
  values (v_session_id, p_squad_id, v_user_id, 'going');

  insert into public.squad_scheduled_session_notifications (
    squad_id, scheduled_session_id, recipient_id, actor_id, kind, title, message
  )
  select p_squad_id, v_session_id, sm.user_id, v_user_id, 'scheduled_created',
    'Nouvelle session planifiée',
    left(v_title || ' · ' || coalesce(v_game_name, 'Jeu à définir'), 240)
  from public.squad_members sm
  where sm.squad_id = p_squad_id and sm.user_id <> v_user_id;

  return v_session_id;
end;
$$;

create or replace function public.respond_scheduled_session_v12(
  p_session_id uuid,
  p_response text
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
  v_starts_at timestamptz;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_response not in ('going', 'maybe', 'declined') then raise exception 'invalid_response'; end if;

  select ss.squad_id, ss.status, ss.starts_at into v_squad_id, v_status, v_starts_at
  from public.squad_scheduled_sessions ss where ss.id = p_session_id;

  if v_squad_id is null then raise exception 'scheduled_session_not_found'; end if;
  if not private.is_squad_member(v_squad_id, v_user_id) then raise exception 'not_squad_member'; end if;
  if v_status <> 'scheduled' or v_starts_at < now() - interval '4 hours' then raise exception 'scheduled_session_closed'; end if;

  insert into public.squad_scheduled_session_responses (
    session_id, squad_id, user_id, response, updated_at
  ) values (
    p_session_id, v_squad_id, v_user_id, p_response, now()
  )
  on conflict (session_id, user_id) do update
  set response = excluded.response, updated_at = now();
end;
$$;

create or replace function public.update_scheduled_session_v12(
  p_session_id uuid,
  p_game_id bigint,
  p_title text,
  p_mode text,
  p_server_region text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_max_players integer,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_title text := nullif(btrim(p_title), '');
  v_mode text := nullif(btrim(p_mode), '');
  v_region text := nullif(btrim(p_server_region), '');
  v_notes text := nullif(btrim(p_notes), '');
begin
  select ss.squad_id into v_squad_id from public.squad_scheduled_sessions ss
  where ss.id = p_session_id and ss.status = 'scheduled' for update;

  if v_squad_id is null then raise exception 'scheduled_session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then raise exception 'only_owner_can_edit_schedule'; end if;
  if v_title is null or char_length(v_title) not between 3 and 80 then raise exception 'invalid_title'; end if;
  if v_mode is null or char_length(v_mode) > 60 then raise exception 'invalid_mode'; end if;
  if v_region is not null and char_length(v_region) > 60 then raise exception 'invalid_region'; end if;
  if v_notes is not null and char_length(v_notes) > 500 then raise exception 'invalid_notes'; end if;
  if p_starts_at <= now() + interval '5 minutes' then raise exception 'invalid_start_time'; end if;
  if p_duration_minutes not between 30 and 480 then raise exception 'invalid_duration'; end if;
  if p_max_players not between 2 and 12 then raise exception 'invalid_max_players'; end if;

  update public.squad_scheduled_sessions
  set game_id = p_game_id, title = v_title, mode = v_mode, server_region = v_region,
      starts_at = p_starts_at, duration_minutes = p_duration_minutes,
      max_players = p_max_players, notes = v_notes, updated_at = now()
  where id = p_session_id;

  insert into public.squad_scheduled_session_notifications (
    squad_id, scheduled_session_id, recipient_id, actor_id, kind, title, message
  )
  select v_squad_id, p_session_id, sm.user_id, v_user_id, 'scheduled_updated',
    'Session mise à jour', left(v_title || ' · vérifie la nouvelle date et les détails.', 240)
  from public.squad_members sm
  where sm.squad_id = v_squad_id and sm.user_id <> v_user_id;
end;
$$;

create or replace function public.cancel_scheduled_session_v12(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_squad_id uuid;
  v_title text;
begin
  select ss.squad_id, ss.title into v_squad_id, v_title
  from public.squad_scheduled_sessions ss
  where ss.id = p_session_id and ss.status = 'scheduled' for update;

  if v_squad_id is null then raise exception 'scheduled_session_not_found'; end if;
  if not private.is_squad_owner(v_squad_id, v_user_id) then raise exception 'only_owner_can_cancel_schedule'; end if;

  update public.squad_scheduled_sessions
  set status = 'cancelled', updated_at = now()
  where id = p_session_id;

  insert into public.squad_scheduled_session_notifications (
    squad_id, scheduled_session_id, recipient_id, actor_id, kind, title, message
  )
  select v_squad_id, p_session_id, sm.user_id, v_user_id, 'scheduled_cancelled',
    'Session annulée', left(v_title || ' a été annulée.', 240)
  from public.squad_members sm
  where sm.squad_id = v_squad_id and sm.user_id <> v_user_id;
end;
$$;

revoke all on function public.get_my_scheduled_sessions_v12(uuid, integer) from public, anon;
revoke all on function public.create_scheduled_session_v12(uuid, bigint, text, text, text, timestamptz, integer, integer, text) from public, anon;
revoke all on function public.respond_scheduled_session_v12(uuid, text) from public, anon;
revoke all on function public.update_scheduled_session_v12(uuid, bigint, text, text, text, timestamptz, integer, integer, text) from public, anon;
revoke all on function public.cancel_scheduled_session_v12(uuid) from public, anon;

grant execute on function public.get_my_scheduled_sessions_v12(uuid, integer) to authenticated;
grant execute on function public.create_scheduled_session_v12(uuid, bigint, text, text, text, timestamptz, integer, integer, text) to authenticated;
grant execute on function public.respond_scheduled_session_v12(uuid, text) to authenticated;
grant execute on function public.update_scheduled_session_v12(uuid, bigint, text, text, text, timestamptz, integer, integer, text) to authenticated;
grant execute on function public.cancel_scheduled_session_v12(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squad_scheduled_sessions'
  ) then alter publication supabase_realtime add table public.squad_scheduled_sessions; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squad_scheduled_session_responses'
  ) then alter publication supabase_realtime add table public.squad_scheduled_session_responses; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squad_scheduled_session_notifications'
  ) then alter publication supabase_realtime add table public.squad_scheduled_session_notifications; end if;
end;
$$;

commit;
