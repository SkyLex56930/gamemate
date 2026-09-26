-- GameMate Companion — Step 8 / Recherche de groupe en direct
-- Tables LFG, candidatures, flux temps réel et raccordement aux squads.

create table if not exists public.lfg_posts_v8 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  platform_id bigint references public.platforms(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 4 and 80),
  description text check (description is null or char_length(description) <= 320),
  mode_text text check (mode_text is null or char_length(mode_text) <= 60),
  rank_text text check (rank_text is null or char_length(rank_text) <= 60),
  region text check (region is null or char_length(region) <= 60),
  mic_required boolean not null default false,
  crossplay_enabled boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_players smallint not null default 5 check (max_players between 2 and 12),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  squad_id uuid references public.squads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create table if not exists public.lfg_applications_v8 (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.lfg_posts_v8(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  message text check (message is null or char_length(message) <= 180),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (post_id, applicant_id)
);

create index if not exists lfg_posts_v8_feed_idx
  on public.lfg_posts_v8(status, game_id, expires_at desc, created_at desc);
create index if not exists lfg_posts_v8_owner_idx
  on public.lfg_posts_v8(owner_id, created_at desc);
create index if not exists lfg_posts_v8_game_idx
  on public.lfg_posts_v8(game_id);
create index if not exists lfg_posts_v8_platform_idx
  on public.lfg_posts_v8(platform_id) where platform_id is not null;
create index if not exists lfg_posts_v8_squad_idx
  on public.lfg_posts_v8(squad_id) where squad_id is not null;
create index if not exists lfg_applications_v8_post_status_idx
  on public.lfg_applications_v8(post_id, status, created_at);
create index if not exists lfg_applications_v8_applicant_idx
  on public.lfg_applications_v8(applicant_id, created_at desc);

alter table public.lfg_posts_v8 enable row level security;
alter table public.lfg_applications_v8 enable row level security;

drop policy if exists lfg_posts_v8_read on public.lfg_posts_v8;
create policy lfg_posts_v8_read
on public.lfg_posts_v8
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (
    not exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = owner_id)
         or (b.blocker_id = owner_id and b.blocked_id = (select auth.uid()))
    )
    and (
      status = 'open' and expires_at > now()
    )
  )
);

drop policy if exists lfg_applications_v8_read on public.lfg_applications_v8;
create policy lfg_applications_v8_read
on public.lfg_applications_v8
for select
to authenticated
using (
  applicant_id = (select auth.uid())
  or exists (
    select 1 from public.lfg_posts_v8 p
    where p.id = post_id and p.owner_id = (select auth.uid())
  )
);

revoke all on table public.lfg_posts_v8 from public, anon;
revoke all on table public.lfg_applications_v8 from public, anon;
revoke insert, update, delete on table public.lfg_posts_v8 from authenticated;
revoke insert, update, delete on table public.lfg_applications_v8 from authenticated;
grant select on table public.lfg_posts_v8 to authenticated;
grant select on table public.lfg_applications_v8 to authenticated;

drop function if exists public.get_lfg_feed_v8(bigint, text, integer);
create or replace function public.get_lfg_feed_v8(
  p_game_id bigint default null,
  p_scope text default 'all',
  p_limit integer default 60
)
returns table (
  post_id uuid,
  owner_id uuid,
  owner_display_name text,
  owner_username text,
  owner_avatar_url text,
  game_id bigint,
  game_name text,
  game_logo_url text,
  platform_id bigint,
  platform_name text,
  title text,
  description text,
  mode_text text,
  rank_text text,
  region text,
  mic_required boolean,
  crossplay_enabled boolean,
  starts_at timestamptz,
  expires_at timestamptz,
  post_status text,
  max_players integer,
  current_players integer,
  pending_count integer,
  application_state text,
  is_owner boolean,
  squad_id uuid,
  applications jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), 'all'));
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_scope not in ('all', 'mine', 'applications') then raise exception 'invalid_scope'; end if;

  update public.lfg_posts_v8 as expired_post
  set status = 'closed', updated_at = now()
  where expired_post.status = 'open' and expired_post.expires_at <= now();

  return query
  select
    p.id,
    p.owner_id,
    pr.display_name,
    pr.username,
    pr.avatar_url,
    p.game_id,
    g.name,
    g.logo_url,
    p.platform_id,
    pl.name,
    p.title,
    p.description,
    p.mode_text,
    p.rank_text,
    p.region,
    p.mic_required,
    p.crossplay_enabled,
    p.starts_at,
    p.expires_at,
    p.status,
    p.max_players::integer,
    (1 + (select count(*) from public.lfg_applications_v8 ac where ac.post_id = p.id and ac.status = 'accepted'))::integer,
    (case when p.owner_id = v_uid then (select count(*) from public.lfg_applications_v8 ap where ap.post_id = p.id and ap.status = 'pending') else 0 end)::integer,
    coalesce((select av.status from public.lfg_applications_v8 av where av.post_id = p.id and av.applicant_id = v_uid), 'none')::text,
    p.owner_id = v_uid,
    p.squad_id,
    case when p.owner_id = v_uid then coalesce((
      select jsonb_agg(jsonb_build_object(
        'application_id', a.id,
        'applicant_id', a.applicant_id,
        'display_name', applicant.display_name,
        'username', applicant.username,
        'avatar_url', applicant.avatar_url,
        'message', a.message,
        'status', a.status,
        'created_at', a.created_at
      ) order by case a.status when 'pending' then 0 when 'accepted' then 1 else 2 end, a.created_at)
      from public.lfg_applications_v8 a
      left join public.profiles applicant on applicant.id = a.applicant_id
      where a.post_id = p.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    p.created_at
  from public.lfg_posts_v8 p
  join public.games g on g.id = p.game_id
  left join public.platforms pl on pl.id = p.platform_id
  left join public.profiles pr on pr.id = p.owner_id
  where (p_game_id is null or p.game_id = p_game_id)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = p.owner_id)
         or (b.blocker_id = p.owner_id and b.blocked_id = v_uid)
    )
    and (
      (v_scope = 'all' and p.status = 'open' and p.expires_at > now())
      or (v_scope = 'mine' and p.owner_id = v_uid)
      or (v_scope = 'applications' and exists (
        select 1 from public.lfg_applications_v8 mine
        where mine.post_id = p.id and mine.applicant_id = v_uid
      ))
    )
  order by
    case when p.starts_at <= now() + interval '30 minutes' then 0 else 1 end,
    p.starts_at,
    p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100));
end;
$$;

create or replace function public.create_lfg_post_v8(
  p_game_id bigint,
  p_platform_id bigint default null,
  p_title text default null,
  p_description text default null,
  p_mode_text text default null,
  p_rank_text text default null,
  p_region text default null,
  p_mic_required boolean default false,
  p_crossplay_enabled boolean default true,
  p_starts_at timestamptz default null,
  p_duration_minutes integer default 120,
  p_max_players integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_start timestamptz := coalesce(p_starts_at, now());
  v_squad public.squads%rowtype;
  v_squad_id uuid;
  v_member_count integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_game_id is null or not exists (select 1 from public.games where id = p_game_id and coalesce(is_active, true)) then raise exception 'invalid_game'; end if;
  if not exists (
    select 1 from public.user_games ug
    where ug.user_id = v_uid and ug.game_id = p_game_id
      and (p_platform_id is null or ug.platform_id = p_platform_id)
  ) then raise exception 'game_not_configured'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 4 and 80 then raise exception 'invalid_title'; end if;
  if p_max_players not between 2 and 12 then raise exception 'invalid_max_players'; end if;
  if p_duration_minutes not between 15 and 1440 then raise exception 'invalid_duration'; end if;
  if v_start < now() - interval '15 minutes' or v_start > now() + interval '30 days' then raise exception 'invalid_start_time'; end if;
  if exists (
    select 1 from public.lfg_posts_v8
    where owner_id = v_uid and game_id = p_game_id and status = 'open' and expires_at > now()
  ) then raise exception 'active_post_exists_for_game'; end if;

  select s.* into v_squad
  from public.squads s
  join public.squad_members sm on sm.squad_id = s.id
  where sm.user_id = v_uid and s.status = 'temporary'
  order by s.created_at desc
  limit 1;

  if found then
    if v_squad.owner_id <> v_uid then raise exception 'only_squad_owner_can_publish'; end if;
    select count(*)::integer into v_member_count from public.squad_members where squad_id = v_squad.id;
    if p_max_players < v_member_count then raise exception 'max_players_below_current_squad'; end if;
    update public.squads
    set game_id = p_game_id, max_members = p_max_players, updated_at = now()
    where id = v_squad.id;
    v_squad_id := v_squad.id;
  end if;

  insert into public.lfg_posts_v8(
    owner_id, game_id, platform_id, title, description, mode_text, rank_text, region,
    mic_required, crossplay_enabled, starts_at, expires_at, max_players, squad_id
  ) values (
    v_uid,
    p_game_id,
    p_platform_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_mode_text, '')), ''),
    nullif(btrim(coalesce(p_rank_text, '')), ''),
    nullif(btrim(coalesce(p_region, '')), ''),
    coalesce(p_mic_required, false),
    coalesce(p_crossplay_enabled, true),
    v_start,
    v_start + make_interval(mins => p_duration_minutes),
    p_max_players,
    v_squad_id
  ) returning id into v_id;

  return jsonb_build_object('status', 'created', 'post_id', v_id, 'squad_id', v_squad_id);
end;
$$;

create or replace function public.apply_lfg_post_v8(
  p_post_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.lfg_posts_v8%rowtype;
  v_id uuid;
  v_accepted integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_post from public.lfg_posts_v8 where id = p_post_id for update;
  if not found then raise exception 'post_not_found'; end if;
  if v_post.owner_id = v_uid then raise exception 'cannot_apply_to_own_post'; end if;
  if v_post.status <> 'open' or v_post.expires_at <= now() then raise exception 'post_closed'; end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_uid and blocked_id = v_post.owner_id)
       or (blocker_id = v_post.owner_id and blocked_id = v_uid)
  ) then raise exception 'user_blocked'; end if;
  if exists (
    select 1 from public.squad_members sm
    join public.squads s on s.id = sm.squad_id
    where sm.user_id = v_uid and s.status = 'temporary'
  ) then raise exception 'already_in_active_squad'; end if;
  select count(*)::integer into v_accepted from public.lfg_applications_v8 where post_id = v_post.id and status = 'accepted';
  if 1 + v_accepted >= v_post.max_players then raise exception 'post_full'; end if;

  insert into public.lfg_applications_v8(post_id, applicant_id, message, status, created_at, responded_at)
  values(v_post.id, v_uid, nullif(btrim(coalesce(p_message, '')), ''), 'pending', now(), null)
  on conflict (post_id, applicant_id) do update
  set message = excluded.message,
      status = case when public.lfg_applications_v8.status = 'accepted' then 'accepted' else 'pending' end,
      created_at = case when public.lfg_applications_v8.status = 'accepted' then public.lfg_applications_v8.created_at else now() end,
      responded_at = case when public.lfg_applications_v8.status = 'accepted' then public.lfg_applications_v8.responded_at else null end
  returning id into v_id;

  return jsonb_build_object('status', 'pending', 'application_id', v_id);
end;
$$;

create or replace function public.cancel_lfg_application_v8(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  update public.lfg_applications_v8
  set status = 'cancelled', responded_at = now()
  where post_id = p_post_id and applicant_id = v_uid and status = 'pending';
  if not found then raise exception 'pending_application_not_found'; end if;
  return jsonb_build_object('status', 'cancelled');
end;
$$;

create or replace function public.respond_lfg_application_v8(
  p_application_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.lfg_applications_v8%rowtype;
  v_post public.lfg_posts_v8%rowtype;
  v_squad public.squads%rowtype;
  v_squad_id uuid;
  v_member_count integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_app from public.lfg_applications_v8 where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  select * into v_post from public.lfg_posts_v8 where id = v_app.post_id for update;
  if v_post.owner_id <> v_uid then raise exception 'not_post_owner'; end if;
  if v_app.status <> 'pending' then raise exception 'application_already_processed'; end if;

  if not coalesce(p_accept, false) then
    update public.lfg_applications_v8 set status = 'declined', responded_at = now() where id = v_app.id;
    return jsonb_build_object('status', 'declined', 'post_id', v_post.id);
  end if;

  if v_post.status <> 'open' or v_post.expires_at <= now() then raise exception 'post_closed'; end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_uid and blocked_id = v_app.applicant_id)
       or (blocker_id = v_app.applicant_id and blocked_id = v_uid)
  ) then raise exception 'user_blocked'; end if;
  if exists (
    select 1 from public.squad_members sm
    join public.squads s on s.id = sm.squad_id
    where sm.user_id = v_app.applicant_id and s.status = 'temporary'
  ) then raise exception 'applicant_already_in_squad'; end if;

  if v_post.squad_id is not null then
    select * into v_squad from public.squads where id = v_post.squad_id and status = 'temporary' for update;
    if not found or v_squad.owner_id <> v_uid then raise exception 'linked_squad_unavailable'; end if;
    v_squad_id := v_squad.id;
  else
    if exists (
      select 1 from public.squad_members sm
      join public.squads s on s.id = sm.squad_id
      where sm.user_id = v_uid and s.status = 'temporary'
    ) then raise exception 'owner_already_in_another_squad'; end if;

    insert into public.squads(owner_id, game_id, status, name, description, max_members)
    values(v_uid, v_post.game_id, 'temporary', left(v_post.title, 40), v_post.description, v_post.max_players)
    returning * into v_squad;
    v_squad_id := v_squad.id;
    insert into public.squad_members(squad_id, user_id, role) values(v_squad_id, v_uid, 'owner');
    insert into public.squad_channels(squad_id, name, position, is_default, created_by, channel_type)
    values(v_squad_id, 'Général', 0, true, v_uid, 'text');
    update public.lfg_posts_v8 set squad_id = v_squad_id, updated_at = now() where id = v_post.id;
  end if;

  select count(*)::integer into v_member_count from public.squad_members where squad_id = v_squad_id;
  if v_member_count >= least(v_post.max_players, v_squad.max_members) then raise exception 'post_full'; end if;

  insert into public.squad_members(squad_id, user_id, role)
  values(v_squad_id, v_app.applicant_id, 'member');
  update public.lfg_applications_v8 set status = 'accepted', responded_at = now() where id = v_app.id;

  v_member_count := v_member_count + 1;
  if v_member_count >= least(v_post.max_players, v_squad.max_members) then
    update public.lfg_posts_v8 set status = 'closed', updated_at = now() where id = v_post.id;
    update public.lfg_applications_v8
    set status = 'declined', responded_at = now()
    where post_id = v_post.id and status = 'pending';
  end if;

  return jsonb_build_object(
    'status', 'accepted',
    'post_id', v_post.id,
    'squad_id', v_squad_id,
    'current_players', v_member_count,
    'is_full', v_member_count >= least(v_post.max_players, v_squad.max_members)
  );
end;
$$;

create or replace function public.close_lfg_post_v8(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  update public.lfg_posts_v8
  set status = 'cancelled', updated_at = now()
  where id = p_post_id and owner_id = v_uid and status = 'open';
  if not found then raise exception 'open_post_not_found'; end if;
  update public.lfg_applications_v8
  set status = 'declined', responded_at = now()
  where post_id = p_post_id and status = 'pending';
  return jsonb_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.get_lfg_feed_v8(bigint, text, integer) from public, anon;
revoke all on function public.create_lfg_post_v8(bigint, bigint, text, text, text, text, text, boolean, boolean, timestamptz, integer, integer) from public, anon;
revoke all on function public.apply_lfg_post_v8(uuid, text) from public, anon;
revoke all on function public.cancel_lfg_application_v8(uuid) from public, anon;
revoke all on function public.respond_lfg_application_v8(uuid, boolean) from public, anon;
revoke all on function public.close_lfg_post_v8(uuid) from public, anon;

grant execute on function public.get_lfg_feed_v8(bigint, text, integer) to authenticated;
grant execute on function public.create_lfg_post_v8(bigint, bigint, text, text, text, text, text, boolean, boolean, timestamptz, integer, integer) to authenticated;
grant execute on function public.apply_lfg_post_v8(uuid, text) to authenticated;
grant execute on function public.cancel_lfg_application_v8(uuid) to authenticated;
grant execute on function public.respond_lfg_application_v8(uuid, boolean) to authenticated;
grant execute on function public.close_lfg_post_v8(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lfg_posts_v8'
    ) then
      alter publication supabase_realtime add table public.lfg_posts_v8;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lfg_applications_v8'
    ) then
      alter publication supabase_realtime add table public.lfg_applications_v8;
    end if;
  end if;
end;
$$;
