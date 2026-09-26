-- GameMate Companion V13
-- Retire l'exécution anonyme des fonctions SECURITY DEFINER internes.
-- get_public_site_stats() reste volontairement accessible aux visiteurs du site.

do $migration$
declare
  function_row record;
begin
  for function_row in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> 'get_public_site_stats'
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from anon',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
    execute format(
      'revoke execute on function %I.%I(%s) from public',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end
$migration$;

-- Les nouvelles fonctions ne doivent plus être exécutables par défaut par
-- PUBLIC/anon. Chaque future RPC devra recevoir ses droits explicitement.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

