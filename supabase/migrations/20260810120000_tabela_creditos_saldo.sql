-- Migration: tabela creditos_saldo — saldo GLOBAL de créditos da Adriana.
--
-- É uma LINHA ÚNICA (singleton): guarda o saldo atual em centavos e quando ele
-- mudou pela última vez. O saldo é alimentado por creditos_recargas (Pix
-- confirmado) e consumido por creditos_uso (Anthropic/WhatsApp) — o cálculo
-- fica na aplicação; aqui é só o estado atual.
--
-- Singleton: id boolean com default true + check(id) → só cabe uma linha.
-- Dado sensível (financeiro) → RLS habilitado (CLAUDE.md).

create table if not exists public.creditos_saldo (
  id             boolean primary key default true,
  saldo_centavos bigint not null default 0,
  atualizado_em  timestamptz not null default now(),
  -- Garante a linha única: qualquer segunda inserção colide no PK (id=true) e
  -- id=false é barrado pelo check.
  constraint creditos_saldo_singleton check (id = true)
);

comment on table public.creditos_saldo is
  'Saldo global de créditos da Adriana (linha única). saldo_centavos pode ficar negativo se o uso passar das recargas.';

-- atualizado_em sempre reflete a última alteração do saldo, mesmo que a
-- aplicação esqueça de setá-lo. Função dedicada (a set_updated_at padrão mexe
-- em updated_at, coluna que esta tabela não tem).
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.set_atualizado_em() is
  'Trigger BEFORE UPDATE: mantém atualizado_em com o timestamp da última alteração.';

drop trigger if exists trg_creditos_saldo_atualizado_em on public.creditos_saldo;
create trigger trg_creditos_saldo_atualizado_em
  before update on public.creditos_saldo
  for each row execute function public.set_atualizado_em();

-- Cria a linha única com saldo zero (idempotente) para o dashboard sempre ler
-- exatamente uma linha.
insert into public.creditos_saldo (id, saldo_centavos)
values (true, 0)
on conflict (id) do nothing;

-- RLS: só service_role escreve; dashboard autenticado lê; anon negado.
alter table public.creditos_saldo enable row level security;

drop policy if exists creditos_saldo_service_role_all on public.creditos_saldo;
create policy creditos_saldo_service_role_all on public.creditos_saldo
  as permissive for all to service_role using (true) with check (true);

drop policy if exists creditos_saldo_authenticated_select on public.creditos_saldo;
create policy creditos_saldo_authenticated_select on public.creditos_saldo
  as permissive for select to authenticated using (true);
