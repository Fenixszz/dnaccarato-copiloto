import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integração da rota /api/cron/briefing: autorização do cron, checagem de
 * horário, e o fluxo detectar → priorizar → agenda → enviar → salvar. DB é um
 * stub que registra inserts; agenda e o envio (com retry) são mockados.
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}

const h = vi.hoisted(() => ({
  porTabela: {} as Record<string, RQ>,
  inseridos: {} as Record<string, unknown[]>,
  enviarComRetry: vi.fn((_e: { numero: string; texto: string }) =>
    Promise.resolve({ ok: true, tentativas: 1 }),
  ),
  compromissosDeHoje: vi.fn(() =>
    Promise.resolve([] as { hora: string; titulo: string }[]),
  ),
}));

vi.mock("@/lib/db/client", () => {
  const make = (tabela: string) => {
    const res = (): RQ => h.porTabela[tabela] ?? { data: null, error: null };
    const q = {
      select: () => q,
      eq: () => q,
      insert: (row: unknown) => {
        (h.inseridos[tabela] ??= []).push(row);
        return q;
      },
      maybeSingle: () => Promise.resolve(res()),
      then: (aoResolver: (v: RQ) => unknown) => Promise.resolve(res()).then(aoResolver),
    };
    return q;
  };
  return { getServiceClient: () => ({ from: (t: string) => make(t) }) };
});
vi.mock("@/lib/whatsapp/envio", () => ({ enviarComRetry: h.enviarComRetry }));
vi.mock("@/lib/integrations/agenda", () => ({
  compromissosDeHoje: h.compromissosDeHoje,
}));

import { GET } from "@/app/api/cron/briefing/route";

const SECRET = "cron-secreto";

function horaSP(): number {
  return Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
    10,
  );
}

function chamar(opts: { auth?: boolean; forcar?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers["authorization"] = `Bearer ${SECRET}`;
  const url = `http://localhost/api/cron/briefing${opts.forcar ? "?forcar=1" : ""}`;
  return GET(new Request(url, { headers }));
}

function alunasComFuro(): RQ {
  return {
    data: [
      {
        id: "aluna-fernanda",
        nome: "Fernanda Alves",
        documentos: [
          { status: "rejeitado", tipo: "contrato", motivo_rejeicao: "Dados divergentes" },
        ],
        pagamentos: [],
        reunioes: [],
        formularios: [],
        tasks_asana: [],
      },
    ],
    error: null,
  };
}

beforeEach(() => {
  h.porTabela = {};
  h.inseridos = {};
  vi.clearAllMocks();
  h.enviarComRetry.mockResolvedValue({ ok: true, tentativas: 1 });
  process.env.CRON_SECRET = SECRET;
  process.env.BRIEFING_WHATSAPP = "+55 11 99999-0000";
  process.env.BRIEFING_HORA = String(horaSP());
});

describe("GET /api/cron/briefing", () => {
  it("recusa sem Authorization (401)", async () => {
    const res = await chamar({ auth: false });
    expect(res.status).toBe(401);
    expect(h.enviarComRetry).not.toHaveBeenCalled();
  });

  it("recusa com secret errado (401)", async () => {
    process.env.CRON_SECRET = "outro";
    expect((await chamar()).status).toBe(401);
  });

  it("fora do horário: não envia", async () => {
    process.env.BRIEFING_HORA = String((horaSP() + 1) % 24);
    const res = await chamar();
    expect((await res.json()).status).toBe("fora_do_horario");
    expect(h.enviarComRetry).not.toHaveBeenCalled();
  });

  it("no horário: detecta, prioriza, envia e salva em briefings_enviados", async () => {
    h.porTabela.alunas = alunasComFuro();
    h.compromissosDeHoje.mockResolvedValue([{ hora: "14:00", titulo: "Call 4E" }]);

    const res = await chamar();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("enviado");

    const arg = h.enviarComRetry.mock.calls[0]?.[0];
    expect(arg?.numero).toBe("5511999990000");
    expect(arg?.texto).toContain("Bom dia, Adriana.");
    expect(arg?.texto).toContain("Fernanda Alves");
    expect(arg?.texto).toContain("Call 4E");

    const hist = (h.inseridos.briefings_enviados ?? [])[0] as Record<string, unknown>;
    expect(hist).toMatchObject({ canal: "whatsapp", status: "enviado" });
  });

  it("pode ser forçado fora do horário com ?forcar=1", async () => {
    process.env.BRIEFING_HORA = String((horaSP() + 1) % 24);
    h.porTabela.alunas = { data: [], error: null };
    const res = await chamar({ forcar: true });
    expect((await res.json()).status).toBe("enviado");
    expect(h.enviarComRetry).toHaveBeenCalledTimes(1);
  });

  it("falha de envio (após retries) → 502 e histórico 'falha'", async () => {
    h.porTabela.alunas = { data: [], error: null };
    h.enviarComRetry.mockResolvedValue({ ok: false, tentativas: 3 });

    const res = await chamar();
    expect(res.status).toBe(502);
    expect((h.inseridos.briefings_enviados ?? [])[0]).toMatchObject({ status: "falha" });
  });
});
