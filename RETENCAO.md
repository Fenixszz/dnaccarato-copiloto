# Política de retenção e eliminação de dados — Copiloto Dnaccarato

Como o sistema retém, anonimiza e elimina dados pessoais. Base: LGPD (Lei
13.709/2018) — direito de eliminação (art. 18, VI) equilibrado com as hipóteses
de retenção legal (art. 16, I: cumprimento de obrigação legal/regulatória).
Última revisão: **2026-08-17**.

---

## 1. Princípio

Só guardamos dado pessoal enquanto ele serve ao atendimento da aluna **ou**
enquanto uma obrigação legal exige. Quando a titular pede a exclusão, removemos
o que não tem obrigação de retenção e **anonimizamos** (não apagamos) o que a lei
manda guardar — de forma que o registro deixe de identificar a pessoa.

---

## 2. Eliminação a pedido da titular (anonimização)

A Adriana solicita a exclusão pelo endpoint **`POST /api/alunas/[id]/anonimizar`**
(restrito ao e-mail dela, `EMAIL_ADRIANA`; exige `confirmar: true`; toda execução
é auditada em `log_auditoria`). A lógica está em [`lib/lgpd/anonimizar.ts`](lib/lgpd/anonimizar.ts)
e é **idempotente** (aluna já anonimizada → no-op).

O que acontece com cada tabela relacionada:

| Tabela           | Ação                                                                                                                                          | Por quê                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `alunas`         | **Anonimizada** — `nome` vira "Aluna removida"; `email`, `telefone` → NULL; `metadata` (onde mora o **CPF**) → `{}`; carimba `anonimizada_em` | Mantém a linha viva para não violar as FKs de retenção (abaixo), sem PII                                                    |
| `materiais`      | **Apagada**                                                                                                                                   | Arquivos/links do Drive da aluna — PII, sem obrigação de retenção                                                           |
| `formularios`    | **Apagada**                                                                                                                                   | Respostas (JSONB) podem conter PII — sem obrigação de retenção                                                              |
| `reunioes`       | **Apagada**                                                                                                                                   | Links de reunião podem conter PII — sem obrigação de retenção                                                               |
| `tasks_asana`    | **Apagada**                                                                                                                                   | Títulos de tarefa podem conter PII — sem obrigação de retenção                                                              |
| `documentos`     | **Mantida, com scrub** — `link_assinado` e `motivo_rejeicao` → NULL; preserva `tipo`, `status`, `assinado_em`, id externo                     | Retenção legal: prova de que o documento existiu/foi assinado (FK `on delete restrict`)                                     |
| `pagamentos`     | **Mantida**                                                                                                                                   | Retenção fiscal/financeira (FK `on delete restrict`); não tem coluna de PII pessoal — só valor/status/vencimento/referência |
| `log_auditoria`  | **Mantida**                                                                                                                                   | Trilha de auditoria append-only; a própria anonimização é registrada aqui. `aluna_id` já é `on delete set null`             |
| `chat_mensagens` | **Não afetada**                                                                                                                               | Ligada a `auth.users` (usuários do dashboard: Adriana/João), não à aluna                                                    |

> **Por que anonimizar em vez de apagar a aluna?** `pagamentos` e `documentos`
> têm FK `on delete restrict` — apagar a aluna violaria a constraint, e apagar
> esses registros violaria a obrigação de retenção. Anonimizar a linha da aluna
> preserva a integridade referencial e cumpre o direito de eliminação (o dado
> deixa de identificar a titular).

`eventos_brutos` **não** é tratada aqui: não tem FK por aluna (é log cru por
origem/tempo), então não dá para localizar de forma confiável os eventos de uma
aluna específica. Fica coberta pela retenção por tempo (seção 3).

---

## 3. Retenção por tempo — `eventos_brutos` e `log_auditoria`

Duas tabelas são **append-only** e crescem indefinidamente. Elas guardam dado
operacional/de auditoria, não o cadastro em si, e têm janelas de retenção
próprias.

### `eventos_brutos` — payloads crus de webhook

- **O que é:** cópia integral do corpo de cada webhook recebido, gravada
  **antes** de processar (Asaas, Autentique, Calendly, Drive, Forms, WhatsApp…).
  Pode conter PII (nome, CPF em payload de assinatura, telefone).
- **Para que serve:** depuração, reprocessamento e prova de recebimento.
- **Retenção: 90 dias.** Depois disso o valor de negócio some (já foi
  processado) e o risco de guardar PII crua supera o benefício.
- **Como purgar** (rodar periodicamente — cron/pgcron/manual):

  ```sql
  delete from public.eventos_brutos
  where recebido_em < now() - interval '90 days';
  ```

### `log_auditoria` — trilha de ações de escrita

- **O que é:** quem fez o quê, sobre quem, quando e com que resultado (ações de
  MCP, dashboard e cron). `aluna_id` é `on delete set null`; **não** guarda o
  payload, só metadados.
- **Para que serve:** prestação de contas, investigação de incidente, LGPD
  (registro das próprias operações de tratamento, inclusive as anonimizações).
- **Retenção: 24 meses.** Prazo maior que o de `eventos_brutos` porque é a base
  de accountability; como não tem PII em texto livre, o risco de mantê-lo é
  baixo.
- **Como purgar:**

  ```sql
  delete from public.log_auditoria
  where criado_em < now() - interval '24 months';
  ```

> As janelas (90 dias / 24 meses) são o padrão do projeto e podem ser ajustadas
> conforme orientação jurídica. A purga ainda é **manual/agendada por fora** —
> não há job automático no app hoje; quando houver, protegê-lo com `CRON_SECRET`
> como o briefing.

---

## 4. Resumo dos prazos

| Dado                                                  | Retenção                                   | Mecanismo                           |
| ----------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Cadastro da aluna (PII)                               | Enquanto ativa; some no pedido de exclusão | Anonimização (seção 2)              |
| `materiais`, `formularios`, `reunioes`, `tasks_asana` | Enquanto a aluna estiver ativa             | Apagados na anonimização            |
| `pagamentos`                                          | Obrigação fiscal/financeira                | Retido (sem PII pessoal)            |
| `documentos`                                          | Obrigação legal (prova de assinatura)      | Retido com PII em texto livre limpa |
| `eventos_brutos`                                      | 90 dias                                    | Purga por tempo                     |
| `log_auditoria`                                       | 24 meses                                   | Purga por tempo                     |
