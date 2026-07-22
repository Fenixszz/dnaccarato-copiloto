import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/calendly/route";

const CHAVE_ASSINATURA = "chave_de_teste_do_calendly";

// Fake em memória das tabelas usadas pelo fluxo do webhook.
const { tabelas, criarSupabaseFalso } = vi.hoisted(() => {
  const tabelas = {
    alunas: [] as Array<Record<string, unknown>>,
    reunioes: new Map<string, Record<string, unknown>>(),
    eventos_brutos: [] as Array<Record<string, unknown>>,
    eventos_processados: new Map<string, Record<string, unknown>>(),
  };
  let sequencia = 1;

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => {
        if (tabela === "eventos_processados") {
          return {
            select: () => {
              const filtros: Record<string, string> = {};
              const consulta = {
                eq: (coluna: string, valor: string) => {
                  filtros[coluna] = valor;
                  return consulta;
                },
                maybeSingle: () => {
                  const linha = tabelas.eventos_processados.get(
                    `${filtros["origem"]}:${filtros["evento_id_externo"]}`
                  );
                  return Promise.resolve({ data: linha ?? null, error: null });
                },
              };
              return consulta;
            },
            insert: (registro: { origem: string; evento_id_externo: string }) => {
              const id = `${registro.origem}:${registro.evento_id_externo}`;
              if (tabelas.eventos_processados.has(id)) {
                return Promise.resolve({ error: { message: "duplicate key" } });
              }
              tabelas.eventos_processados.set(id, { ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        if (tabela === "eventos_brutos") {
          return {
            insert: (registro: Record<string, unknown>) => {
              tabelas.eventos_brutos.push({ ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        if (tabela === "alunas") {
          return {
            select: () => Promise.resolve({ data: [...tabelas.alunas], error: null }),
            insert: (registro: Record<string, unknown>) => ({
              select: () => ({
                single: () => {
                  const nova = { id: `aluna_${sequencia++}`, ...registro };
                  tabelas.alunas.push(nova);
                  return Promise.resolve({ data: { id: nova.id }, error: null });
                },
              }),
            }),
          };
        }
        if (tabela === "reunioes") {
          return {
            upsert: (registro: { origem: string; referencia_externa: string }) => {
              const id = `${registro.origem}:${registro.referencia_externa}`;
              tabelas.reunioes.set(id, { ...(tabelas.reunioes.get(id) ?? {}), ...registro });
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Tabela inesperada no teste: ${tabela}`);
      },
    };
  }

  return { tabelas, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));

// Payload no formato real dos webhooks v2 do Calendly (developer.calendly.com).
const payloadAgendamentoCriado = {
  created_at: "2026-07-22T14:10:00.000000Z",
  created_by: "https://api.calendly.com/users/AAAAAAAAAAAAAAAA",
  event: "invitee.created",
  payload: {
    uri: "https://api.calendly.com/scheduled_events/GBGBDCAADAEDCRZ2/invitees/AAAAAAAAAAAAAAAA",
    name: "Paula Andrade",
    email: "paula.andrade@example.com",
    status: "active",
    text_reminder_number: "+55 11 95555-0005",
    rescheduled: false,
    reschedule_url: "https://calendly.com/reschedulings/AAAAAAAAAAAAAAAA",
    cancel_url: "https://calendly.com/cancellations/AAAAAAAAAAAAAAAA",
    scheduled_event: {
      uri: "https://api.calendly.com/scheduled_events/GBGBDCAADAEDCRZ2",
      name: "Consulta inicial",
      status: "active",
      start_time: "2026-07-25T13:00:00.000000Z",
      end_time: "2026-07-25T13:30:00.000000Z",
      location: {
        type: "google_conference",
        join_url: "https://meet.google.com/abc-defg-hij",
      },
    },
    questions_and_answers: [],
  },
};

const payloadAgendamentoCancelado = {
  ...payloadAgendamentoCriado,
  event: "invitee.canceled",
  payload: {
    ...payloadAgendamentoCriado.payload,
    status: "canceled",
    cancellation: { canceled_by: "Paula Andrade", reason: "Imprevisto" },
  },
};

function assinar(corpo: string, chave: string = CHAVE_ASSINATURA, timestamp?: number): string {
  const t = timestamp ?? Date.now();
  const v1 = createHmac("sha256", chave).update(`${t}.${corpo}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function requisicao(payload: unknown, assinatura?: string): Request {
  const corpo = JSON.stringify(payload);
  return new Request("http://localhost/api/webhooks/calendly", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "calendly-webhook-signature": assinatura ?? assinar(corpo),
    },
    body: corpo,
  });
}

beforeEach(() => {
  vi.stubEnv("CALENDLY_WEBHOOK_SIGNING_KEY", CHAVE_ASSINATURA);
  tabelas.alunas.length = 0;
  tabelas.eventos_brutos.length = 0;
  tabelas.reunioes.clear();
  tabelas.eventos_processados.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/calendly — agendamento criado", () => {
  it("cria a aluna quando não há matching e grava a reunião agendada", async () => {
    const resposta = await POST(requisicao(payloadAgendamentoCriado));

    expect(resposta.status).toBe(200);
    expect(tabelas.eventos_brutos).toHaveLength(1);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.alunas[0]).toMatchObject({
      nome: "Paula Andrade",
      email: "paula.andrade@example.com",
    });
    const reuniao = tabelas.reunioes.get(
      "calendly:https://api.calendly.com/scheduled_events/GBGBDCAADAEDCRZ2"
    );
    expect(reuniao).toMatchObject({
      aluna_id: tabelas.alunas[0].id,
      origem: "calendly",
      status: "agendada",
      data_hora: "2026-07-25T13:00:00.000000Z",
      link: "https://meet.google.com/abc-defg-hij",
    });
    expect(tabelas.eventos_processados.size).toBe(1);
  });

  it("vincula à aluna existente quando o email bate", async () => {
    tabelas.alunas.push({
      id: "aluna_existente",
      nome: "Paula A.",
      email: "PAULA.ANDRADE@example.com",
      telefone: null,
    });

    await POST(requisicao(payloadAgendamentoCriado));

    expect(tabelas.alunas).toHaveLength(1);
    expect(
      tabelas.reunioes.get("calendly:https://api.calendly.com/scheduled_events/GBGBDCAADAEDCRZ2")
    ).toMatchObject({ aluna_id: "aluna_existente" });
  });

  it("mesmo evento entregue duas vezes: 200 nas duas, sem duplicar nada", async () => {
    const primeira = await POST(requisicao(payloadAgendamentoCriado));
    const segunda = await POST(requisicao(payloadAgendamentoCriado));

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.reunioes.size).toBe(1);
    expect(tabelas.eventos_brutos).toHaveLength(1);
  });
});

describe("POST /api/webhooks/calendly — agendamento cancelado", () => {
  it("cancelamento atualiza a mesma reunião pra cancelada, sem duplicar", async () => {
    await POST(requisicao(payloadAgendamentoCriado));
    const resposta = await POST(requisicao(payloadAgendamentoCancelado));

    expect(resposta.status).toBe(200);
    expect(tabelas.reunioes.size).toBe(1);
    expect(
      tabelas.reunioes.get("calendly:https://api.calendly.com/scheduled_events/GBGBDCAADAEDCRZ2")
    ).toMatchObject({ status: "cancelada" });
    // created e canceled são eventos distintos na idempotência.
    expect(tabelas.eventos_processados.size).toBe(2);
    expect(tabelas.alunas).toHaveLength(1);
  });
});

describe("POST /api/webhooks/calendly — assinatura e validação", () => {
  it("assinatura com chave errada responde 401 sem tocar no banco", async () => {
    const corpo = JSON.stringify(payloadAgendamentoCriado);
    const resposta = await POST(
      requisicao(payloadAgendamentoCriado, assinar(corpo, "chave_errada"))
    );
    expect(resposta.status).toBe(401);
    expect(tabelas.eventos_brutos).toHaveLength(0);
  });

  it("assinatura fora da janela de tolerância responde 401", async () => {
    const corpo = JSON.stringify(payloadAgendamentoCriado);
    const dezMinutosAtras = Date.now() - 10 * 60 * 1000;
    const resposta = await POST(
      requisicao(payloadAgendamentoCriado, assinar(corpo, CHAVE_ASSINATURA, dezMinutosAtras))
    );
    expect(resposta.status).toBe(401);
  });

  it("sem header de assinatura responde 401", async () => {
    const corpo = JSON.stringify(payloadAgendamentoCriado);
    const resposta = await POST(
      new Request("http://localhost/api/webhooks/calendly", { method: "POST", body: corpo })
    );
    expect(resposta.status).toBe(401);
  });

  it("payload sem scheduled_event responde 400 com mensagem clara", async () => {
    const invalido = {
      event: "invitee.created",
      payload: { uri: "https://api.calendly.com/x", name: "Paula" },
    };
    const resposta = await POST(requisicao(invalido));
    expect(resposta.status).toBe(400);
    const corpo: { erro: string } = await resposta.json();
    expect(corpo.erro).toContain("scheduled_event");
  });

  it("evento não tratado responde 200 e só guarda o bruto", async () => {
    const resposta = await POST(
      requisicao({ event: "routing_form_submission.created", payload: undefined })
    );
    expect(resposta.status).toBe(200);
    expect(tabelas.eventos_brutos).toHaveLength(1);
    expect(tabelas.reunioes.size).toBe(0);
    expect(tabelas.alunas).toHaveLength(0);
  });
});
