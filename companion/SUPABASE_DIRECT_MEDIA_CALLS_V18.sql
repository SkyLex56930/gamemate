-- GameMate Companion V18 — appels audio, vidéo et partage d'écran
-- Projet cible : nkbolxajtgsblwcwxlfm
-- À exécuter une seule fois après SUPABASE_DIRECT_CALLS_V16.sql.

begin;

alter table public.direct_calls
  add column if not exists media_mode text not null default 'audio';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.direct_calls'::regclass
      and conname = 'direct_calls_media_mode_check'
  ) then
    alter table public.direct_calls
      add constraint direct_calls_media_mode_check
      check (media_mode in ('audio', 'video'));
  end if;
end;
$$;

create or replace function public.start_direct_call_v18(
  p_callee_id uuid,
  p_media_mode text default 'audio'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_mode text := lower(coalesce(p_media_mode, 'audio'));
  v_created jsonb;
  v_call public.direct_calls%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_mode not in ('audio', 'video') then raise exception 'invalid_media_mode'; end if;

  v_created := public.start_direct_call_v16(p_callee_id);

  update public.direct_calls
  set media_mode = v_mode
  where id = (v_created ->> 'id')::uuid
    and caller_id = v_uid
  returning * into v_call;

  if not found then raise exception 'call_not_found'; end if;
  return to_jsonb(v_call);
end;
$$;

create or replace function public.get_direct_call_details_v18(p_call_id uuid)
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
    'media_mode', c.media_mode,
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
  join public.profiles p
    on p.id = case when c.caller_id = auth.uid() then c.callee_id else c.caller_id end
  where c.id = p_call_id
    and auth.uid() in (c.caller_id, c.callee_id);
$$;

create or replace function public.get_my_direct_call_history_v18(p_limit integer default 30)
returns table (
  call_id uuid,
  other_user_id uuid,
  other_display_name text,
  other_username text,
  other_avatar_url text,
  direction text,
  status text,
  media_mode text,
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
  where status = 'ringing'
    and expires_at <= now()
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
    c.media_mode,
    c.started_at,
    c.answered_at,
    c.ended_at,
    case
      when c.answered_at is null then 0
      else greatest(
        0,
        extract(epoch from (coalesce(c.ended_at, now()) - c.answered_at))::integer
      )
    end
  from public.direct_calls c
  join public.profiles p
    on p.id = case when c.caller_id = v_uid then c.callee_id else c.caller_id end
  where v_uid in (c.caller_id, c.callee_id)
  order by c.started_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function public.start_direct_call_v18(uuid, text) from public, anon;
revoke all on function public.get_direct_call_details_v18(uuid) from public, anon;
revoke all on function public.get_my_direct_call_history_v18(integer) from public, anon;

grant execute on function public.start_direct_call_v18(uuid, text) to authenticated;
grant execute on function public.get_direct_call_details_v18(uuid) to authenticated;
grant execute on function public.get_my_direct_call_history_v18(integer) to authenticated;

commit;
