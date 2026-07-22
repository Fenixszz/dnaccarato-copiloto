import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/drive/route";
import { listarArquivosDaPasta } from "@/lib/integrations/drive";
import { interpretarNomeDeArquivo } from "@/lib/webhooks/drive";

const TOKEN_CANAL = "token_de_teste_do_drive";
const PASTA_ID = "pasta_documentos_teste";

// Fake em memória das tabelas usadas pelo fluxo do webhook.
const { tabelas, criarSupabaseFalso } = vi.hoisted(() => {
  const tabelas = {
    alunas: [] as Array<Record<string, unknown>>,
    documentos: new Map<string, Record<string, unknown>>(),
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
        if (tabela === "documentos") {
          return {
            upsert: (registro: { referencia_externa: string }) => {
              const id = registro.referencia_externa;
              tabelas.documentos.set(id, { ...(tabelas.documentos.get(id) ?? {}), ...registro });
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
vi.mock("@/lib/integrations/drive", () => ({ listarArquivosDaPasta: vi.fn() }));

function requisicao(cabecalhos: Record<string, string | undefined>): Request {
  const headers: Record<string, string> = {};
  const padrao: Record<string, string> = {
    "x-goog-channel-id": "canal_teste_001",
    "x-goog-channel-token": TOKEN_CANAL,
    "x-goog-resource-state": "change",
    "x-goog-message-number": "2",
    "x-goog-resource-id": "recurso_abc",
  };
  for (const [nome, valor] of Object.entries({ ...padrao, ...cabecalhos })) {
    if (valor !== undefined) {
      headers[nome] = valor;
    }
  }
  return new Request("http://localhost/api/webhooks/drive", { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("DRIVE_WEBHOOK_TOKEN", TOKEN_CANAL);
  vi.stubEnv("DRIVE_PASTA_DOCUMENTOS_ID", PASTA_ID);
  tabelas.alunas.length = 0;
  tabelas.eventos_brutos.length = 0;
  tabelas.documentos.clear();
  tabelas.eventos_processados.clear();
  vi.mocked(listarArquivosDaPasta).mockReset();
  vi.mocked(listarArquivosDaPasta).mockResolvedValue([
    {
      id: "arq_contrato_ana",
      name: "Contrato - Ana Paula Ribeiro - ASSINADO.pdf",
      modifiedTime: "2026-07-22T16:00:00.000Z",
      webViewLink: "https://drive.google.com/file/d/arq_contrato_ana/view",
    },
    {
      id: "arq_termo_nova",
      name: "Termo de Imagem - Helena Prado.pdf",
      modifiedTime: "2026-07-22T15:00:00.000Z",
      webViewLink: "https://drive.google.com/file/d/arq_termo_nova/view",
    },
    {
      id: "arq_foto",
      name: "foto-da-clinica.png",
      modifiedTime: "2026-07-22T14:00:00.000Z",
      webViewLink: "https://drive.google.com/file/d/arq_foto/view",
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/drive — sincronização de documentos", () => {
  it("sincroniza a pasta: assinado vincula à aluna existente, pendente cria aluna, fora do padrão é ignorado", async () => {
    tabelas.alunas.push({ id: "aluna_ana", nome: "Ana Paula Ribeiro" });

    const resposta = await POST(requisicao({}));

    expect(resposta.status).toBe(200);
    expect(tabelas.eventos_brutos).toHaveLength(1);

    const contrato = tabelas.documentos.get("arq_contrato_ana");
    expect(contrato).toMatchObject({
      aluna_id: "aluna_ana",
      tipo: "Contrato",
      status: "assinado",
      assinado_em: "2026-07-22T16:00:00.000Z",
      link_drive: "https://drive.google.com/file/d/arq_contrato_ana/view",
    });

    const termo = tabelas.documentos.get("arq_termo_nova");
    expect(termo).toMatchObject({ tipo: "Termo de Imagem", status: "pendente", assinado_em: null });
    // Helena não existia: foi criada pelo matching.
    expect(tabelas.alunas).toHaveLength(2);
    expect(tabelas.alunas[1]).toMatchObject({ nome: "Helena Prado" });
    expect(termo?.aluna_id).toBe(tabelas.alunas[1].id);

    // foto-da-clinica.png não segue o padrão: ignorada.
    expect(tabelas.documentos.has("arq_foto")).toBe(false);
    expect(tabelas.documentos.size).toBe(2);
  });

  it("quando o arquivo ganha o marcador ASSINADO, o mesmo documento vira assinado sem duplicar", async () => {
    tabelas.alunas.push({ id: "aluna_helena", nome: "Helena Prado" });
    await POST(requisicao({}));
    expect(tabelas.documentos.get("arq_termo_nova")).toMatchObject({ status: "pendente" });

    vi.mocked(listarArquivosDaPasta).mockResolvedValue([
      {
        id: "arq_termo_nova",
        name: "Termo de Imagem - Helena Prado - ASSINADO.pdf",
        modifiedTime: "2026-07-23T09:00:00.000Z",
        webViewLink: "https://drive.google.com/file/d/arq_termo_nova/view",
      },
    ]);
    const resposta = await POST(requisicao({ "x-goog-message-number": "3" }));

    expect(resposta.status).toBe(200);
    expect(tabelas.documentos.size).toBe(2);
    expect(tabelas.documentos.get("arq_termo_nova")).toMatchObject({
      status: "assinado",
      assinado_em: "2026-07-23T09:00:00.000Z",
      aluna_id: "aluna_helena",
    });
  });

  it("mesma notificação entregue duas vezes: 200 nas duas, uma sincronização só", async () => {
    const primeira = await POST(requisicao({}));
    const segunda = await POST(requisicao({}));

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(vi.mocked(listarArquivosDaPasta)).toHaveBeenCalledTimes(1);
    expect(tabelas.eventos_brutos).toHaveLength(1);
  });

  it("handshake sync responde 200 sem sincronizar nada", async () => {
    const resposta = await POST(
      requisicao({ "x-goog-resource-state": "sync", "x-goog-message-number": "1" })
    );

    expect(resposta.status).toBe(200);
    expect(vi.mocked(listarArquivosDaPasta)).not.toHaveBeenCalled();
    expect(tabelas.eventos_brutos).toHaveLength(0);
  });
});

describe("POST /api/webhooks/drive — validação", () => {
  it("token de canal errado responde 401 sem tocar no banco", async () => {
    const resposta = await POST(requisicao({ "x-goog-channel-token": "token_errado" }));
    expect(resposta.status).toBe(401);
    expect(tabelas.eventos_brutos).toHaveLength(0);
  });

  it("notificação sem headers obrigatórios responde 400", async () => {
    const resposta = await POST(requisicao({ "x-goog-message-number": undefined }));
    expect(resposta.status).toBe(400);
    const corpo: { erro: string } = await resposta.json();
    expect(corpo.erro).toContain("numero_mensagem");
  });
});

describe("interpretarNomeDeArquivo", () => {
  it("interpreta documento pendente", () => {
    expect(interpretarNomeDeArquivo("Contrato - Maria Silva.pdf")).toEqual({
      tipo: "Contrato",
      nomeAluna: "Maria Silva",
      assinado: false,
    });
  });

  it("interpreta o marcador de assinado em qualquer caixa", () => {
    expect(interpretarNomeDeArquivo("Contrato - Maria Silva - assinado.pdf")).toEqual({
      tipo: "Contrato",
      nomeAluna: "Maria Silva",
      assinado: true,
    });
  });

  it("aceita tipo composto e nome com hífen interno", () => {
    expect(interpretarNomeDeArquivo("Termo de Imagem - Ana-Clara Souza - ASSINADO.docx")).toEqual({
      tipo: "Termo de Imagem",
      nomeAluna: "Ana-Clara Souza",
      assinado: true,
    });
  });

  it("rejeita arquivos fora do padrão", () => {
    expect(interpretarNomeDeArquivo("foto-da-clinica.png")).toBeNull();
    expect(interpretarNomeDeArquivo("Contrato.pdf")).toBeNull();
    expect(interpretarNomeDeArquivo("Contrato - ASSINADO.pdf")).toBeNull();
  });
});
