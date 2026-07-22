-- Histórico do que já foi enviado no WhatsApp (briefing diário e alertas).
-- Antes de mandar um alerta, o código consulta chave_alerta pra não repetir.
create table public.briefings_enviados (
  id uuid primary key default gen_random_uuid(),
  -- Categoria do envio (ex.: 'briefing_diario', 'alerta_pagamento_atrasado').
  tipo text not null,
  -- Identificador determinístico do alerta pra dedupe
  -- (ex.: 'pagamento_atrasado:<aluna_id>:2026-07-22'). Único: o banco barra
  -- o reenvio mesmo em corrida.
  chave_alerta text not null unique,
  aluna_id uuid references public.alunas (id) on delete restrict,
  conteudo text not null,
  enviado_em timestamptz not null default now()
);

create index idx_briefings_enviados_aluna_id on public.briefings_enviados (aluna_id);
create index idx_briefings_enviados_tipo_enviado_em
  on public.briefings_enviados (tipo, enviado_em desc);

alter table public.briefings_enviados enable row level security;
