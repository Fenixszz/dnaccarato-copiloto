# Regras do projeto — Copiloto Dnaccarato

## Padrão de qualidade (aplica em TODO código gerado, sem exceção, em qualquer prompt futuro desta sessão)

- TypeScript em modo strict. Nada de `any` sem justificativa em comentário.
- Toda rota de API valida o payload de entrada com Zod antes de processar qualquer coisa. Payload inválido retorna 400 com mensagem clara.
- Toda função de lógica de negócio relevante (matching, priorização do briefing, detector de furos) tem teste unitário (Vitest).
- Todo webhook é idempotente: usa um identificador externo único do evento pra nunca processar o mesmo evento duas vezes. Checa numa tabela de dedupe (eventos_processados) ANTES de processar.
- Todo erro é tratado explicitamente. Nunca deixa uma exceção não capturada estourar uma rota de API. Loga o erro com contexto (rota, payload resumido sem dado sensível, timestamp) e retorna resposta HTTP apropriada.
- Nenhuma credencial, token ou segredo hardcoded em nenhum arquivo. Tudo via variável de ambiente, documentado em .env.example com comentário do que é e de quem é a conta (ex: "conta Asaas da Adriana", "conta Anthropic do João/FOVA").
- Toda tabela com dado sensível (pagamentos, documentos, tokens de API) tem Row Level Security habilitado no Supabase.
- Toda ação de escrita (tools MCP, ações do dashboard) grava numa tabela de auditoria: quem fez, o quê, quando, resultado.
- Toda tela do dashboard tem estado de loading, estado de erro e estado vazio.
- Toda rota que envia mensagem via WhatsApp passa por um rate limiter compartilhado — nunca dispara em rajada.
- Commits pequenos e descritivos, um por sub-fase concluída.
- Cada sub-fase só é considerada terminada quando o projeto builda sem erro E os testes passam.

## Convenções

- Nomes de tabela e campo do banco em português, snake_case.
- Estrutura de pastas documentada abaixo (preenchida conforme as fases avançam).

## Estrutura de pastas

```
app/
  (dashboard)/            # área administrativa autenticada → rota "/"
                          #   layout faz o gate de auth + nav; actions.ts = logout
                          #   home (cards), alunas/ (lista + busca),
                          #   alunas/[id]/ (dossiê), furos/ (pendências +
                          #   ações rápidas), creditos/ (saldo/Pix/recarga);
                          #   _components compartilhados
  login/                  # tela de login (email/senha) → rota "/login" (pública)
  (widget)/widget/        # widget de chat público white-label → rota "/widget"
  api/
    webhooks/[servico]/   # ingestão: asaas, autentique, forms, calendly, drive, whatsapp
    mcp/                  # endpoint do servidor MCP (JSON-RPC 2.0)
    widget/chat/          # POST chat do widget → Anthropic+MCP (key no servidor)
    creditos/recarga/     # POST recarga de crédito (só o João; auth por cookie)
    cron/briefing/        # dispara o briefing diário (protegido por CRON_SECRET)
    health/              # health check
lib/
  auth/                   # allowlist do dashboard (só Adriana/João, por env)
  chat/                   # histórico do chat do widget por usuário
  creditos/               # saldo/recarga/uso + custos e avaliação (avisos) — testado
  supabase/               # clientes SSR do usuário logado (server.ts + middleware.ts)
  db/                     # cliente Supabase tipado (service_role), queries,
                          #   auditoria e types.ts (gerado do schema)
  env.ts                  # acesso centralizado e validado a variáveis de ambiente
  integrations/           # um client por serviço (asaas, autentique, calendly,
                          #   drive, forms, gmail, agenda, asana) + google-auth
  lgpd/                   # anonimização de aluna (direito de eliminação) — testado
  matching/               # cruzamento de nomes entre sistemas (com testes)
  whatsapp/               # client Evolution API + rate limiter compartilhado
  webhooks/               # helpers: idempotência (dedupe) e validação/erro
  validation/             # schemas Zod de entrada
middleware.ts             # renova a sessão Supabase e protege o dashboard
scripts/                  # seed.ts (dados fictícios), importar-alunas.ts (CSV/JSON)
                          #   e seed-usuarios.ts (provisiona Adriana/João)
supabase/migrations/      # migrations SQL versionadas
tests/                    # testes unitários/integração espelhando /lib e /scripts
```

Regenerar os tipos do banco: `npm run db:types` (precisa do projeto Supabase
linkado ou do `supabase start` local). Seed: `npm run seed`. Importar alunas:
`npm run importar:alunas -- <arquivo.csv|json>`. Provisionar os usuários do
dashboard (Adriana/João): `npm run seed:usuarios`.

## Fases concluídas

- Fase 0 — scaffold Next.js 14 (App Router, TS strict, Tailwind), estrutura de
  pastas, .env.example documentado, layouts base. Builda sem erro e testes passam.
- Autenticação do dashboard — Supabase Auth (email/senha) via @supabase/ssr,
  cadastro fechado a dois usuários (allowlist EMAIL_ADRIANA/EMAIL_JOAO). Middleware
  renova a sessão e redireciona não autenticados para /login; o layout de
  (dashboard) refaz o gate. Login/logout auditados. Provisionamento por
  `seed:usuarios`. Builda sem erro e testes passam.
- Home do dashboard — cards com totais reais (alunas ativas, pagamentos em
  atraso, documentos pendentes/rejeitados, reuniões da semana) via
  `contarResumoDashboard` (queries head+count, service_role). Janela da semana
  em `intervaloSemanaSP` (lib/tempo, testada). Tela com loading (loading.tsx),
  erro (error.tsx) e vazio. Fake do Supabase estendido (count/head, in, gte,
  lt). Builda sem erro e testes passam.
- Lista de alunas + dossiê — /alunas com busca por nome/e-mail/telefone
  (`alunaCasaBusca`/`filtrarAlunas` em lib/alunas/busca, testada; casa telefone
  com/sem máscara). Cada linha abre /alunas/[id] com o dossiê completo
  (`carregarDossie` reaproveitado pela rota de API). Telas com loading, erro,
  vazio e not-found. Formatação em lib/formato. Builda sem erro e testes passam.
- Tela de furos — /furos lista os furos de TODAS as alunas
  (`detectarFurosDeTodas`), ordenados por severidade, com ações rápidas
  (mandar lembrete / criar task) que chamam as tools MCP de escrita via
  `executarFerramentaAuditada` (lib/mcp/executar) — ponto único de "executar
  tool + auditar", reaproveitado pela rota MCP (origem "mcp") e pelo dashboard
  (origem "dashboard"). Builda sem erro e testes passam.
- Fluxo de crédito — saldo global (medidor de transparência, NUNCA bloqueia).
  Recarga manual só do João (POST /api/creditos/recarga, checa EMAIL_JOAO,
  auditada) + chave Pix (PIX_CHAVE_JOAO) exibida pra Adriana copiar. Débito
  automático best-effort em cada chamada Anthropic (por tokens do `usage`) e
  cada WhatsApp enviado (lib/creditos + custos). Avisos escalonados no briefing
  (avaliarCreditos: leve <30% / claro <10% / zerado) com estimativa de dias
  restantes (média de 7 dias). Tela /creditos com loading/erro/vazio. Custos e
  avaliação testados. Builda sem erro e testes passam.
- Tela de créditos por papel — /creditos mostra pra ambos: saldo com semáforo
  (verde/amarelo/vermelho via `semaforoDoNivel`), "dias restantes", frase de que
  o serviço não para, extrato de uso por categoria (IA/WhatsApp) e histórico de
  recargas. Só a Adriana: bloco "Adicionar créditos" (chave Pix + copiar). Só o
  João: "Registrar recarga recebida" e — se ANTHROPIC_ADMIN_API_KEY existir — o
  consumo real de IA dos últimos 30 dias (Cost Report API, best-effort) pra
  comparar com a estimativa. Loading/erro/vazio. Builda sem erro e testes passam.
- Erro de billing da Anthropic — detectado no único ponto que chama a API da
  Anthropic (`responderComMcp`, path do copiloto/MCP): `ehErroBillingAnthropic`
  (puro, testado) distingue saldo/cartão recusado de falha genérica. Quando é
  billing: loga em falhas_sistema (ALTA) e avisa o WhatsApp do JOÃO
  (WHATSAPP_JOAO, com throttle de 3h), não o da Adriana — é infra dele. A Adriana
  segue recebendo só o fallback do copiloto. Builda sem erro e testes passam.
- Widget (casca) — /widget como chat full-screen público (sem auth): histórico
  de mensagens (usuário/atendimento), campo de texto (Enter envia), auto-scroll.
  Sem estilização de marca ainda (neutro) e resposta ainda é placeholder (sem
  backend). Builda sem erro e testes passam.
- LGPD — exclusão/retenção — endpoint `POST /api/alunas/[id]/anonimizar`
  (restrito à Adriana via EMAIL_ADRIANA; exige `confirmar: true`; auditado)
  atende o direito de eliminação da titular. `anonimizarAluna` (lib/lgpd,
  testada) remove as tabelas-filho com PII sem retenção (materiais, formularios,
  reunioes, tasks_asana), faz scrub da PII em texto livre dos documentos retidos
  e anonimiza a linha da aluna (nome/e-mail/telefone/metadata zerados,
  `anonimizada_em` carimbado) — pagamentos e documentos são mantidos por
  obrigação legal (FK `on delete restrict`). Idempotente. Política de retenção
  documentada em RETENCAO.md (eventos_brutos 90d, log_auditoria 24m). Aviso de
  privacidade no widget. Requer aplicar a migration 20260817120000
  (coluna alunas.anonimizada_em). Builda sem erro e testes passam.
- Widget conectado — /widget agora fala com a Anthropic pelo backend
  (POST /api/widget/chat): a API key e o token do MCP ficam só no servidor
  (nunca no client); passa mcp_servers pro servidor MCP (Fase 4) via
  `responderComMcpHistorico`. Histórico associado ao USUÁRIO LOGADO (sessão
  Supabase) em `chat_mensagens` (RLS: dono lê, service_role escreve); a rota
  exige auth (401 sem sessão). Falha da IA (billing/outra) → fallback, não trava
  o chat. Builda sem erro e testes passam. Requer aplicar a migration
  20260813120000 (tabela chat_mensagens).
