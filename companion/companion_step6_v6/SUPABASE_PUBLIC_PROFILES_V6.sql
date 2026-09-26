-- GameMate Companion — Etape 6 / Profils joueurs publics
-- A executer dans le projet Supabase GameMate avant d'utiliser l'interface V6.

begin;

create table if not exists public.profile_privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_bio boolean not null default true,
  show_region boolean not null default true,
  show_language boolean not null default true,
  show_games boolean not null default true,
  show_gaming_dna boolean not null default true,
  show_looking_for boolean not null default true,
  allow_friend_requests boolean not null default true,
  allow_squad_invites boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profile_privacy_settings enable row level security;

drop policy if exists "profile_privacy_select_own" on public.profile_privacy_settings;
create policy "profile_privacy_select_own"
on public.profile_privacy_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "profile_privacy_insert_own" on public.profile_privacy_settings;
create policy "profile_privacy_insert_own"
on public.profile_privacy_settings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "profile_privacy_update_own" on public.profile_privacy_settings;
create policy "profile_privacy_update_own"
on public.profile_privacy_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.profile_privacy_settings from public, anon, authenticated;

create or replace function public.get_my_profile_privacy()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.profile_privacy_settings%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  insert into public.profile_privacy_settings (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_row
  from public.profile_privacy_settings
  where user_id = v_user_id;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_my_profile_privacy(
  p_show_bio boolean,
  p_show_region boolean,
  p_show_language boolean,
  p_show_games boolean,
  p_show_gaming_dna boolean,
  p_show_looking_for boolean,
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
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  insert into public.profile_privacy_settings (
    user_id,
    show_bio,
    show_region,
    show_language,
    show_games,
    show_gaming_dna,
    show_looking_for,
    allow_friend_requests,
    allow_squad_invites,
    updated_at
  ) values (
    v_user_id,
    coalesce(p_show_bio, true),
    coalesce(p_show_region, true),
    coalesce(p_show_language, true),
    coalesce(p_show_games, true),
    coalesce(p_show_gaming_dna, true),
    coalesce(p_show_looking_for, true),
    coalesce(p_allow_friend_requests, true),
    coalesce(p_allow_squad_invites, true),
    now()
  )
  on conflict (user_id) do update set
    show_bio = excluded.show_bio,
    show_region = excluded.show_region,
    show_language = excluded.show_language,
    show_games = excluded.show_games,
    show_gaming_dna = excluded.show_gaming_dna,
    show_looking_for = excluded.show_looking_for,
    allow_friend_requests = excluded.allow_friend_requests,
    allow_squad_invites = excluded.allow_squad_invites,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.get_public_player_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_profile jsonb;
  v_games jsonb := '[]'::jsonb;
  v_dna jsonb := '[]'::jsonb;
  v_looking_for jsonb := '[]'::jsonb;
  v_friendship public.friendships%rowtype;
  v_show_bio boolean := true;
  v_show_region boolean := true;
  v_show_language boolean := true;
  v_show_games boolean := true;
  v_show_gaming_dna boolean := true;
  v_show_looking_for boolean := true;
  v_allow_friend_requests boolean := true;
  v_allow_squad_invites boolean := true;
  v_blocked_by_me boolean := false;
  v_blocked_me boolean := false;
  v_squad_id uuid;
  v_squad_game_id bigint;
  v_viewer_squad_owner boolean := false;
  v_target_in_squad boolean := false;
  v_squad_invite_pending boolean := false;
  v_friendship_state text := 'none';
begin
  if v_viewer is null then
    raise exception 'authentication_required';
  end if;
  if p_user_id is null then
    raise exception 'profile_required';
  end if;

  select
    coalesce(s.show_bio, true),
    coalesce(s.show_region, true),
    coalesce(s.show_language, true),
    coalesce(s.show_games, true),
    coalesce(s.show_gaming_dna, true),
    coalesce(s.show_looking_for, true),
    coalesce(s.allow_friend_requests, true),
    coalesce(s.allow_squad_invites, true)
  into
    v_show_bio,
    v_show_region,
    v_show_language,
    v_show_games,
    v_show_gaming_dna,
    v_show_looking_for,
    v_allow_friend_requests,
    v_allow_squad_invites
  from public.profile_privacy_settings s
  where s.user_id = p_user_id;

  if not found then
    v_show_bio := true;
    v_show_region := true;
    v_show_language := true;
    v_show_games := true;
    v_show_gaming_dna := true;
    v_show_looking_for := true;
    v_allow_friend_requests := true;
    v_allow_squad_invites := true;
  end if;

  select exists (
    select 1 from public.user_blocks b
    where b.blocker_id = v_viewer and b.blocked_id = p_user_id
  ) into v_blocked_by_me;

  select exists (
    select 1 from public.user_blocks b
    where b.blocker_id = p_user_id and b.blocked_id = v_viewer
  ) into v_blocked_me;

  if v_blocked_me then
    raise exception 'profile_unavailable';
  end if;

  select f.* into v_friendship
  from public.friendships f
  where (f.requester_id = v_viewer and f.addressee_id = p_user_id)
     or (f.requester_id = p_user_id and f.addressee_id = v_viewer)
  order by f.created_at desc
  limit 1;

  if v_friendship.id is not null then
    if v_friendship.status = 'accepted' then
      v_friendship_state := 'accepted';
    elsif v_friendship.status = 'pending' and v_friendship.requester_id = v_viewer then
      v_friendship_state := 'pending_outgoing';
    elsif v_friendship.status = 'pending' and v_friendship.addressee_id = v_viewer then
      v_friendship_state := 'pending_incoming';
    end if;
  end if;

  select s.id, s.game_id, (s.owner_id = v_viewer)
  into v_squad_id, v_squad_game_id, v_viewer_squad_owner
  from public.squads s
  join public.squad_members sm on sm.squad_id = s.id and sm.user_id = v_viewer
  where s.status = 'temporary'
  order by sm.joined_at desc
  limit 1;

  if v_squad_id is not null then
    select exists (
      select 1 from public.squad_members sm
      where sm.squad_id = v_squad_id and sm.user_id = p_user_id
    ) into v_target_in_squad;

    select exists (
      select 1 from public.squad_invites si
      where si.squad_id = v_squad_id
        and si.recipient_id = p_user_id
        and si.status = 'pending'
    ) into v_squad_invite_pending;
  end if;

  select jsonb_build_object(
    'user_id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'banner_url', p.banner_url,
    'bio', case when (v_show_bio or p.id = v_viewer) and not v_blocked_by_me then p.bio else null end,
    'region', case when (v_show_region or p.id = v_viewer) and not v_blocked_by_me then p.region else null end,
    'language', case when (v_show_language or p.id = v_viewer) and not v_blocked_by_me then p.language else null end,
    'frame', case when frame.id is null then null else jsonb_build_object(
      'id', frame.id, 'name', frame.name, 'rarity', frame.rarity, 'style', frame.style
    ) end,
    'banner_cosmetic', case when banner.id is null then null else jsonb_build_object(
      'id', banner.id, 'name', banner.name, 'rarity', banner.rarity, 'style', banner.style
    ) end
  ) into v_profile
  from public.profiles p
  left join public.profile_cosmetics frame on frame.id = p.equipped_frame_id and frame.cosmetic_type = 'frame'
  left join public.profile_cosmetics banner on banner.id = p.equipped_banner_cosmetic_id and banner.cosmetic_type = 'banner'
  where p.id = p_user_id;

  if v_profile is null then
    raise exception 'profile_not_found';
  end if;

  if (v_show_games or p_user_id = v_viewer) and not v_blocked_by_me then
    select coalesce(jsonb_agg(jsonb_build_object(
      'game_id', g.id,
      'name', g.name,
      'logo_url', g.logo_url,
      'cover_url', g.cover_url,
      'platform', pl.name,
      'rank', ug.rank_text,
      'role', ug.role_text,
      'mode', ug.mode_text,
      'mic_enabled', coalesce(ug.mic_enabled, false),
      'crossplay_enabled', coalesce(ug.crossplay_enabled, false),
      'is_primary', coalesce(ug.is_primary, false)
    ) order by coalesce(ug.is_primary, false) desc, g.name), '[]'::jsonb)
    into v_games
    from public.user_games ug
    join public.games g on g.id = ug.game_id
    left join public.platforms pl on pl.id = ug.platform_id
    where ug.user_id = p_user_id;
  end if;

  if (v_show_gaming_dna or p_user_id = v_viewer) and not v_blocked_by_me then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'category', t.category
    ) order by t.sort_order nulls last, t.label), '[]'::jsonb)
    into v_dna
    from public.user_gaming_dna d
    join public.gaming_dna_tags t on t.id = d.tag_id
    where d.user_id = p_user_id;
  end if;

  if (v_show_looking_for or p_user_id = v_viewer) and not v_blocked_by_me then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'label', o.label,
      'description', o.description
    ) order by o.sort_order nulls last, o.label), '[]'::jsonb)
    into v_looking_for
    from public.user_looking_for ulf
    join public.looking_for_options o on o.id = ulf.option_id
    where ulf.user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'profile', v_profile,
    'games', v_games,
    'gaming_dna', v_dna,
    'looking_for', v_looking_for,
    'privacy', jsonb_build_object(
      'bio_visible', v_show_bio,
      'region_visible', v_show_region,
      'language_visible', v_show_language,
      'games_visible', v_show_games,
      'gaming_dna_visible', v_show_gaming_dna,
      'looking_for_visible', v_show_looking_for
    ),
    'social', jsonb_build_object(
      'viewer_is_self', p_user_id = v_viewer,
      'friendship_id', v_friendship.id,
      'friendship_state', v_friendship_state,
      'blocked_by_me', v_blocked_by_me,
      'can_message', v_friendship_state = 'accepted' and not v_blocked_by_me,
      'allow_friend_requests', v_allow_friend_requests,
      'viewer_squad_id', v_squad_id,
      'viewer_squad_game_id', v_squad_game_id,
      'viewer_is_squad_owner', v_viewer_squad_owner,
      'target_in_squad', v_target_in_squad,
      'squad_invite_pending', v_squad_invite_pending,
      'can_invite', v_allow_squad_invites and v_viewer_squad_owner and not v_target_in_squad and not v_squad_invite_pending and not v_blocked_by_me
    )
  );
end;
$$;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.enforce_friend_request_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and exists (
    select 1
    from public.profile_privacy_settings s
    where s.user_id = new.addressee_id
      and not s.allow_friend_requests
  ) then
    raise exception 'friend_requests_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_friend_request_privacy on public.friendships;
create trigger enforce_friend_request_privacy
before insert on public.friendships
for each row execute function private.enforce_friend_request_privacy();

create or replace function private.enforce_squad_invite_privacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and exists (
    select 1
    from public.profile_privacy_settings s
    where s.user_id = new.recipient_id
      and not s.allow_squad_invites
  ) then
    raise exception 'squad_invites_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_squad_invite_privacy on public.squad_invites;
create trigger enforce_squad_invite_privacy
before insert on public.squad_invites
for each row execute function private.enforce_squad_invite_privacy();

revoke all on function public.get_my_profile_privacy() from public, anon;
revoke all on function public.update_my_profile_privacy(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.get_public_player_profile(uuid) from public, anon;

grant execute on function public.get_my_profile_privacy() to authenticated;
grant execute on function public.update_my_profile_privacy(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.get_public_player_profile(uuid) to authenticated;

-- Les actions utilisées par le profil public exigent elles aussi une session.
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.invite_to_squad(uuid, bigint) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.create_user_report(uuid, text, text, text) from public, anon;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.invite_to_squad(uuid, bigint) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.create_user_report(uuid, text, text, text) to authenticated;

revoke all on function private.enforce_friend_request_privacy() from public, anon, authenticated;
revoke all on function private.enforce_squad_invite_privacy() from public, anon, authenticated;

commit;
