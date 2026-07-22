-- Modelo de acesso:
--   - Escrita: SÓ a service role (webhooks, MCP, cron). Ela tem BYPASSRLS,
--     então não precisa de policy — e a ausência de policies de
--     insert/update/delete garante que mais ninguém escreve.
--   - Leitura: usuários autenticados do dashboard (role authenticated) podem
--     ler via as policies abaixo. Anônimos não leem nada.
-- RLS já foi habilitado na migration de criação de cada tabela.

create policy dashboard_le_pagamentos
  on public.pagamentos
  for select
  to authenticated
  using (true);

create policy dashboard_le_documentos
  on public.documentos
  for select
  to authenticated
  using (true);

-- Dashboard lista tokens pra gerenciar (nome/escopo/status). Só o hash está
-- persistido, então nenhum token em claro é exposto.
create policy dashboard_le_api_tokens
  on public.api_tokens
  for select
  to authenticated
  using (true);

create policy dashboard_le_log_auditoria
  on public.log_auditoria
  for select
  to authenticated
  using (true);
