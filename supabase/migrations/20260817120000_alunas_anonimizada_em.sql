-- Migration: marca de anonimização (LGPD) na tabela alunas.
--
-- A pedido da titular (via Adriana), o cadastro de uma aluna pode ser
-- "removido". Como pagamentos e documentos têm on delete RESTRICT (retenção
-- financeira/legal — ver RETENCAO.md), não apagamos a linha da aluna: fazemos
-- ANONIMIZAÇÃO em vigor (scrub de nome/e-mail/telefone/metadata e remoção das
-- tabelas-filho com PII sem obrigação de retenção). Esta coluna registra QUANDO
-- isso aconteceu, tornando a operação idempotente e permitindo que o dashboard,
-- o matching e os webhooks tratem a aluna como anonimizada (não ressuscitar PII).

alter table public.alunas
  add column if not exists anonimizada_em timestamptz;

comment on column public.alunas.anonimizada_em is
  'Quando a aluna foi anonimizada a pedido da titular (LGPD). NULL = ativa. Ver RETENCAO.md.';

create index if not exists idx_alunas_anonimizada_em
  on public.alunas (anonimizada_em)
  where anonimizada_em is not null;
