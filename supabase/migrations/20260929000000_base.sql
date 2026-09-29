-- rollback:
-- drop function if exists app.set_updated_at();
-- drop schema if exists app;

-- Base: schema de helpers e trigger de updated_at.
-- As tabelas de domínio começam na etapa 1 (docs/fase-1-nucleo.md).

create schema if not exists app;

-- O schema app guarda funções auxiliares (RLS, triggers). Não expor via API.
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'Trigger BEFORE UPDATE: mantém updated_at. Usar em toda tabela de domínio.';
