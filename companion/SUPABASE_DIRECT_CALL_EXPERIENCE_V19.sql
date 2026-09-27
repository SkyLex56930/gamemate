-- GameMate Companion V19 — présence, notifications d'appel et retour qualité.

alter table public.direct_calls
  add column if not exists recipient_online_at_start boolean not null default false;

alter table public.user_notifications_v9
  drop constraint if exists user_notifications_v9_kind_check;
alter table public.user_notifications_v9
  add constraint user_notifications_v9_kind_check
  check (kind = any (array[
    'lfg_application_received'::text,
    'lfg_application_withdrawn'::text,
    'lfg_application_accepted'::text,
    'lfg_application_declined'::text,
    'lfg_post_closed'::text,
    'direct_call'::text
  ]));

alter table public.user_notifications_v9
  drop constraint if exists user_notifications_v9_entity_type_check;
alter table public.user_notifications_v9
  add constraint user_notifications_v9_entity_type_check
  check (entity_type = any (array[
    'lfg_post'::text,
    'lfg_application'::text,
    'squad'::text,
    'direct_call'::text
  ]));

create table if not exists public.direct_call_feedback (
  call_id uuid not null references public.direct_calls(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  issue_tags text[] not null default '{}'::text[],
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (call_id, reviewer_id),
  constraint direct_call_feedback_comment_length check (comment is null or char_length(comment) <= 500)
);

create index if not exists direct_call_feedback_reviewer_idx
  on public.direct_call_feedback(reviewer_id, created_at desc);

alter table public.direct_call_feedback enable row level security;

drop policy if exists "direct_call_feedback_select_own" on public.direct_call_feedback;
create policy "direct_call_feedback_select_own"
on public.direct_call_feedback
for select
to authenticated
using (reviewer_id = (select auth.uid()));

revoke all on table public.direct_call_feedback from public, anon;
grant select on table public.direct_call_feedback to authenticated;

create or replace function public.start_direct_call_v19(
  p_callee_id uuid,
  p_media_mode text default 'audio'::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_created jsonb;
  v_call public.direct_calls%rowtype;
  v_recipient_online boolean := false;
  v_caller_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select exists (
    select 1
    from public.user_presence up
    where up.user_id = p_callee_id
      and up.status not in ('offline', 'invisible')
      and up.last_seen_at >= now() - interval '90 seconds'
  ) into v_recipient_online;

  v_created := public.start_direct_call_v18(p_callee_id, p_media_mode);

  update public.direct_calls
  set recipient_online_at_start = v_recipient_online
  where id = (v_created ->> 'id')::uuid
    and caller_id = v_uid
  returning * into v_call;

  if not found then raise exception 'call_not_found'; end if;

  select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Un joueur GameMate')
  into v_caller_name
  from public.profiles p
  where p.id = v_uid;

  insert into public.user_notifications_v9 (
    recipient_id,
    actor_id,
    kind,
    title,
    body,
    entity_type,
    entity_id,
    action_target,
    metadata,
    event_key
  ) values (
    p_callee_id,
    v_uid,
    'direct_call',
    case when v_call.media_mode = 'video' then 'Appel vidéo entrant' else 'Appel vocal entrant' end,
    v_caller_name || ' essaie de te joindre sur GameMate.',
    'direct_call',
    v_call.id,
    'messages',
    jsonb_build_object(
      'call_id', v_call.id,
      'caller_id', v_uid,
      'media_mode', v_call.media_mode,
      'expires_at', v_call.expires_at,
      'recipient_online_at_start', v_recipient_online
    ),
    'direct_call:' || v_call.id::text
  )
  on conflict (recipient_id, event_key) do nothing;

  return to_jsonb(v_call) || jsonb_build_object(
    'recipient_online_at_start', v_recipient_online,
    'notification_queued', true
  );
end;
$function$;

create or replace function public.get_direct_call_details_v19(p_call_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
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
    'recipient_online_at_start', c.recipient_online_at_start,
    'feedback_submitted', exists (
      select 1
      from public.direct_call_feedback f
      where f.call_id = c.id and f.reviewer_id = auth.uid()
    ),
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
$function$;

create or replace function public.submit_direct_call_feedback_v19(
  p_call_id uuid,
  p_rating integer,
  p_issue_tags text[] default '{}'::text[],
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_call public.direct_calls%rowtype;
  v_tags text[] := coalesce(p_issue_tags, '{}'::text[]);
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;
  if char_length(coalesce(v_comment, '')) > 500 then raise exception 'comment_too_long'; end if;
  if exists (
    select 1 from unnest(v_tags) tag
    where tag not in ('audio', 'video', 'connection', 'delay', 'screen_share', 'notification', 'other')
  ) then
    raise exception 'invalid_feedback_tag';
  end if;

  select * into v_call
  from public.direct_calls
  where id = p_call_id
    and v_uid in (caller_id, callee_id);

  if not found then raise exception 'call_not_found'; end if;
  if v_call.status <> 'ended' or v_call.answered_at is null then
    raise exception 'call_not_completed';
  end if;

  insert into public.direct_call_feedback (
    call_id, reviewer_id, rating, issue_tags, comment, updated_at
  ) values (
    p_call_id, v_uid, p_rating::smallint, v_tags, v_comment, now()
  )
  on conflict (call_id, reviewer_id) do update
  set rating = excluded.rating,
      issue_tags = excluded.issue_tags,
      comment = excluded.comment,
      updated_at = now();

  return jsonb_build_object('ok', true, 'call_id', p_call_id, 'rating', p_rating);
end;
$function$;

revoke all on function public.start_direct_call_v19(uuid, text) from public, anon;
revoke all on function public.get_direct_call_details_v19(uuid) from public, anon;
revoke all on function public.submit_direct_call_feedback_v19(uuid, integer, text[], text) from public, anon;

grant execute on function public.start_direct_call_v19(uuid, text) to authenticated;
grant execute on function public.get_direct_call_details_v19(uuid) to authenticated;
grant execute on function public.submit_direct_call_feedback_v19(uuid, integer, text[], text) to authenticated;
