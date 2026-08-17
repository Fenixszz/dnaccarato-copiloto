-- Migration: tabela creditos_uso — consumo estimado de créditos por serviço.
--
-- Cada linha é um evento de uso (append-only): uma chamada à Anthropic (LLM do
-- copiloto) ou um envio pela WhatsApp (Evolution API), com o custo ESTIMADO em
-- centavos. Alimenta o débito do saldo global (cálculo na aplicação).
--
-- Append-only → só criado_em (sem updated_at/trigger). Dado financeiro → RLS.

create table if not exists public.creditos_uso (
  id                       uuid primary key default gen_random_uuid(),
  servico                  text not null check (servico in ('anthropic', 'whatsapp')),
  valor_estimado_centavos  bigint not null check (valor_estimado_centavos >= 0),
  -- Referência do evento na origem (ex: id da mensagem/requisição) ou descrição
  -- curta. Opcional: nem todo uso tem um identificador externo.
  referencia               text,
  criado_em                timestamptz not null default now()
);

comment on table public.creditos_uso is
  'Uso estimado de créditos por serviço (append-only). servico: anthropic | whatsapp.';

create index if not exists idx_creditos_uso_servico on public.creditos_uso (servico);
create index if not exists idx_creditos_uso_criado_em on public.creditos_uso (criado_em);

-- RLS: só service_role escreve; dashboard autenticado lê; anon negado.
alter table public.creditos_uso enable row level security;

drop policy if exists creditos_uso_service_role_all on public.creditos_uso;
create policy creditos_uso_service_role_all on public.creditos_uso
  as permissive for all to service_role using (true) with check (true);

drop policy if exists creditos_uso_authenticated_select on public.creditos_uso;
create policy creditos_uso_authenticated_select on public.creditos_uso
  as permissive for select to authenticated using (true);
