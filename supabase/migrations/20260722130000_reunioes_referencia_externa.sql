-- Id do agendamento no sistema de origem (ex.: URI do scheduled_event no
-- Calendly). Necessário pro evento de cancelamento achar a reunião criada
-- antes, e pro upsert idempotente — mesmo padrão de pagamentos.
alter table public.reunioes
  add column referencia_externa text;

alter table public.reunioes
  add constraint reunioes_origem_referencia_externa_key unique (origem, referencia_externa);
