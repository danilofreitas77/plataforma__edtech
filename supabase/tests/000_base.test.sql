-- Rodar com: supabase test db
begin;
select plan(3);

select has_schema('app', 'schema app existe');
select has_function('app', 'set_updated_at', 'trigger de updated_at existe');

-- Guarda-costas do CLAUDE.md: nenhuma tabela em public sem RLS.
select is_empty(
  $$ select tablename from pg_tables
     where schemaname = 'public' and not rowsecurity $$,
  'toda tabela em public tem RLS habilitado'
);

select * from finish();
rollback;
