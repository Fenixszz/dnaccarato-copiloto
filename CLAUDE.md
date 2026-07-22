@AGENTS.md

# Regras do projeto — Copiloto Dnaccarato

## Padrão de qualidade

Aplica-se a **todo** código gerado, sem exceção, em qualquer prompt futuro desta sessão.

### TypeScript

- TypeScript em modo strict. Nada de `any` sem justificativa em comentário.

### Validação de entrada

- Toda rota de API valida o payload de entrada com Zod **antes** de processar qualquer coisa.
- Payload inválido retorna 400 com mensagem clara — nunca deixa passar silenciosamente.

### Testes

- Toda função de lógica de negócio relevante (matching, priorização do briefing, cálculo de crédito, detector de furos) tem teste unitário (Vitest).
- Não escreve a função sem o teste correspondente.

### Webhooks

- Todo webhook é idempotente: usa um identificador externo único do evento pra nunca processar o mesmo evento duas vezes.
- Checa numa tabela de dedupe (`eventos_processados`) **antes** de processar.

### Tratamento de erros

- Todo erro é tratado explicitamente. Nunca deixa uma exceção não capturada estourar uma rota de API.
- Loga o erro com contexto (rota, payload resumido sem dado sensível, timestamp) e retorna resposta HTTP apropriada.

### Segredos e credenciais

- Nenhuma credencial, token ou segredo hardcoded em nenhum arquivo.
- Tudo via variável de ambiente, documentado em `.env.example` com comentário do que é.

### Segurança de dados

- Toda tabela com dado sensível (pagamentos, documentos, créditos, tokens de API) tem Row Level Security habilitado no Supabase.

### Auditoria

- Toda ação de escrita (tools MCP, ações do dashboard) grava numa tabela de auditoria: quem fez, o quê, quando, resultado.

### UI / Dashboard

- Toda tela do dashboard tem estado de loading, estado de erro e estado vazio — nunca uma tela em branco sem feedback pro usuário.

### Fluxo de trabalho

- Commits pequenos e descritivos, um por sub-fase concluída.
- Cada sub-fase só é considerada terminada quando o projeto builda sem erro **e** os testes passam.

## Convenções

- Nomes de tabela e campo do banco em português, snake_case.
- Nomes de função e variável em código em português ou inglês, mas consistente dentro do mesmo arquivo.
- Estrutura de pastas documentada abaixo (vai sendo preenchida conforme as fases avançam).

## Estrutura de pastas

O projeto vive em `dnaccarato-copiloto/` (Next.js App Router, TypeScript strict, Tailwind).

```
dnaccarato-copiloto/
├── app/
│   ├── (dashboard)/          # área administrativa autenticada (rota "/")
│   ├── (widget)/widget/      # página pública do widget de chat white-label
│   └── api/
│       ├── webhooks/[servico]/  # ingestão: asaas, forms, calendly, drive, whatsapp
│       ├── mcp/              # endpoint do servidor MCP
│       ├── cron/briefing/    # disparo do briefing diário (protegido por CRON_SECRET)
│       └── health/           # health check
├── lib/
│   ├── db/                   # cliente Supabase e queries
│   ├── integrations/         # um client por serviço (asaas, calendly, drive, forms, gmail, agenda, asana)
│   ├── matching/             # cruzamento de nomes entre sistemas
│   ├── whatsapp/             # client da Evolution API
│   ├── webhooks/             # helpers compartilhados (idempotência, validação)
│   ├── validation/           # schemas Zod
│   └── log.ts                # log de erro estruturado das rotas
├── supabase/migrations/      # migrations SQL (alunas, pagamentos, documentos,
│                             #   formularios, reunioes, tasks_asana, eventos_processados)
├── tests/                    # Vitest, espelhando a estrutura de /lib
└── .env.example              # todas as variáveis, comentadas
```
