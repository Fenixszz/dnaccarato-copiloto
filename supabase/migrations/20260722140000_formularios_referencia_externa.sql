-- Id da resposta no Google Forms. Único: upsert idempotente a nível de
-- banco, mesmo padrão de pagamentos e reunioes.
alter table public.formularios
  add column referencia_externa text;

alter table public.formularios
  add constraint formularios_referencia_externa_key unique (referencia_externa);
