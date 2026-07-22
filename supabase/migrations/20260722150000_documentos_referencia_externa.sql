-- Id do arquivo no Google Drive. Único: upsert idempotente a nível de
-- banco, mesmo padrão de pagamentos, reunioes e formularios.
alter table public.documentos
  add column referencia_externa text;

alter table public.documentos
  add constraint documentos_referencia_externa_key unique (referencia_externa);
