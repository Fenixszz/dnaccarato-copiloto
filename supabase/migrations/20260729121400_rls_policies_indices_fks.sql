-- Migration: hardening — RLS policies, índices de busca e ON DELETE das FKs.
--
-- Contexto: a RLS já estava habilitada (default-deny) em todas as tabelas
-- desde as migrations anteriores. Aqui adicionamos as POLICIES explícitas,
-- índices de busca e corrigimos os ON DELETE que ainda estavam em CASCADE.
--
-- Roles do Supabase (já existem no projeto):
--   - service_role: usada pelos webhooks e pelo MCP no servidor. Tem BYPASSRLS,
--     então ignora RLS por padrão; ainda assim declaramos a policy "for all"
--     para deixar a intenção explícita e documentada.
--   - authenticated: usuário logado no dashboard. Só LÊ (SELECT).
--   - anon: público (widget). NÃO recebe policy nenhuma → acesso negado.

-- =============================================================================
-- 1. Row Level Security + policies (só service_role escreve; authenticated lê)
-- =============================================================================
-- Aplicado às tabelas pedidas: pagamentos, documentos, materiais, api_tokens,
-- log_auditoria. `enable` é idempotente (já estava ligado).

do $$
declare
  t text;
  tabelas text[] := array[
    'pagamentos', 'documentos', 'materiais', 'api_tokens', 'log_auditoria'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security;', t);

    -- Escrita (e leitura) para a service role — intenção explícita.
    execute format('drop policy if exists %I on public.%I;', t || '_service_role_all', t);
    execute format(
      'create policy %I on public.%I as permissive for all to service_role using (true) with check (true);',
      t || '_service_role_all', t
    );

    -- Leitura para usuários autenticados do dashboard (nunca anon).
    execute format('drop policy if exists %I on public.%I;', t || '_authenticated_select', t);
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (true);',
      t || '_authenticated_select', t
    );
  end loop;
end $$;

-- =============================================================================
-- 2. Índices de busca
-- =============================================================================
create index if not exists idx_alunas_nome on public.alunas (nome);

-- Telefone normalizado (só dígitos) → permite buscar ignorando máscara/formatação.
-- A aplicação deve usar a MESMA expressão no WHERE para o índice ser usado:
--   where regexp_replace(telefone, '\D', '', 'g') = '<so_digitos>'
create index if not exists idx_alunas_telefone_normalizado
  on public.alunas (regexp_replace(telefone, '\D', '', 'g'));

-- Obs.: alunas.email já é indexado pelo índice único parcial uq_alunas_email
-- (criado com a tabela). Um índice adicional em email seria redundante e só
-- pesaria nas escritas, então não é criado aqui de propósito.

create index if not exists idx_pagamentos_status on public.pagamentos (status);
create index if not exists idx_documentos_status on public.documentos (status);
create index if not exists idx_documentos_documento_id_externo
  on public.documentos (documento_id_externo);

-- =============================================================================
-- 3. ON DELETE das foreign keys → nunca CASCADE silencioso
-- =============================================================================
-- pagamentos e documentos já eram RESTRICT (dado financeiro/legal preservado).
-- log_auditoria já era SET NULL (auditoria sobrevive à remoção da aluna).
-- As quatro abaixo estavam em CASCADE → passam a RESTRICT: deletar uma aluna
-- exige remover explicitamente os registros filhos antes (deleção deliberada,
-- sem perda silenciosa de dados).

alter table public.materiais drop constraint if exists materiais_aluna_id_fkey;
alter table public.materiais add constraint materiais_aluna_id_fkey
  foreign key (aluna_id) references public.alunas (id) on delete restrict;

alter table public.formularios drop constraint if exists formularios_aluna_id_fkey;
alter table public.formularios add constraint formularios_aluna_id_fkey
  foreign key (aluna_id) references public.alunas (id) on delete restrict;

alter table public.reunioes drop constraint if exists reunioes_aluna_id_fkey;
alter table public.reunioes add constraint reunioes_aluna_id_fkey
  foreign key (aluna_id) references public.alunas (id) on delete restrict;

alter table public.tasks_asana drop constraint if exists tasks_asana_aluna_id_fkey;
alter table public.tasks_asana add constraint tasks_asana_aluna_id_fkey
  foreign key (aluna_id) references public.alunas (id) on delete restrict;
