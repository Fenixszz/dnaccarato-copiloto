# Copiloto Dnaccarato

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

## Integração contínua (CI)

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em **todo push e pull request**, na ordem: instalar dependências → lint → typecheck → testes → build. Se qualquer etapa falhar, o workflow inteiro falha.

### Onde ver o status

- **Aba Actions**: no GitHub, abra o repositório → aba **Actions**. Cada execução aparece com ✅ (passou) ou ❌ (falhou); clique numa execução pra ver o log de cada etapa e descobrir qual comando falhou.
- **No commit**: na lista de commits, cada commit mostra ✅/❌ ao lado do hash; o ícone leva direto pro log.
- **No pull request**: o status aparece no rodapé do PR ("All checks have passed" / "Some checks were not successful"), antes do botão de merge.
- **Badge no README**: depois do primeiro push pro GitHub, substitua `USUARIO/REPO` abaixo e descomente pra mostrar o status do branch principal aqui:

<!-- [![CI](https://github.com/USUARIO/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USUARIO/REPO/actions/workflows/ci.yml) -->
