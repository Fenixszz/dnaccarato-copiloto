import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/forms/route";
import { extrairContatos } from "@/lib/webhooks/forms";

const TOKEN_WEBHOOK = "token_de_teste_do_forms";

// Fake em memória das tabelas usadas pelo fluxo do webhook.
const { tabelas, criarSupabaseFalso } = vi.hoisted(() => {
  const tabelas = {
    alunas: [] as Array<Record<string, unknown>>,
    formularios: new Map<string, Record<string, unknown>>(),
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
        if (tabela === "formularios") {
          return {
            upsert: (registro: { referencia_externa: string }) => {
              const id = registro.referencia_externa;
              tabelas.formularios.set(id, { ...(tabelas.formularios.get(id) ?? {}), ...registro });
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

// Payload no formato que o Apps Script (scripts/google-forms-webhook.gs) envia.
const payloadRespostaAnamnese = {
  resposta_id: "2TLoZDoLXCie8jrGKKvC5MYQmKW8jrfL07TFXbYzsSk",
  formulario_nome: "Anamnese — Programa Dnaccarato",
  respondido_em: "2026-07-22T15:20:00.000Z",
  email: null,
  respostas: [
    { pergunta: "Nome completo", resposta: "Fernanda Oliveira Santos" },
    { pergunta: "Seu melhor e-mail", resposta: "fernanda.santos@example.com" },
    { pergunta: "WhatsApp (com DDD)", resposta: "(11) 96666-0006" },
    { pergunta: "Qual seu principal objetivo?", resposta: "Reeducação alimentar" },
    { pergunta: "Possui alguma restrição alimentar?", resposta: "Lactose" },
  ],
};

function requisicao(payload: unknown, token: string | null = TOKEN_WEBHOOK): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) {
    headers["x-forms-token"] = token;
  }
  return new Request("http://localhost/api/webhooks/forms", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.stubEnv("FORMS_WEBHOOK_TOKEN", TOKEN_WEBHOOK);
  tabelas.alunas.length = 0;
  tabelas.eventos_brutos.length = 0;
  tabelas.formularios.clear();
  tabelas.eventos_processados.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/forms — resposta nova", () => {
  it("cria a aluna a partir das respostas e grava o formulário", async () => {
    const resposta = await POST(requisicao(payloadRespostaAnamnese));

    expect(resposta.status).toBe(200);
    expect(tabelas.eventos_brutos).toHaveLength(1);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.alunas[0]).toMatchObject({
      nome: "Fernanda Oliveira Santos",
      email: "fernanda.santos@example.com",
      telefone: "(11) 96666-0006",
    });
    const formulario = tabelas.formularios.get(payloadRespostaAnamnese.resposta_id);
    expect(formulario).toMatchObject({
      aluna_id: tabelas.alunas[0].id,
      formulario_nome: "Anamnese — Programa Dnaccarato",
      respondido_em: "2026-07-22T15:20:00.000Z",
    });
    expect(formulario?.respostas).toEqual(payloadRespostaAnamnese.respostas);
    expect(tabelas.eventos_processados.size).toBe(1);
  });

  it("vincula à aluna existente quando o telefone da resposta bate", async () => {
    tabelas.alunas.push({
      id: "aluna_existente",
      nome: "Fernanda O. Santos",
      email: null,
      telefone: "+55 11 96666-0006",
    });

    await POST(requisicao(payloadRespostaAnamnese));

    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.formularios.get(payloadRespostaAnamnese.resposta_id)).toMatchObject({
      aluna_id: "aluna_existente",
    });
  });

  it("usa o email de login do Form no matching quando presente", async () => {
    tabelas.alunas.push({
      id: "aluna_por_login",
      nome: "Fernanda",
      email: "login.fernanda@example.com",
      telefone: null,
    });
    const semPerguntasDeContato = {
      ...payloadRespostaAnamnese,
      email: "login.fernanda@example.com",
      respostas: [{ pergunta: "Qual seu principal objetivo?", resposta: "Emagrecimento" }],
    };

    await POST(requisicao(semPerguntasDeContato));

    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.formularios.get(payloadRespostaAnamnese.resposta_id)).toMatchObject({
      aluna_id: "aluna_por_login",
    });
  });

  it("mesma resposta entregue duas vezes: 200 nas duas, sem duplicar nada", async () => {
    const primeira = await POST(requisicao(payloadRespostaAnamnese));
    const segunda = await POST(requisicao(payloadRespostaAnamnese));

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(tabelas.alunas).toHaveLength(1);
    expect(tabelas.formularios.size).toBe(1);
    expect(tabelas.eventos_brutos).toHaveLength(1);
  });
});

describe("POST /api/webhooks/forms — validação", () => {
  it("token errado responde 401 sem tocar no banco", async () => {
    const resposta = await POST(requisicao(payloadRespostaAnamnese, "token_errado"));
    expect(resposta.status).toBe(401);
    expect(tabelas.eventos_brutos).toHaveLength(0);
  });

  it("sem token responde 401", async () => {
    const resposta = await POST(requisicao(payloadRespostaAnamnese, null));
    expect(resposta.status).toBe(401);
  });

  it("payload sem resposta_id responde 400 com mensagem clara", async () => {
    const invalido = { formulario_nome: "Anamnese", respondido_em: "x", respostas: [] };
    const resposta = await POST(requisicao(invalido));
    expect(resposta.status).toBe(400);
    const corpo: { erro: string } = await resposta.json();
    expect(corpo.erro).toContain("resposta_id");
  });
});

describe("extrairContatos", () => {
  it("extrai nome, email e telefone pelos títulos das perguntas", () => {
    const contatos = extrairContatos(payloadRespostaAnamnese.respostas);
    expect(contatos).toEqual({
      nome: "Fernanda Oliveira Santos",
      emails: ["fernanda.santos@example.com"],
      telefones: ["(11) 96666-0006"],
    });
  });

  it("soma o email de login do Form quando presente", () => {
    const contatos = extrairContatos(payloadRespostaAnamnese.respostas, "login@example.com");
    expect(contatos.emails).toEqual(["login@example.com", "fernanda.santos@example.com"]);
  });

  it("ignora respostas vazias e perguntas sem contato", () => {
    const contatos = extrairContatos([
      { pergunta: "Telefone", resposta: "  " },
      { pergunta: "Objetivo", resposta: "Emagrecimento" },
    ]);
    expect(contatos).toEqual({ nome: null, emails: [], telefones: [] });
  });

  it("reconhece variações de pergunta com acento e caixa", () => {
    const contatos = extrairContatos([
      { pergunta: "E-MAIL para contato", resposta: "a@b.com" },
      { pergunta: "Número de CELULAR", resposta: "11 97777-0007" },
      { pergunta: "NOME e sobrenome", resposta: "Júlia Prado" },
    ]);
    expect(contatos).toEqual({
      nome: "Júlia Prado",
      emails: ["a@b.com"],
      telefones: ["11 97777-0007"],
    });
  });
});
