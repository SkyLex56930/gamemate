-- GameMate Companion V19.1 - correctif historique des appels
-- A executer une seule fois si ce correctif n'a pas deja ete installe.

begin;

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
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Les colonnes sont volontairement qualifiees : "status" est aussi le nom
  -- d'une colonne de sortie de la fonction et devenait ambigu en PL/pgSQL.
  update public.direct_calls as dc
  set
    status = 'missed',
    ended_at = coalesce(dc.ended_at, now())
  where dc.status = 'ringing'
    and dc.expires_at <= now()
    and v_uid in (dc.caller_id, dc.callee_id);

  return query
  select
    dc.id,
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    case when dc.caller_id = v_uid then 'outgoing' else 'incoming' end,
    dc.status,
    dc.media_mode,
    dc.started_at,
    dc.answered_at,
    dc.ended_at,
    case
      when dc.answered_at is null then 0
      else greatest(
        0,
        extract(epoch from (coalesce(dc.ended_at, now()) - dc.answered_at))::integer
      )
    end
  from public.direct_calls as dc
  join public.profiles as p
    on p.id = case when dc.caller_id = v_uid then dc.callee_id else dc.caller_id end
  where v_uid in (dc.caller_id, dc.callee_id)
  order by dc.started_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function public.get_my_direct_call_history_v18(integer) from public, anon;
grant execute on function public.get_my_direct_call_history_v18(integer) to authenticated;

comment on function public.get_my_direct_call_history_v18(integer)
  is 'Historique des appels GameMate; qualification V19.1 des colonnes PL/pgSQL.';

commit;
