import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Integração da rota /api/cron/briefing: autorização do cron, checagem de
 * horário, e o fluxo detectar → priorizar → agenda → enviar → salvar. DB é um
 * stub que registra inserts; agenda e WhatsApp são mockados.
 */

interface RQ {
  data: unknown;
  error: { message: string } | null;
}

const h = vi.hoisted(() => ({
  porTabela: {} as Record<string, RQ>,
  inseridos: {} as Record<string, unknown[]>,
  enviarTexto: vi.fn((_e: { numero: string; texto: string }) =>
    Promise.resolve({ ok: true, status: 200, corpo: {} }),
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
vi.mock("@/lib/whatsapp/client", () => ({ enviarTexto: h.enviarTexto }));
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

// Uma aluna com assinatura rejeitada (cenário Fernanda do seed).
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
  h.enviarTexto.mockResolvedValue({ ok: true, status: 200, corpo: {} });
  process.env.CRON_SECRET = SECRET;
  process.env.BRIEFING_WHATSAPP = "+55 11 99999-0000";
  process.env.BRIEFING_HORA = String(horaSP()); // por padrão, "agora" → executa
});

describe("GET /api/cron/briefing", () => {
  it("recusa sem Authorization (401)", async () => {
    const res = await chamar({ auth: false });
    expect(res.status).toBe(401);
    expect(h.enviarTexto).not.toHaveBeenCalled();
  });

  it("recusa com secret errado (401)", async () => {
    process.env.CRON_SECRET = "outro";
    const res = await chamar();
    expect(res.status).toBe(401);
  });

  it("fora do horário: não envia", async () => {
    process.env.BRIEFING_HORA = String((horaSP() + 1) % 24);
    const res = await chamar();
    expect((await res.json()).status).toBe("fora_do_horario");
    expect(h.enviarTexto).not.toHaveBeenCalled();
  });

  it("no horário: detecta, prioriza, envia e salva em briefings_enviados", async () => {
    h.porTabela.alunas = alunasComFuro();
    h.compromissosDeHoje.mockResolvedValue([{ hora: "14:00", titulo: "Call 4E" }]);

    const res = await chamar();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("enviado");
    expect(body.furos).toBe(1);

    // Enviou o texto certo, pro número da Adriana (normalizado).
    expect(h.enviarTexto).toHaveBeenCalledTimes(1);
    const arg = h.enviarTexto.mock.calls[0]?.[0];
    expect(arg?.numero).toBe("5511999990000");
    expect(arg?.texto).toContain("Bom dia, Adriana.");
    expect(arg?.texto).toContain("Fernanda Alves");
    expect(arg?.texto).toContain("Call 4E");

    // Histórico salvo.
    const hist = (h.inseridos.briefings_enviados ?? [])[0] as Record<string, unknown>;
    expect(hist).toMatchObject({ canal: "whatsapp", status: "enviado" });
    expect(hist.conteudo).toContain("Fernanda Alves");
  });

  it("pode ser forçado fora do horário com ?forcar=1", async () => {
    process.env.BRIEFING_HORA = String((horaSP() + 1) % 24);
    h.porTabela.alunas = { data: [], error: null };
    const res = await chamar({ forcar: true });
    expect((await res.json()).status).toBe("enviado");
    expect(h.enviarTexto).toHaveBeenCalledTimes(1); // "tudo em dia"
  });

  it("falha de envio → 502, histórico 'falha' e falha registrada", async () => {
    h.porTabela.alunas = { data: [], error: null };
    h.enviarTexto.mockResolvedValue({ ok: false, status: 500, corpo: {} });

    const res = await chamar();
    expect(res.status).toBe(502);
    expect((h.inseridos.briefings_enviados ?? [])[0]).toMatchObject({ status: "falha" });
    expect(h.inseridos.falhas_sistema ?? []).toHaveLength(1);
  });
});
