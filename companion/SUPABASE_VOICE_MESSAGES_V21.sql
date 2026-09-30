-- GameMate Companion V21 — messages vocaux privés.
-- Les fichiers restent privés et ne sont lisibles que par les participants
-- de la conversation correspondant au premier dossier du chemin.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-messages',
  'voice-messages',
  false,
  10485760,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "voice_messages_insert_participant" on storage.objects;
create policy "voice_messages_insert_participant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'voice-messages'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.conversations conversation
    where conversation.id::text = (storage.foldername(name))[1]
      and (select auth.uid()) in (conversation.user_a, conversation.user_b)
  )
);

drop policy if exists "voice_messages_read_participant" on storage.objects;
create policy "voice_messages_read_participant"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'voice-messages'
  and exists (
    select 1
    from public.conversations conversation
    where conversation.id::text = (storage.foldername(name))[1]
      and (select auth.uid()) in (conversation.user_a, conversation.user_b)
  )
);

drop policy if exists "voice_messages_delete_own" on storage.objects;
create policy "voice_messages_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'voice-messages'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
