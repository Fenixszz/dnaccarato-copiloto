// Integração completa do servidor MCP: autenticação, todas as tools de
// leitura sobre o dataset do seed (scripts/seed.ts) e todas as de escrita
// com verificação de efeito colateral e de auditoria. O fake do Supabase
// implementa filtros/ordenação/limite/embeds de verdade, então as tools
// consultam e escrevem como fariam no banco real; só as APIs externas
// (Evolution, Asana, Calendly) são mockadas.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { cancelarAgendamentoCalendly } from "@/lib/integrations/calendly";
import { criarTaskAsana } from "@/lib/integrations/asana";
import { enviarMensagemWhatsApp } from "@/lib/whatsapp/evolution";

const TOKEN_TOTAL = "mcp_token_integracao_total";
const TOKEN_LEITURA = "mcp_token_integracao_leitura";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const IDS = {
  ana: "11111111-1111-4111-8111-111111111111",
  beatriz: "22222222-2222-4222-8222-222222222222",
  carla: "33333333-3333-4333-8333-333333333333",
  daniela: "44444444-4444-4444-8444-444444444444",
  elisa: "55555555-5555-4555-8555-555555555555",
};

const URI_CALENDLY_ANA = "https://api.calendly.com/scheduled_events/EVENTO_ANA";

// ---------------------------------------------------------------------------
// Fake do Supabase com semântica de query real (o suficiente pras queries do
// projeto): filtros planos, filtros sobre embeds ("reunioes.data_hora"),
// order/limit por referencedTable e embeds nos dois sentidos.
// ---------------------------------------------------------------------------
const { banco, semear, criarSupabaseFalso } = vi.hoisted(() => {
  type Linha = Record<string, unknown>;
  const RELACOES = ["pagamentos", "documentos", "formularios", "reunioes", "tasks_asana"] as const;

  const banco: Record<string, Linha[]> = {};
  let sequencia = 1;

  function diasDeAgora(dias: number): string {
    return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
  }
  function dataDeAgora(dias: number): string {
    return diasDeAgora(dias).slice(0, 10);
  }

  // Mesmo dataset de scripts/seed.ts, com duas extensões comentadas.
  function semear() {
    sequencia = 1;
    banco.api_tokens = [
      {
        id: "tok_total",
        nome: "token-total",
        token_hash: hash(TOKEN_TOTAL),
        escopo: [
          "listar_alunas",
          "dossie_da_aluna",
          "detectar_furos",
          "status_aluna",
          "pagamentos_pendentes",
          "documentos_nao_assinados",
          "proxima_reuniao",
          "buscar_formulario",
          "enviar_lembrete_pagamento",
          "criar_task_asana",
          "remarcar_reuniao",
        ],
        status: "ativo",
      },
      {
        id: "tok_leitura",
        nome: "token-leitura",
        token_hash: hash(TOKEN_LEITURA),
        escopo: ["listar_alunas", "status_aluna"],
        status: "ativo",
      },
    ];
    banco.alunas = [
      {
        id: IDS.ana,
        nome: "Ana Paula Ribeiro",
        email: "ana.seed@example.com",
        telefone: "+55 11 91111-0001",
      },
      {
        id: IDS.beatriz,
        nome: "Beatriz Lima",
        email: "beatriz.seed@example.com",
        telefone: "+55 11 91111-0002",
      },
      {
        id: IDS.carla,
        nome: "Carla Mendes",
        email: "carla.seed@example.com",
        telefone: "+55 11 91111-0003",
      },
      {
        id: IDS.daniela,
        nome: "Daniela Souza",
        email: "daniela.seed@example.com",
        telefone: "+55 11 91111-0004",
      },
      {
        id: IDS.elisa,
        nome: "Elisa Ferreira",
        email: "elisa.seed@example.com",
        telefone: "+55 11 91111-0005",
      },
    ];
    banco.pagamentos = [
      {
        id: "pag_ana",
        aluna_id: IDS.ana,
        origem: "asaas",
        status: "pago",
        valor: 1200,
        vencimento: dataDeAgora(-3),
        pago_em: diasDeAgora(-3),
      },
      {
        id: "pag_beatriz",
        aluna_id: IDS.beatriz,
        origem: "asaas",
        status: "pendente",
        valor: 1200,
        vencimento: dataDeAgora(-10),
        pago_em: null,
      },
    ];
    banco.documentos = [
      {
        id: "doc_ana",
        aluna_id: IDS.ana,
        tipo: "contrato",
        status: "assinado",
        assinado_em: diasDeAgora(-10),
        link_drive: "https://drive.google.com/seed/contrato-ana",
        criado_em: diasDeAgora(-12),
      },
      {
        id: "doc_carla",
        aluna_id: IDS.carla,
        tipo: "contrato",
        status: "assinado",
        assinado_em: diasDeAgora(-4),
        link_drive: "https://drive.google.com/seed/contrato-carla",
        criado_em: diasDeAgora(-5),
      },
      // Extensão do seed: uma pendência de assinatura pra exercitar
      // documentos_nao_assinados (o seed original não tem nenhuma).
      {
        id: "doc_beatriz",
        aluna_id: IDS.beatriz,
        tipo: "termo de imagem",
        status: "pendente",
        assinado_em: null,
        link_drive: "https://drive.google.com/seed/termo-beatriz",
        criado_em: diasDeAgora(-2),
      },
    ];
    banco.formularios = [
      {
        id: "form_ana",
        aluna_id: IDS.ana,
        formulario_nome: "anamnese",
        respostas: [{ pergunta: "Objetivo", resposta: "acompanhamento" }],
        respondido_em: diasDeAgora(-1),
      },
      {
        id: "form_daniela",
        aluna_id: IDS.daniela,
        formulario_nome: "anamnese",
        respostas: [
          { pergunta: "Objetivo", resposta: "emagrecimento" },
          { pergunta: "Restrições", resposta: "nenhuma" },
        ],
        respondido_em: diasDeAgora(-7),
      },
    ];
    banco.reunioes = [
      // Extensão do seed: referencia_externa preenchida (coluna criada
      // depois do seed) pra exercitar remarcar_reuniao.
      {
        id: "reu_ana",
        aluna_id: IDS.ana,
        origem: "calendly",
        data_hora: diasDeAgora(2),
        status: "confirmada",
        link: "https://calendly.com/seed/reuniao-ana",
        referencia_externa: URI_CALENDLY_ANA,
      },
    ];
    banco.tasks_asana = [
      {
        id: "task_ana",
        aluna_id: IDS.ana,
        task_id: "seed_task_ana_001",
        titulo: "Preparar plano da Ana",
        status: "concluida",
        criado_em: diasDeAgora(-3),
        concluido_em: diasDeAgora(-2),
      },
      {
        id: "task_elisa",
        aluna_id: IDS.elisa,
        task_id: "seed_task_elisa_001",
        titulo: "Montar protocolo da Elisa",
        status: "em_andamento",
        criado_em: diasDeAgora(-12),
        concluido_em: null,
      },
    ];
    banco.log_auditoria = [];
  }

  function comparar(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    return a < b ? -1 : 1;
  }

  function criarConsulta(tabela: string, selectStr: string) {
    const filtrosPlanos: Array<(linha: Linha) => boolean> = [];
    const filtrosEmbed = new Map<string, Array<(linha: Linha) => boolean>>();
    const ordens: Array<{ coluna: string; asc: boolean; ref: string }> = [];
    const limites = new Map<string, number>();

    function adicionarFiltro(coluna: string, teste: (valor: unknown) => boolean) {
      if (coluna.includes(".")) {
        const [relacao, colunaEmbed] = coluna.split(".");
        const lista = filtrosEmbed.get(relacao) ?? [];
        lista.push((linha) => teste(linha[colunaEmbed]));
        filtrosEmbed.set(relacao, lista);
      } else {
        filtrosPlanos.push((linha) => teste(linha[coluna]));
      }
    }

    function aplicar(linhas: Linha[], filtros: Array<(l: Linha) => boolean>, ref: string): Linha[] {
      let resultado = linhas.filter((linha) => filtros.every((filtro) => filtro(linha)));
      for (const ordem of ordens.filter((o) => o.ref === ref)) {
        resultado = [...resultado].sort(
          (a, b) => comparar(a[ordem.coluna], b[ordem.coluna]) * (ordem.asc ? 1 : -1)
        );
      }
      const limite = limites.get(ref);
      return limite !== undefined ? resultado.slice(0, limite) : resultado;
    }

    function computar(): Linha[] {
      const linhas = aplicar(banco[tabela] ?? [], filtrosPlanos, "");
      return linhas.map((linha) => {
        const resultado: Linha = { ...linha };
        if (tabela === "alunas") {
          for (const relacao of RELACOES) {
            if (selectStr.includes(`${relacao} (`) || selectStr.includes(`${relacao}(`)) {
              const filhas = (banco[relacao] ?? []).filter((f) => f.aluna_id === linha.id);
              resultado[relacao] = aplicar(filhas, filtrosEmbed.get(relacao) ?? [], relacao);
            }
          }
        } else if (selectStr.includes("alunas")) {
          resultado.alunas =
            (banco.alunas ?? []).find((aluna) => aluna.id === linha.aluna_id) ?? null;
        }
        return resultado;
      });
    }

    const consulta = {
      eq: (coluna: string, valor: unknown) => {
        adicionarFiltro(coluna, (v) => v === valor);
        return consulta;
      },
      neq: (coluna: string, valor: unknown) => {
        adicionarFiltro(coluna, (v) => v !== valor);
        return consulta;
      },
      lt: (coluna: string, valor: unknown) => {
        adicionarFiltro(coluna, (v) => v !== null && comparar(v, valor) < 0);
        return consulta;
      },
      gte: (coluna: string, valor: unknown) => {
        adicionarFiltro(coluna, (v) => v !== null && comparar(v, valor) >= 0);
        return consulta;
      },
      is: (coluna: string, valor: unknown) => {
        // Coluna ausente no fake equivale a NULL no banco (valor default).
        adicionarFiltro(coluna, (v) => (v ?? null) === valor);
        return consulta;
      },
      order: (coluna: string, opcoes?: { ascending?: boolean; referencedTable?: string }) => {
        ordens.push({
          coluna,
          asc: opcoes?.ascending !== false,
          ref: opcoes?.referencedTable ?? "",
        });
        return consulta;
      },
      limit: (n: number, opcoes?: { referencedTable?: string }) => {
        limites.set(opcoes?.referencedTable ?? "", n);
        return consulta;
      },
      maybeSingle: () => Promise.resolve({ data: computar()[0] ?? null, error: null }),
      then: (
        cumprir: (valor: { data: Linha[]; error: null }) => unknown,
        rejeitar?: (motivo: unknown) => unknown
      ) => Promise.resolve({ data: computar(), error: null }).then(cumprir, rejeitar),
    };
    return consulta;
  }

  function criarSupabaseFalso() {
    return {
      from: (tabela: string) => ({
        select: (colunas = "*") => criarConsulta(tabela, colunas),
        insert: (registro: Linha) => {
          const nova = { id: `gerado_${sequencia++}`, ...registro };
          (banco[tabela] ??= []).push(nova);
          const promessa = Promise.resolve({ error: null });
          return Object.assign(promessa, {
            select: () => ({
              single: () => Promise.resolve({ data: { id: nova.id }, error: null }),
            }),
          });
        },
        update: (valores: Linha) => ({
          eq: (coluna: string, valor: unknown) => {
            for (const linha of banco[tabela] ?? []) {
              if (linha[coluna] === valor) {
                Object.assign(linha, valores);
              }
            }
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
  }

  return { banco, semear, criarSupabaseFalso };
});

vi.mock("@/lib/db/supabase", () => ({ obterSupabase: criarSupabaseFalso }));
vi.mock("@/lib/whatsapp/evolution", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/whatsapp/evolution")>();
  return { ...original, enviarMensagemWhatsApp: vi.fn() };
});
vi.mock("@/lib/integrations/asana", () => ({ criarTaskAsana: vi.fn() }));
vi.mock("@/lib/integrations/calendly", () => ({ cancelarAgendamentoCalendly: vi.fn() }));

type RespostaTool = { result: { content: Array<{ text: string }>; isError?: boolean } };

function requisicao(corpo: unknown, token: string | null): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

async function chamarTool(
  nome: string,
  argumentos: Record<string, unknown> = {},
  token: string = TOKEN_TOTAL
) {
  const resposta = await POST(
    requisicao(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: nome, arguments: argumentos },
      },
      token
    )
  );
  const corpo = (await resposta.json()) as RespostaTool;
  return corpo.result;
}

function conteudoJson<T>(resultado: RespostaTool["result"]): T {
  return JSON.parse(resultado.content[0].text) as T;
}

beforeEach(() => {
  semear();
  vi.mocked(enviarMensagemWhatsApp).mockReset().mockResolvedValue(undefined);
  vi.mocked(criarTaskAsana)
    .mockReset()
    .mockResolvedValue({ gid: "gid_nova_task", url: "https://app.asana.com/t/gid_nova_task" });
  vi.mocked(cancelarAgendamentoCalendly).mockReset().mockResolvedValue(undefined);
});

describe("autenticação", () => {
  it("token válido é aceito", async () => {
    const resposta = await POST(
      requisicao({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, TOKEN_TOTAL)
    );
    expect(resposta.status).toBe(200);
  });

  it("sem token, token desconhecido e token revogado são recusados com 401", async () => {
    const corpo = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    expect((await POST(requisicao(corpo, null))).status).toBe(401);
    expect((await POST(requisicao(corpo, "mcp_inexistente"))).status).toBe(401);

    const token = banco.api_tokens.find((t) => t.id === "tok_total");
    if (token) token.status = "revogado";
    expect((await POST(requisicao(corpo, TOKEN_TOTAL))).status).toBe(401);
  });

  it("escopo restringe o tools/list e a execução", async () => {
    const resposta = await POST(
      requisicao({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, TOKEN_LEITURA)
    );
    const corpo = (await resposta.json()) as { result: { tools: Array<{ name: string }> } };
    expect(corpo.result.tools.map((t) => t.name).sort()).toEqual(["listar_alunas", "status_aluna"]);

    const foraDoEscopo = await chamarTool(
      "enviar_lembrete_pagamento",
      { aluna_id: IDS.beatriz },
      TOKEN_LEITURA
    );
    expect(foraDoEscopo.isError).toBe(true);
    expect(foraDoEscopo.content[0].text).toContain("not found");
  });
});

describe("tools de leitura sobre o dataset do seed", () => {
  it("listar_alunas devolve as 5 alunas do seed em ordem", async () => {
    const resultado = await chamarTool("listar_alunas");
    const alunas = conteudoJson<Array<{ nome: string }>>(resultado);
    expect(alunas.map((a) => a.nome)).toEqual([
      "Ana Paula Ribeiro",
      "Beatriz Lima",
      "Carla Mendes",
      "Daniela Souza",
      "Elisa Ferreira",
    ]);
  });

  it("status_aluna: Beatriz aparece atrasada com o valor devido", async () => {
    const resultado = await chamarTool("status_aluna", { nome: "Beatriz" });
    const dossie = conteudoJson<{ pagamentos: Record<string, unknown> }>(resultado);
    expect(dossie.pagamentos).toMatchObject({
      situacao: "atrasado",
      quantidade_em_atraso: 1,
      total_em_atraso: 1200,
    });
  });

  it("dossie_da_aluna: Ana em dia, com próxima reunião e sem task aberta", async () => {
    const resultado = await chamarTool("dossie_da_aluna", { aluna_id: IDS.ana });
    const dossie = conteudoJson<Record<string, Record<string, unknown> | unknown[]>>(resultado);
    expect(dossie.pagamentos).toMatchObject({ situacao: "em_dia" });
    expect(dossie.proxima_reuniao).toMatchObject({ status: "confirmada" });
    // A task concluída da Ana não entra nas abertas (filtro embutido).
    expect(dossie.tasks_abertas).toEqual([]);
    expect(dossie.documentos).toMatchObject({
      assinados: [expect.objectContaining({ tipo: "contrato" })],
    });
  });

  it("detectar_furos: cada cenário do seed dispara o furo esperado", async () => {
    const furosDe = async (alunaId: string) =>
      conteudoJson<{ furos: Array<{ tipo: string }> }>(
        await chamarTool("detectar_furos", { aluna_id: alunaId })
      ).furos.map((furo) => furo.tipo);

    expect(await furosDe(IDS.ana)).toEqual([]);
    expect(await furosDe(IDS.carla)).toContain("assinou_sem_reuniao");
    expect(await furosDe(IDS.daniela)).toContain("formulario_sem_followup");
    expect(await furosDe(IDS.elisa)).toContain("task_parada");
  });

  it("pagamentos_pendentes lista só a Beatriz", async () => {
    const resultado = await chamarTool("pagamentos_pendentes");
    const grupos = conteudoJson<Array<Record<string, unknown>>>(resultado);
    expect(grupos).toEqual([
      expect.objectContaining({ aluna: "Beatriz Lima", total_em_atraso: 1200 }),
    ]);
  });

  it("documentos_nao_assinados lista o termo pendente da Beatriz", async () => {
    const resultado = await chamarTool("documentos_nao_assinados");
    const pendencias = conteudoJson<Array<Record<string, unknown>>>(resultado);
    expect(pendencias).toEqual([
      expect.objectContaining({ aluna: "Beatriz Lima", tipo: "termo de imagem" }),
    ]);
  });

  it("proxima_reuniao: Ana tem, Carla (cenário do seed) não tem", async () => {
    const ana = conteudoJson<Record<string, unknown>>(
      await chamarTool("proxima_reuniao", { nome: "Ana Paula Ribeiro" })
    );
    expect(ana.proxima_reuniao).toMatchObject({ status: "confirmada" });

    const carla = conteudoJson<Record<string, unknown>>(
      await chamarTool("proxima_reuniao", { nome: "Carla" })
    );
    expect(carla.proxima_reuniao).toBeNull();
    expect(carla.aviso).toContain("Nenhuma reunião futura");
  });

  it("buscar_formulario acha a anamnese da Daniela por termo com acento", async () => {
    const resultado = await chamarTool("buscar_formulario", { query: "EMAGRECIMENTO" });
    const corpo = conteudoJson<{ resultados: Array<{ aluna: string }> }>(resultado);
    expect(corpo.resultados).toEqual([expect.objectContaining({ aluna: "Daniela Souza" })]);
  });
});

describe("tools de escrita: efeito colateral + auditoria", () => {
  it("enviar_lembrete_pagamento envia pra Beatriz e audita com o token", async () => {
    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: IDS.beatriz });

    expect(resultado.isError).toBeUndefined();
    expect(vi.mocked(enviarMensagemWhatsApp)).toHaveBeenCalledWith(
      "5511911110002",
      expect.stringContaining("Oi, Beatriz!")
    );
    expect(banco.log_auditoria).toEqual([
      expect.objectContaining({
        origem: "mcp",
        acao: "enviar_lembrete_pagamento",
        aluna_id: IDS.beatriz,
        resultado: expect.stringContaining("lembrete enviado"),
        detalhes: expect.objectContaining({ token_nome: "token-total" }),
      }),
    ]);
  });

  it("enviar_lembrete_pagamento pra Ana (em dia) recusa e audita a recusa", async () => {
    const resultado = await chamarTool("enviar_lembrete_pagamento", { aluna_id: IDS.ana });

    expect(resultado.isError).toBe(true);
    expect(vi.mocked(enviarMensagemWhatsApp)).not.toHaveBeenCalled();
    expect(banco.log_auditoria).toEqual([
      expect.objectContaining({ resultado: "recusado: nenhum pagamento atrasado" }),
    ]);
  });

  it("criar_task_asana espelha a task e ela aparece nas leituras seguintes", async () => {
    const resultado = await chamarTool("criar_task_asana", {
      aluna_id: IDS.carla,
      titulo: "Agendar primeira reunião",
      descricao: "Contrato assinado sem reunião marcada",
    });

    expect(resultado.isError).toBeUndefined();
    expect(vi.mocked(criarTaskAsana)).toHaveBeenCalledWith(
      "Agendar primeira reunião — Carla Mendes",
      "Contrato assinado sem reunião marcada"
    );
    expect(banco.tasks_asana).toContainEqual(
      expect.objectContaining({ aluna_id: IDS.carla, task_id: "gid_nova_task", status: "aberta" })
    );
    expect(banco.log_auditoria).toEqual([
      expect.objectContaining({ acao: "criar_task_asana", aluna_id: IDS.carla }),
    ]);

    // Efeito visível nas leituras: a task nova entra nas abertas do dossiê.
    const dossie = conteudoJson<{ tasks_abertas: Array<{ task_id: string }> }>(
      await chamarTool("dossie_da_aluna", { aluna_id: IDS.carla })
    );
    expect(dossie.tasks_abertas).toEqual([expect.objectContaining({ task_id: "gid_nova_task" })]);
  });

  it("remarcar_reuniao cancela no Calendly, troca a reunião e audita", async () => {
    const novoHorario = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const resultado = await chamarTool("remarcar_reuniao", {
      aluna_id: IDS.ana,
      novo_horario: novoHorario,
    });

    expect(resultado.isError).toBeUndefined();
    expect(vi.mocked(cancelarAgendamentoCalendly)).toHaveBeenCalledWith(
      URI_CALENDLY_ANA,
      expect.stringContaining("Remarcada")
    );
    expect(banco.reunioes).toContainEqual(
      expect.objectContaining({ id: "reu_ana", status: "cancelada" })
    );
    expect(banco.reunioes).toContainEqual(
      expect.objectContaining({ aluna_id: IDS.ana, origem: "manual", data_hora: novoHorario })
    );
    expect(banco.log_auditoria).toEqual([
      expect.objectContaining({ acao: "remarcar_reuniao", aluna_id: IDS.ana }),
    ]);

    // Efeito visível nas leituras: a próxima reunião passa a ser a manual.
    const proxima = conteudoJson<{ proxima_reuniao: Record<string, unknown> }>(
      await chamarTool("proxima_reuniao", { nome: "Ana Paula Ribeiro" })
    );
    expect(proxima.proxima_reuniao).toMatchObject({ origem: "manual", data_hora: novoHorario });
  });

  it("remarcar_reuniao pra quem não tem reunião recusa, nada muda e audita", async () => {
    const totalDeReunioes = banco.reunioes.length;
    const resultado = await chamarTool("remarcar_reuniao", {
      aluna_id: IDS.beatriz,
      novo_horario: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    expect(resultado.isError).toBe(true);
    expect(vi.mocked(cancelarAgendamentoCalendly)).not.toHaveBeenCalled();
    expect(banco.reunioes).toHaveLength(totalDeReunioes);
    expect(banco.log_auditoria).toEqual([
      expect.objectContaining({ resultado: expect.stringContaining("recusado") }),
    ]);
  });
});
