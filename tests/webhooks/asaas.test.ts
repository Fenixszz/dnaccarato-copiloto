import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/asaas/route";
import { buscarClienteAsaas } from "@/lib/integrations/asaas";
import { ehRecargaDeCreditos } from "@/lib/webhooks/asaas";
import { pagamentoAsaasSchema } from "@/lib/validation/asaas";

const TOKEN_WEBHOOK = "token_de_teste_do_webhook";

// Fake em memória das tabelas usadas pelo fluxo do webhook.
const { tabelas, criarSupabaseFalso } = vi.hoisted(() => {
  const tabelas = {
    alunas: [] as Array<Record<string, unknown>>,
    pagamentos: new Map<string, Record<string, unknown>>(),
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
        if (tabela === "pagamentos") {
          return {
            upsert: (registro: { origem: string; referencia_externa: string }) => {
              const id = `${registro.origem}:${registro.referencia_externa}`;
              tabelas.pagamentos.set(id, { ...(tabelas.pagamentos.get(id) ?? {}), ...registro });
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
vi.mock("@/lib/integrations/asaas", () => ({ buscarClienteAsaas: vi.fn() }));

// Payload no formato real dos webhooks do Asaas (docs.asaas.com).
const payloadPagamentoConfirmado = {
  id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
  event: "PAYMENT_CONFIRMED",
  dateCreated: "2026-07-22 10:31:44",
  payment: {
    object: "payment",
    id: "pay_080225913252",
    dateCreated: "2026-07-15",
    customer: "cus_G7Dvo4iphUNk",
    subscription: "sub_VXJBYgP2u0eO",
    value: 1200,
    netValue: 1178.9,
    billingType: "PIX",
    status: "CONFIRMED",
    description: "Mensalidade do programa",
    externalReference: null,
    dueDate: "2026-07-22",
    originalDueDate: "2026-07-22",
    paymentDate: "2026-07-22",
    clientPaymentDate: "2026-07-22",
    invoiceUrl: "https://www.asaas.com/i/080225913252",
    invoiceNumber: "00005101",
    deleted: false,
    anticipated: false,
  },
};

function requisicao(payload: unknown, token: string | null = TOKEN_WEBHOOK): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) {
    headers["asaas-access-token"] = token;
  }
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN_WEBHOOK);
  tabelas.alunas.length = 0;
  tabelas.eventos_brutos.length = 0;
  tabelas.pagamentos.clear();
  tabelas.eventos_processados.clear();
  vi.mocked(buscarClienteAsaas).mockReset();
  vi.mocked(buscarClienteAsaas).mockResolvedValue({
    name: "Maria Fernanda Costa",
    email: "maria.costa@example.com",
    mobilePhone: "+55 11 94444-0004",
    phone: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/asaas — pagamento confirmado", () => {
  it("cria a aluna quando não há matching e grava o pagamento", async () => {
    const resposta = await POST(requisicao(payloadPagamentoConfirmado));

    expect(resposta.status).toBe(200);
    expect(tabelas.eventos_brutos).toHaveLength(1);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.alunas[0]).toMatchObject({
      nome: "Maria Fernanda Costa",
      email: "maria.costa@example.com",
    });
    const pagamento = tabelas.pagamentos.get("asaas:pay_080225913252");
    expect(pagamento).toMatchObject({
      aluna_id: tabelas.alunas[0].id,
      origem: "asaas",
      status: "CONFIRMED",
      valor: 1200,
      vencimento: "2026-07-22",
      pago_em: "2026-07-22",
    });
    expect(tabelas.eventos_processados.size).toBe(1);
  });

  it("vincula à aluna existente quando email ou telefone batem", async () => {
    tabelas.alunas.push({
      id: "aluna_existente",
      nome: "Maria F. Costa",
      email: null,
      telefone: "11944440004",
    });

    const resposta = await POST(requisicao(payloadPagamentoConfirmado));

    expect(resposta.status).toBe(200);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.pagamentos.get("asaas:pay_080225913252")).toMatchObject({
      aluna_id: "aluna_existente",
    });
  });

  it("mesmo evento entregue duas vezes: 200 nas duas, sem duplicar nada", async () => {
    const primeira = await POST(requisicao(payloadPagamentoConfirmado));
    const segunda = await POST(requisicao(payloadPagamentoConfirmado));

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.pagamentos.size).toBe(1);
    expect(tabelas.eventos_brutos).toHaveLength(1);
    expect(vi.mocked(buscarClienteAsaas)).toHaveBeenCalledTimes(1);
  });

  it("atualiza o pagamento existente em vez de duplicar (evento novo, mesma cobrança)", async () => {
    await POST(requisicao(payloadPagamentoConfirmado));
    const eventoRecebido = {
      ...payloadPagamentoConfirmado,
      id: "evt_outro_id_de_evento",
      event: "PAYMENT_RECEIVED",
      payment: { ...payloadPagamentoConfirmado.payment, status: "RECEIVED" },
    };

    await POST(requisicao(eventoRecebido));

    expect(tabelas.pagamentos.size).toBe(1);
    expect(tabelas.pagamentos.get("asaas:pay_080225913252")).toMatchObject({
      status: "RECEIVED",
    });
  });
});

describe("POST /api/webhooks/asaas — recarga e eventos ignorados", () => {
  it("recarga de créditos sem aluna correspondente é ignorada sem criar aluna", async () => {
    const recarga = {
      ...payloadPagamentoConfirmado,
      id: "evt_recarga_001",
      payment: {
        ...payloadPagamentoConfirmado.payment,
        id: "pay_recarga_001",
        externalReference: "recarga_creditos_julho",
      },
    };

    const resposta = await POST(requisicao(recarga));

    expect(resposta.status).toBe(200);
    expect(tabelas.alunas).toHaveLength(0);
    expect(tabelas.pagamentos.size).toBe(0);
    expect(tabelas.eventos_processados.size).toBe(1);
  });

  it("evento que não é de pagamento é marcado como processado e ignorado", async () => {
    const resposta = await POST(requisicao({ id: "evt_transfer_1", event: "TRANSFER_CREATED" }));

    expect(resposta.status).toBe(200);
    expect(tabelas.pagamentos.size).toBe(0);
    expect(tabelas.eventos_processados.size).toBe(1);
  });
});

describe("POST /api/webhooks/asaas — validação", () => {
  it("token errado responde 401 sem tocar no banco", async () => {
    const resposta = await POST(requisicao(payloadPagamentoConfirmado, "token_errado"));
    expect(resposta.status).toBe(401);
    expect(tabelas.eventos_brutos).toHaveLength(0);
  });

  it("sem token responde 401", async () => {
    const resposta = await POST(requisicao(payloadPagamentoConfirmado, null));
    expect(resposta.status).toBe(401);
  });

  it("payload sem id de evento responde 400 com mensagem clara", async () => {
    const resposta = await POST(requisicao({ event: "PAYMENT_CONFIRMED" }));
    expect(resposta.status).toBe(400);
    const corpo: { erro: string } = await resposta.json();
    expect(corpo.erro).toContain("id");
  });

  it("corpo que não é JSON responde 400", async () => {
    const resposta = await POST(
      new Request("http://localhost/api/webhooks/asaas", {
        method: "POST",
        headers: { "asaas-access-token": TOKEN_WEBHOOK },
        body: "isso não é json",
      })
    );
    expect(resposta.status).toBe(400);
  });
});

describe("ehRecargaDeCreditos", () => {
  const base = pagamentoAsaasSchema.parse(payloadPagamentoConfirmado.payment);

  it("detecta pela referência externa", () => {
    expect(ehRecargaDeCreditos({ ...base, externalReference: "RECARGA_agosto" })).toBe(true);
  });

  it("detecta pela descrição com acento", () => {
    expect(ehRecargaDeCreditos({ ...base, description: "Recárga de créditos" })).toBe(true);
  });

  it("mensalidade comum não é recarga", () => {
    expect(ehRecargaDeCreditos(base)).toBe(false);
  });
});
