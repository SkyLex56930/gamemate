-- GameMate Companion V5 — hub de session privé
-- Dépend de SUPABASE_GAME_SESSIONS_V11.sql.

begin;

create table if not exists public.session_player_favorites (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, player_user_id),
  constraint session_player_favorites_not_self check (owner_user_id <> player_user_id)
);

create index if not exists session_player_favorites_owner_created_idx
  on public.session_player_favorites (owner_user_id, created_at desc);

alter table public.session_player_favorites enable row level security;
revoke all on public.session_player_favorites from anon, authenticated;
grant select on public.session_player_favorites to authenticated;

drop policy if exists "users read own session favorites"
  on public.session_player_favorites;
create policy "users read own session favorites"
on public.session_player_favorites
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create or replace function public.get_session_hub(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session jsonb;
  v_players jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.squad_game_session_members member
    where member.session_id = p_session_id
      and member.user_id = v_user_id
  ) then
    raise exception 'session_access_denied';
  end if;

  select jsonb_build_object(
    'id', session.id,
    'squad_id', session.squad_id,
    'game_id', session.game_id,
    'game_name', game.name,
    'mode', session.mode,
    'server_region', session.server_region,
    'status', session.status,
    'started_at', session.started_at,
    'ended_at', session.ended_at,
    'duration_seconds', case
      when session.started_at is null then null
      else greatest(
        0,
        floor(extract(epoch from (coalesce(session.ended_at, now()) - session.started_at)))::integer
      )
    end
  )
  into v_session
  from public.squad_game_sessions session
  left join public.games game on game.id = session.game_id
  where session.id = p_session_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', member.user_id,
      'display_name', profile.display_name,
      'username', profile.username,
      'avatar_url', profile.avatar_url,
      'preferred_role', member.preferred_role,
      'readiness', member.readiness,
      'is_favorite', favorite.player_user_id is not null,
      'friendship_status', case
        when friendship.status = 'accepted' then 'accepted'
        when friendship.status = 'pending' and friendship.requester_id = v_user_id then 'pending_outgoing'
        when friendship.status = 'pending' then 'pending_incoming'
        else 'none'
      end
    )
    order by case when member.user_id = v_user_id then 0 else 1 end,
             lower(coalesce(profile.display_name, profile.username, ''))
  ), '[]'::jsonb)
  into v_players
  from public.squad_game_session_members member
  join public.profiles profile on profile.id = member.user_id
  left join public.session_player_favorites favorite
    on favorite.owner_user_id = v_user_id
   and favorite.player_user_id = member.user_id
  left join lateral (
    select relation.requester_id, relation.status
    from public.friendships relation
    where (relation.requester_id = v_user_id and relation.addressee_id = member.user_id)
       or (relation.addressee_id = v_user_id and relation.requester_id = member.user_id)
    order by relation.created_at desc
    limit 1
  ) friendship on true
  where member.session_id = p_session_id;

  return jsonb_build_object(
    'session', coalesce(v_session, '{}'::jsonb),
    'players', v_players
  );
end;
$$;

create or replace function public.set_session_player_favorite(
  p_session_id uuid,
  p_player_user_id uuid,
  p_favorite boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if p_player_user_id = v_user_id then
    raise exception 'cannot_favorite_self';
  end if;
  if not exists (
    select 1
    from public.squad_game_session_members mine
    join public.squad_game_session_members teammate
      on teammate.session_id = mine.session_id
    where mine.session_id = p_session_id
      and mine.user_id = v_user_id
      and teammate.user_id = p_player_user_id
  ) then
    raise exception 'player_not_in_shared_session';
  end if;

  if p_favorite then
    insert into public.session_player_favorites (owner_user_id, player_user_id)
    values (v_user_id, p_player_user_id)
    on conflict (owner_user_id, player_user_id) do nothing;
  else
    delete from public.session_player_favorites
    where owner_user_id = v_user_id
      and player_user_id = p_player_user_id;
  end if;

  return p_favorite;
end;
$$;

create or replace function public.get_my_recent_game_sessions(p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_sessions jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(history) order by history.created_at desc), '[]'::jsonb)
  into v_sessions
  from (
    select
      session.id,
      session.squad_id,
      game.name as game_name,
      session.mode,
      session.server_region,
      session.status,
      session.created_at,
      session.started_at,
      session.ended_at,
      case
        when session.started_at is null then null
        else greatest(
          0,
          floor(extract(epoch from (coalesce(session.ended_at, now()) - session.started_at)))::integer
        )
      end as duration_seconds,
      (
        select count(*)::integer
        from public.squad_game_session_members participant
        where participant.session_id = session.id
      ) as player_count
    from public.squad_game_sessions session
    join public.squad_game_session_members mine
      on mine.session_id = session.id
     and mine.user_id = v_user_id
    left join public.games game on game.id = session.game_id
    where session.status in ('finished', 'cancelled')
    order by session.created_at desc
    limit v_limit
  ) history;

  return v_sessions;
end;
$$;

revoke all on function public.get_session_hub(uuid) from public;
revoke all on function public.set_session_player_favorite(uuid, uuid, boolean) from public;
revoke all on function public.get_my_recent_game_sessions(integer) from public;
revoke all on function public.get_session_hub(uuid) from anon;
revoke all on function public.set_session_player_favorite(uuid, uuid, boolean) from anon;
revoke all on function public.get_my_recent_game_sessions(integer) from anon;

grant execute on function public.get_session_hub(uuid) to authenticated;
grant execute on function public.set_session_player_favorite(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_my_recent_game_sessions(integer) to authenticated;

commit;
