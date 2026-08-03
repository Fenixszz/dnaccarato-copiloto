-- Migration: reunioes.referencia_externa.
-- Necessário para casar o evento de CANCELAMENTO com a reunião CRIADA antes
-- (ex.: a uri do invitee no Calendly é a mesma nos dois eventos). Também serve
-- de dedupe: created insere, canceled atualiza a mesma linha.

alter table public.reunioes add column if not exists referencia_externa text;

comment on column public.reunioes.referencia_externa is
  'Id externo do agendamento na origem (ex: uri do invitee no Calendly). Dedup/atualização.';

create unique index if not exists uq_reunioes_origem_referencia
  on public.reunioes (origem, referencia_externa)
  where referencia_externa is not null;
