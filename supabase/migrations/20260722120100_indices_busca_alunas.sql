-- Índices de busca de alunas. As buscas e o matching comparam sempre a forma
-- normalizada (mesma ideia de lib/matching/nomes.ts), então os índices são
-- de expressão sobre funções imutáveis definidas aqui — as queries devem usar
-- as mesmas funções pra aproveitá-los.

create extension if not exists unaccent with schema extensions;

-- lower + sem acento. unaccent puro é STABLE; a forma com o dicionário
-- explícito permite marcar a função como IMMUTABLE, exigido em índice.
create or replace function public.normalizar_texto(texto text)
returns text
language sql
immutable
returns null on null input
as $$
  select lower(extensions.unaccent('extensions.unaccent', texto))
$$;

-- Só dígitos: '+55 (11) 91234-5678' -> '5511912345678'.
create or replace function public.normalizar_telefone(telefone text)
returns text
language sql
immutable
returns null on null input
as $$
  select regexp_replace(telefone, '[^0-9]', '', 'g')
$$;

create index idx_alunas_nome_normalizado
  on public.alunas (public.normalizar_texto(nome));

create index idx_alunas_email
  on public.alunas (lower(email));

create index idx_alunas_telefone_normalizado
  on public.alunas (public.normalizar_telefone(telefone));

-- Índices de pagamentos.status e documentos.status já existem desde as
-- migrations de criação (idx_pagamentos_status, idx_documentos_status).
