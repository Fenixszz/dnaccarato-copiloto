-- Migration: tabela creditos_recargas — Pix confirmados pelo João.
--
-- Cada linha é uma recarga: um Pix que o João confirmou ter recebido, com o
-- valor em centavos, quem registrou e uma observação opcional. Alimenta o
-- crédito do saldo global (cálculo na aplicação).
--
-- Append-only → só criado_em (sem updated_at/trigger). Dado financeiro → RLS.

create table if not exists public.creditos_recargas (
  id             uuid primary key default gen_random_uuid(),
  valor_centavos bigint not null check (valor_centavos > 0),
  -- Quem registrou a recarga (ex: e-mail do João). Fica no registro para
  -- auditoria de quem confirmou o Pix.
  registrada_por text not null,
  observacao     text,
  criado_em      timestamptz not null default now()
);

comment on table public.creditos_recargas is
  'Recargas de crédito (append-only). Cada linha é um Pix que o João confirmou ter recebido.';

create index if not exists idx_creditos_recargas_criado_em
  on public.creditos_recargas (criado_em);

-- RLS: só service_role escreve; dashboard autenticado lê; anon negado.
alter table public.creditos_recargas enable row level security;

drop policy if exists creditos_recargas_service_role_all on public.creditos_recargas;
create policy creditos_recargas_service_role_all on public.creditos_recargas
  as permissive for all to service_role using (true) with check (true);

drop policy if exists creditos_recargas_authenticated_select on public.creditos_recargas;
create policy creditos_recargas_authenticated_select on public.creditos_recargas
  as permissive for select to authenticated using (true);
