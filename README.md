# Copiloto Dnaccarato

[![CI](https://github.com/Fenixszz/dnaccarato-copiloto/actions/workflows/ci.yml/badge.svg)](https://github.com/Fenixszz/dnaccarato-copiloto/actions/workflows/ci.yml)

Copiloto operacional da clínica Dnaccarato: ingestão de eventos (Asaas, Google Forms, Calendly, Drive, WhatsApp), briefing diário, dashboard administrativo, widget de chat white-label e servidor MCP.

Stack: Next.js (App Router) · TypeScript strict · Tailwind · Supabase · Vitest.

As regras de qualidade do projeto estão no `CLAUDE.md` na raiz do workspace.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis (cada uma está comentada)
npm run dev
```

- Dashboard: <http://localhost:3000>
- Widget: <http://localhost:3000/widget>
- Health check: <http://localhost:3000/api/health>

## Scripts

| Script              | O que faz                                                                    |
| ------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`       | Sobe o servidor de desenvolvimento                                           |
| `npm run lint`      | ESLint estrito (qualquer warning falha)                                      |
| `npm run typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit`                          |
| `npm test`          | Testes unitários (Vitest)                                                    |
| `npm run build`     | Build de produção                                                            |
| `npm run check`     | Lint + typecheck + testes + build, em sequência. Rode antes de qualquer push |
| `npm run format`    | Formata o repositório com Prettier                                           |

Todo commit passa automaticamente por lint (`lint-staged`) e typecheck via hook de pre-commit (Husky).

## Banco de dados

As migrations estão em [`supabase/migrations/`](supabase/migrations/) — veja [`supabase/README.md`](supabase/README.md) para como aplicá-las e as decisões de schema. Os tipos TypeScript do banco vivem em `lib/db/types.ts`; depois de qualquer mudança de schema num projeto linkado, regenere com `npm run db:types`.

### Seed de dados de teste

```bash
npm run seed
```

Exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` e as migrations já aplicadas. Insere 5 alunas fictícias, uma por cenário que o copiloto precisa detectar:

| Aluna             | Cenário                                        |
| ----------------- | ---------------------------------------------- |
| Ana Paula Ribeiro | Em dia com tudo (não deve gerar alerta)        |
| Beatriz Lima      | Pagamento vencido há 10 dias, ainda pendente   |
| Carla Mendes      | Contrato assinado, mas nenhuma reunião marcada |
| Daniela Souza     | Formulário respondido há 7 dias sem follow-up  |
| Elisa Ferreira    | Task do Asana aberta há 12 dias, parada        |

### Resetando o banco de teste

- **Só os dados do seed**: rode `npm run seed` de novo — ele apaga o seed anterior (alunas marcadas com `metadata.seed = true` e todos os registros vinculados) antes de inserir, então é seguro re-rodar quantas vezes quiser.
- **Banco inteiro (stack local do Supabase)**: `npx supabase db reset` derruba, recria e reaplica todas as migrations. **Nunca** rode contra o projeto de produção.

## Integração contínua (CI)

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em **todo push e pull request**, na ordem: instalar dependências → lint → typecheck → testes → build. Se qualquer etapa falhar, o workflow inteiro falha.

### Onde ver o status

- **Aba Actions**: no GitHub, abra o repositório → aba **Actions**. Cada execução aparece com ✅ (passou) ou ❌ (falhou); clique numa execução pra ver o log de cada etapa e descobrir qual comando falhou.
- **No commit**: na lista de commits, cada commit mostra ✅/❌ ao lado do hash; o ícone leva direto pro log.
- **No pull request**: o status aparece no rodapé do PR ("All checks have passed" / "Some checks were not successful"), antes do botão de merge.
- **Badge no README**: o selo no topo deste arquivo mostra o status do branch principal.
