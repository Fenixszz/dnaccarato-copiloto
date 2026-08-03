import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { criarFakeSupabase, type FakeSupabase } from "../helpers/fakeSupabase";

/**
 * Teste de integração da rota /api/webhooks/drive. A camada do Drive API
 * (coletarNovosMateriais / getStartPageToken) é mockada; matching e gravação
 * em materiais são reais, sobre o fake in-memory do Supabase.
 */

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({ getServiceClient: () => holder.client }));
vi.mock("@/lib/integrations/drive", () => ({
  coletarNovosMateriais: vi.fn(),
  getStartPageToken: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/drive/route";
import { coletarNovosMateriais, getStartPageToken } from "@/lib/integrations/drive";

const TOKEN = "canal-secreto";

function requisicao(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/webhooks/drive", { method: "POST", headers });
}

const notificacao = (over: Record<string, string> = {}): Record<string, string> => ({
  "x-goog-channel-token": TOKEN,
  "x-goog-resource-state": "add",
  "x-goog-channel-id": "chan-1",
  "x-goog-message-number": "2",
  "x-goog-resource-id": "res-1",
  ...over,
});

function iniciar(sementes: Record<string, Record<string, unknown>[]> = {}): FakeSupabase {
  const fake = criarFakeSupabase({
    // pageToken já inicializado → a rota vai direto ler mudanças.
    estado_integracoes: [{ chave: "drive_page_token", valor: { pageToken: "PT1" } }],
    alunas: [{ id: "aluna-ana", nome: "Ana Prado" }],
    ...sementes,
  });
  holder.client = fake.client;
  return fake;
}

const rows = (store: Record<string, Record<string, unknown>[]>, t: string) =>
  store[t] ?? [];

beforeEach(() => {
  process.env.DRIVE_CHANNEL_TOKEN = TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/drive", () => {
  it("arquivo novo em subpasta identificada vira material da aluna", async () => {
    const { store } = iniciar();
    vi.mocked(coletarNovosMateriais).mockResolvedValue({
      novoPageToken: "PT2",
      itens: [
        {
          fileId: "file-1",
          nomeArquivo: "Prova.pdf",
          tipo: "application/pdf",
          linkDrive: "https://drive.google.com/file/d/file-1",
          subpastaNome: "Ana Prado",
        },
      ],
    });

    const res = await POST(requisicao(notificacao()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      status: "processado",
      gravados: 1,
      nao_identificadas: [],
    });

    const materiais = rows(store, "materiais");
    expect(materiais).toHaveLength(1);
    expect(materiais[0]).toMatchObject({
      aluna_id: "aluna-ana",
      nome_arquivo: "Prova.pdf",
      tipo: "application/pdf",
      referencia_externa: "file-1",
    });
    expect(rows(store, "eventos_brutos")).toHaveLength(1);
    // pageToken avançou
    expect(rows(store, "estado_integracoes")[0]?.valor).toMatchObject({
      pageToken: "PT2",
    });
  });

  it("subpasta sem match fica como não identificada e não cria material", async () => {
    const { store } = iniciar();
    vi.mocked(coletarNovosMateriais).mockResolvedValue({
      novoPageToken: "PT2",
      itens: [
        {
          fileId: "file-2",
          nomeArquivo: "Doc.pdf",
          tipo: "application/pdf",
          linkDrive: null,
          subpastaNome: "Pasta Estranha",
        },
      ],
    });

    const res = await POST(requisicao(notificacao()));
    const json = await res.json();
    expect(json).toMatchObject({ gravados: 0, nao_identificadas: ["Pasta Estranha"] });
    expect(rows(store, "materiais")).toHaveLength(0);
  });

  it("handshake 'sync' apenas confirma, sem processar", async () => {
    iniciar();
    const res = await POST(requisicao(notificacao({ "x-goog-resource-state": "sync" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "sync_ok" });
    expect(coletarNovosMateriais).not.toHaveBeenCalled();
  });

  it("rejeita channel token inválido com 401", async () => {
    const { store } = iniciar();
    const res = await POST(requisicao(notificacao({ "x-goog-channel-token": "errado" })));
    expect(res.status).toBe(401);
    expect(rows(store, "eventos_brutos")).toHaveLength(0);
    expect(coletarNovosMateriais).not.toHaveBeenCalled();
  });

  it("é idempotente: a mesma mensagem do canal não é reprocessada", async () => {
    const { store } = iniciar();
    vi.mocked(coletarNovosMateriais).mockResolvedValue({
      novoPageToken: "PT2",
      itens: [
        {
          fileId: "file-1",
          nomeArquivo: "Prova.pdf",
          tipo: "application/pdf",
          linkDrive: null,
          subpastaNome: "Ana Prado",
        },
      ],
    });

    await POST(requisicao(notificacao()));
    const res2 = await POST(requisicao(notificacao()));
    expect(await res2.json()).toMatchObject({ status: "ignorado" });
    expect(rows(store, "materiais")).toHaveLength(1);
  });

  it("sem pageToken salvo, inicializa a partir do startPageToken e sai", async () => {
    const fake = criarFakeSupabase({ alunas: [{ id: "aluna-ana", nome: "Ana Prado" }] });
    holder.client = fake.client;
    vi.mocked(getStartPageToken).mockResolvedValue("PT-INICIAL");

    const res = await POST(requisicao(notificacao()));
    expect(await res.json()).toMatchObject({ status: "inicializado" });
    expect(fake.store.estado_integracoes?.[0]?.valor).toMatchObject({
      pageToken: "PT-INICIAL",
    });
    expect(coletarNovosMateriais).not.toHaveBeenCalled();
  });
});
