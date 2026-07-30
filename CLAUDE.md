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
  (widget)/widget/        # widget de chat público white-label → rota "/widget"
  api/
    webhooks/[servico]/   # ingestão: asaas, autentique, forms, calendly, drive, whatsapp
    mcp/                  # endpoint do servidor MCP (JSON-RPC 2.0)
    cron/briefing/        # dispara o briefing diário (protegido por CRON_SECRET)
    health/              # health check
lib/
  db/                     # cliente Supabase tipado (service_role), queries,
                          #   auditoria e types.ts (gerado do schema)
  env.ts                  # acesso centralizado e validado a variáveis de ambiente
  integrations/           # um client por serviço (asaas, autentique, calendly,
                          #   drive, forms, gmail, agenda, asana) + google-auth
  matching/               # cruzamento de nomes entre sistemas (com testes)
  whatsapp/               # client Evolution API + rate limiter compartilhado
  webhooks/               # helpers: idempotência (dedupe) e validação/erro
  validation/             # schemas Zod de entrada
scripts/                  # seed.ts (dados fictícios) e importar-alunas.ts (CSV/JSON)
supabase/migrations/      # migrations SQL versionadas
tests/                    # testes unitários/integração espelhando /lib e /scripts
```

Regenerar os tipos do banco: `npm run db:types` (precisa do projeto Supabase
linkado ou do `supabase start` local). Seed: `npm run seed`. Importar alunas:
`npm run importar:alunas -- <arquivo.csv|json>`.

## Fases concluídas

- Fase 0 — scaffold Next.js 14 (App Router, TS strict, Tailwind), estrutura de
  pastas, .env.example documentado, layouts base. Builda sem erro e testes passam.
