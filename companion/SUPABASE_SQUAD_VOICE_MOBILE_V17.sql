-- GameMate V17 — accès sécurisé aux salons vocaux privés des squads.
-- À exécuter après la création des tables squad_members et squad_channels.

create or replace function public.can_access_squad_voice(requested_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_squad_id uuid;
  v_channel_id uuid;
begin
  if v_uid is null
    or requested_topic is null
    or requested_topic !~ '^squad-voice:[0-9a-fA-F-]{36}:[0-9a-fA-F-]{36}$'
  then
    return false;
  end if;

  begin
    v_squad_id := split_part(requested_topic, ':', 2)::uuid;
    v_channel_id := split_part(requested_topic, ':', 3)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.squad_members member
    join public.squad_channels channel
      on channel.squad_id = member.squad_id
     and channel.id = v_channel_id
     and channel.channel_type = 'voice'
    where member.squad_id = v_squad_id
      and member.user_id = v_uid
  );
end;
$$;

drop policy if exists "gamemate squad voice read" on realtime.messages;
create policy "gamemate squad voice read"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast', 'presence')
  and public.can_access_squad_voice((select realtime.topic()))
);

drop policy if exists "gamemate squad voice write" on realtime.messages;
create policy "gamemate squad voice write"
on realtime.messages
for insert
to authenticated
with check (
  extension in ('broadcast', 'presence')
  and public.can_access_squad_voice((select realtime.topic()))
);

revoke all on function public.can_access_squad_voice(text) from public, anon;
grant execute on function public.can_access_squad_voice(text) to authenticated;
