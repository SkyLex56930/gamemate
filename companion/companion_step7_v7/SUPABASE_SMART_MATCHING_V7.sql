-- GameMate Companion — Etape 7 / Matching intelligent
-- Score explicable, filtres serveur et disponibilites respectant la confidentialite.

begin;

alter table public.profile_privacy_settings
  add column if not exists show_availability boolean not null default true;

create index if not exists user_games_game_user_platform_idx
  on public.user_games (game_id, user_id, platform_id);

create index if not exists user_blocks_blocked_blocker_idx
  on public.user_blocks (blocked_id, blocker_id);

create or replace function public.update_my_profile_privacy_v2(
  p_show_bio boolean,
  p_show_region boolean,
  p_show_language boolean,
  p_show_games boolean,
  p_show_gaming_dna boolean,
  p_show_looking_for boolean,
  p_show_availability boolean,
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
    show_availability,
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
    coalesce(p_show_availability, true),
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
    show_availability = excluded.show_availability,
    allow_friend_requests = excluded.allow_friend_requests,
    allow_squad_invites = excluded.allow_squad_invites,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.find_mates_smart_v7(
  p_game_id bigint,
  p_platform_id bigint default null,
  p_allow_crossplay boolean default true,
  p_mic_required boolean default false,
  p_same_rank boolean default false,
  p_same_role boolean default false,
  p_same_mode boolean default false,
  p_same_language boolean default false,
  p_same_region boolean default false,
  p_availability_required boolean default false,
  p_query text default null,
  p_limit integer default 60
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  region text,
  language text,
  game_id bigint,
  platform_id bigint,
  game_name text,
  game_logo_url text,
  game_cover_url text,
  platform_name text,
  rank_text text,
  role_text text,
  mode_text text,
  mic_enabled boolean,
  crossplay_enabled boolean,
  is_primary boolean,
  compatibility_score integer,
  compatibility_level text,
  match_reasons jsonb,
  shared_dna_count integer,
  shared_looking_for_count integer,
  availability_match boolean,
  availability_summary jsonb,
  presence_status text,
  last_seen_at timestamptz,
  friendship_id uuid,
  friendship_state text,
  can_invite boolean,
  squad_invite_pending boolean,
  target_in_squad boolean,
  viewer_squad_game_id bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_viewer_game public.user_games%rowtype;
  v_viewer_profile public.profiles%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 100);
begin
  if v_viewer is null then
    raise exception 'authentication_required';
  end if;
  if p_game_id is null then
    raise exception 'game_required';
  end if;

  select ug.* into v_viewer_game
  from public.user_games ug
  where ug.user_id = v_viewer
    and ug.game_id = p_game_id
    and (p_platform_id is null or ug.platform_id = p_platform_id)
  order by
    case when ug.platform_id = p_platform_id then 0 else 1 end,
    coalesce(ug.is_primary, false) desc,
    ug.id
  limit 1;

  if not found then
    raise exception 'game_not_configured';
  end if;

  select p.* into v_viewer_profile
  from public.profiles p
  where p.id = v_viewer;

  return query
  with viewer_context as (
    select
      vs.id as squad_id,
      vs.game_id as squad_game_id,
      coalesce(vs.owner_id = v_viewer, false) as is_squad_owner
    from (values (1)) seed(n)
    left join lateral (
      select s.id, s.game_id, s.owner_id
      from public.squads s
      join public.squad_members sm
        on sm.squad_id = s.id
       and sm.user_id = v_viewer
      where s.status = 'temporary'
      order by sm.joined_at desc
      limit 1
    ) vs on true
  ),
  candidate_games as (
    select distinct on (ug.user_id)
      ug.user_id,
      ug.game_id,
      ug.platform_id,
      ug.rank_text,
      ug.role_text,
      ug.mode_text,
      coalesce(ug.mic_enabled, false) as mic_enabled,
      coalesce(ug.crossplay_enabled, false) as crossplay_enabled,
      coalesce(ug.is_primary, false) as is_primary,
      g.name as game_name,
      g.logo_url as game_logo_url,
      g.cover_url as game_cover_url,
      pl.name as platform_name
    from public.user_games ug
    join public.games g on g.id = ug.game_id
    left join public.platforms pl on pl.id = ug.platform_id
    left join public.profile_privacy_settings privacy on privacy.user_id = ug.user_id
    where ug.user_id <> v_viewer
      and ug.game_id = p_game_id
      and coalesce(privacy.show_games, true)
      and (
        p_platform_id is null
        or ug.platform_id = p_platform_id
        or (coalesce(p_allow_crossplay, true) and ug.crossplay_enabled)
      )
      and (not coalesce(p_mic_required, false) or ug.mic_enabled)
      and (not coalesce(p_same_rank, false)
        or nullif(lower(trim(v_viewer_game.rank_text)), '') is null
        or lower(trim(ug.rank_text)) = lower(trim(v_viewer_game.rank_text)))
      and (not coalesce(p_same_role, false)
        or nullif(lower(trim(v_viewer_game.role_text)), '') is null
        or lower(trim(ug.role_text)) = lower(trim(v_viewer_game.role_text)))
      and (not coalesce(p_same_mode, false)
        or nullif(lower(trim(v_viewer_game.mode_text)), '') is null
        or lower(trim(ug.mode_text)) = lower(trim(v_viewer_game.mode_text)))
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = v_viewer and b.blocked_id = ug.user_id)
           or (b.blocker_id = ug.user_id and b.blocked_id = v_viewer)
      )
    order by
      ug.user_id,
      case when ug.platform_id = p_platform_id then 0 else 1 end,
      coalesce(ug.is_primary, false) desc,
      ug.id
  ),
  signals as (
    select
      p.id as candidate_id,
      p.username,
      p.display_name,
      p.avatar_url,
      case when coalesce(privacy.show_bio, true) then p.bio else null end as bio,
      case when coalesce(privacy.show_region, true) then p.region else null end as region,
      case when coalesce(privacy.show_language, true) then p.language else null end as language,
      cg.*,
      coalesce(privacy.show_region, true) as region_visible,
      coalesce(privacy.show_language, true) as language_visible,
      coalesce(privacy.show_gaming_dna, true) as dna_visible,
      coalesce(privacy.show_looking_for, true) as looking_visible,
      coalesce(privacy.show_availability, true) as availability_visible,
      coalesce(privacy.allow_squad_invites, true) as allows_squad_invites,
      (cg.platform_id = v_viewer_game.platform_id) as same_platform,
      (
        nullif(lower(trim(v_viewer_game.rank_text)), '') is not null
        and lower(trim(cg.rank_text)) = lower(trim(v_viewer_game.rank_text))
      ) as same_rank,
      (
        nullif(lower(trim(v_viewer_game.role_text)), '') is not null
        and lower(trim(cg.role_text)) = lower(trim(v_viewer_game.role_text))
      ) as same_role,
      (
        nullif(lower(trim(v_viewer_game.mode_text)), '') is not null
        and lower(trim(cg.mode_text)) = lower(trim(v_viewer_game.mode_text))
      ) as same_mode,
      (
        coalesce(v_viewer_game.mic_enabled, false)
        and cg.mic_enabled
      ) as both_have_mic,
      (
        coalesce(privacy.show_language, true)
        and nullif(lower(trim(v_viewer_profile.language)), '') is not null
        and lower(trim(p.language)) = lower(trim(v_viewer_profile.language))
      ) as same_language,
      (
        coalesce(privacy.show_region, true)
        and nullif(lower(trim(v_viewer_profile.region)), '') is not null
        and lower(trim(p.region)) = lower(trim(v_viewer_profile.region))
      ) as same_region,
      case when coalesce(privacy.show_gaming_dna, true) then (
        select count(*)::integer
        from public.user_gaming_dna mine
        join public.user_gaming_dna theirs on theirs.tag_id = mine.tag_id
        where mine.user_id = v_viewer
          and theirs.user_id = p.id
      ) else 0 end as shared_dna,
      case when coalesce(privacy.show_looking_for, true) then (
        select count(*)::integer
        from public.user_looking_for mine
        join public.user_looking_for theirs on theirs.option_id = mine.option_id
        where mine.user_id = v_viewer
          and theirs.user_id = p.id
      ) else 0 end as shared_looking,
      coalesce(availability.overlaps, false) as has_availability_overlap,
      availability.summary as availability_info,
      case
        when presence.last_seen_at > now() - interval '5 minutes'
          and presence.status in ('online', 'busy')
          then presence.status
        else 'offline'
      end as effective_presence,
      presence.last_seen_at as candidate_last_seen,
      friendship.id as candidate_friendship_id,
      case
        when friendship.status = 'accepted' then 'accepted'
        when friendship.status = 'pending' and friendship.requester_id = v_viewer then 'pending_outgoing'
        when friendship.status = 'pending' and friendship.addressee_id = v_viewer then 'pending_incoming'
        else 'none'
      end as candidate_friendship_state,
      coalesce(squad.target_in_squad, false) as candidate_in_squad,
      coalesce(squad.invite_pending, false) as candidate_invite_pending,
      (
        coalesce(privacy.allow_squad_invites, true)
        and vc.is_squad_owner
        and vc.squad_id is not null
        and not coalesce(squad.target_in_squad, false)
        and not coalesce(squad.invite_pending, false)
      ) as candidate_can_invite,
      vc.squad_game_id
    from candidate_games cg
    join public.profiles p on p.id = cg.user_id
    left join public.profile_privacy_settings privacy on privacy.user_id = p.id
    cross join viewer_context vc
    left join public.user_presence presence on presence.user_id = p.id
    left join lateral (
      select f.*
      from public.friendships f
      where (f.requester_id = v_viewer and f.addressee_id = p.id)
         or (f.requester_id = p.id and f.addressee_id = v_viewer)
      order by f.created_at desc
      limit 1
    ) friendship on true
    left join lateral (
      select
        true as overlaps,
        jsonb_build_object(
          'day_of_week', mine.day_of_week,
          'start_time', greatest(mine.start_time, theirs.start_time),
          'end_time', least(mine.end_time, theirs.end_time),
          'timezone', mine.timezone
        ) as summary
      from public.user_availability mine
      join public.user_availability theirs
        on theirs.user_id = p.id
       and theirs.day_of_week = mine.day_of_week
       and theirs.timezone = mine.timezone
       and greatest(mine.start_time, theirs.start_time) < least(mine.end_time, theirs.end_time)
      where mine.user_id = v_viewer
        and coalesce(privacy.show_availability, true)
      order by mine.day_of_week, greatest(mine.start_time, theirs.start_time)
      limit 1
    ) availability on true
    left join lateral (
      select
        exists (
          select 1 from public.squad_members sm
          where sm.squad_id = vc.squad_id and sm.user_id = p.id
        ) as target_in_squad,
        exists (
          select 1 from public.squad_invites si
          where si.squad_id = vc.squad_id
            and si.recipient_id = p.id
            and si.status = 'pending'
        ) as invite_pending
    ) squad on vc.squad_id is not null
    where
      (
        not coalesce(p_same_language, false)
        or (
          coalesce(privacy.show_language, true)
          and nullif(lower(trim(v_viewer_profile.language)), '') is not null
          and lower(trim(p.language)) = lower(trim(v_viewer_profile.language))
        )
      )
      and (
        not coalesce(p_same_region, false)
        or (
          coalesce(privacy.show_region, true)
          and nullif(lower(trim(v_viewer_profile.region)), '') is not null
          and lower(trim(p.region)) = lower(trim(v_viewer_profile.region))
        )
      )
      and (
        not coalesce(p_availability_required, false)
        or coalesce(availability.overlaps, false)
      )
      and (
        nullif(trim(coalesce(p_query, '')), '') is null
        or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%'
        or coalesce(p.username, '') ilike '%' || trim(p_query) || '%'
        or (coalesce(privacy.show_region, true) and coalesce(p.region, '') ilike '%' || trim(p_query) || '%')
        or (coalesce(privacy.show_language, true) and coalesce(p.language, '') ilike '%' || trim(p_query) || '%')
        or coalesce(cg.rank_text, '') ilike '%' || trim(p_query) || '%'
        or coalesce(cg.role_text, '') ilike '%' || trim(p_query) || '%'
        or coalesce(cg.mode_text, '') ilike '%' || trim(p_query) || '%'
        or coalesce(cg.platform_name, '') ilike '%' || trim(p_query) || '%'
      )
  ),
  scored as (
    select
      s.*,
      least(100,
        20
        + case when s.same_platform then 10 when p_allow_crossplay and s.crossplay_enabled then 5 else 0 end
        + case when s.same_rank then 10 else 0 end
        + case when s.same_role then 8 else 0 end
        + case when s.same_mode then 7 else 0 end
        + case when s.both_have_mic then 5 else 0 end
        + case when s.same_language then 10 else 0 end
        + case when s.same_region then 5 else 0 end
        + least(s.shared_dna * 3, 10)
        + least(s.shared_looking * 4, 8)
        + case when s.has_availability_overlap then 5 else 0 end
        + case when s.effective_presence in ('online', 'busy') then 2 else 0 end
      )::integer as score
    from signals s
  )
  select
    sc.candidate_id,
    sc.username,
    sc.display_name,
    sc.avatar_url,
    sc.bio,
    sc.region,
    sc.language,
    sc.game_id,
    sc.platform_id,
    sc.game_name,
    sc.game_logo_url,
    sc.game_cover_url,
    sc.platform_name,
    sc.rank_text,
    sc.role_text,
    sc.mode_text,
    sc.mic_enabled,
    sc.crossplay_enabled,
    sc.is_primary,
    sc.score,
    case
      when sc.score >= 80 then 'ideal'
      when sc.score >= 60 then 'strong'
      when sc.score >= 40 then 'promising'
      else 'possible'
    end,
    (
      select coalesce(jsonb_agg(reason order by position), '[]'::jsonb)
      from (values
        (1, jsonb_build_object('label', 'Même jeu', 'detail', sc.game_name, 'points', 20)),
        (2, case
          when sc.same_platform then jsonb_build_object('label', 'Même plateforme', 'detail', sc.platform_name, 'points', 10)
          when p_allow_crossplay and sc.crossplay_enabled then jsonb_build_object('label', 'Crossplay compatible', 'detail', sc.platform_name, 'points', 5)
          else null end),
        (3, case when sc.same_rank then jsonb_build_object('label', 'Même rang', 'detail', sc.rank_text, 'points', 10) else null end),
        (4, case when sc.same_role then jsonb_build_object('label', 'Même rôle', 'detail', sc.role_text, 'points', 8) else null end),
        (5, case when sc.same_mode then jsonb_build_object('label', 'Même mode', 'detail', sc.mode_text, 'points', 7) else null end),
        (6, case when sc.both_have_mic then jsonb_build_object('label', 'Micro', 'detail', 'Vous utilisez tous les deux le vocal', 'points', 5) else null end),
        (7, case when sc.same_language then jsonb_build_object('label', 'Même langue', 'detail', sc.language, 'points', 10) else null end),
        (8, case when sc.same_region then jsonb_build_object('label', 'Même région', 'detail', sc.region, 'points', 5) else null end),
        (9, case when sc.shared_dna > 0 then jsonb_build_object('label', 'Gaming DNA', 'detail', sc.shared_dna || ' trait(s) en commun', 'points', least(sc.shared_dna * 3, 10)) else null end),
        (10, case when sc.shared_looking > 0 then jsonb_build_object('label', 'Même recherche', 'detail', sc.shared_looking || ' intention(s) en commun', 'points', least(sc.shared_looking * 4, 8)) else null end),
        (11, case when sc.has_availability_overlap then jsonb_build_object('label', 'Créneau commun', 'detail', 'Disponibilités compatibles', 'points', 5) else null end),
        (12, case when sc.effective_presence in ('online', 'busy') then jsonb_build_object('label', 'Actif maintenant', 'detail', sc.effective_presence, 'points', 2) else null end)
      ) reasons(position, reason)
      where reason is not null
    ),
    sc.shared_dna,
    sc.shared_looking,
    sc.has_availability_overlap,
    sc.availability_info,
    sc.effective_presence,
    sc.candidate_last_seen,
    sc.candidate_friendship_id,
    sc.candidate_friendship_state,
    sc.candidate_can_invite,
    sc.candidate_invite_pending,
    sc.candidate_in_squad,
    sc.squad_game_id
  from scored sc
  order by
    sc.score desc,
    case when sc.effective_presence = 'online' then 0 when sc.effective_presence = 'busy' then 1 else 2 end,
    sc.display_name asc nulls last,
    sc.username asc nulls last
  limit v_limit;
end;
$$;

revoke all on function public.update_my_profile_privacy_v2(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon;
grant execute on function public.update_my_profile_privacy_v2(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) to authenticated;

revoke all on function public.find_mates_smart_v7(
  bigint, bigint, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, integer
) from public, anon;
grant execute on function public.find_mates_smart_v7(
  bigint, bigint, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, integer
) to authenticated;

revoke all on function public.find_mates_profiles(bigint, bigint, boolean) from public, anon;
grant execute on function public.find_mates_profiles(bigint, bigint, boolean) to authenticated;

commit;
