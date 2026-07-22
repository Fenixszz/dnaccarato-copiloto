-- Dedupe de webhooks (regra do projeto: todo webhook é idempotente). A rota
-- consulta (servico, id_externo_evento) ANTES de processar qualquer evento —
-- veja lib/webhooks/idempotencia.ts.
create table public.eventos_processados (
  id uuid primary key default gen_random_uuid(),
  servico text not null,
  -- Id único do evento no sistema de origem.
  id_externo_evento text not null,
  resultado text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (servico, id_externo_evento)
);

create trigger trg_eventos_processados_atualizado_em
  before update on public.eventos_processados
  for each row
  execute function public.definir_atualizado_em();

alter table public.eventos_processados enable row level security;
