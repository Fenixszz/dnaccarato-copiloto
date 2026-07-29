-- Migration: função compartilhada de updated_at automático.
--
-- Todas as tabelas do projeto usam created_at/updated_at automáticos:
--   - created_at: preenchido no insert (default now()).
--   - updated_at: preenchido no insert (default now()) e atualizado a cada
--     UPDATE por esta função, disparada por trigger BEFORE UPDATE.
--
-- Convenções (CLAUDE.md): nomes em português, snake_case.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE: mantém updated_at sempre com o timestamp da última alteração.';
