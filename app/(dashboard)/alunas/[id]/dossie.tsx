import type { montarDossie } from "@/lib/dossie";
import { formatarData, formatarDataHora, formatarReais } from "@/lib/formato";

type Dossie = NonNullable<Awaited<ReturnType<typeof montarDossie>>>;

const ROTULO_SITUACAO: Record<string, string> = {
  em_dia: "Em dia",
  atrasado: "Atrasado",
  sem_registros: "Sem registros",
};

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-neutral-700">{titulo}</h3>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-neutral-400">{texto}</p>;
}

function Respostas({ respostas }: { respostas: unknown }) {
  // O formato mais comum (webhook de Forms) é [{ pergunta, resposta }].
  if (
    Array.isArray(respostas) &&
    respostas.every(
      (item) =>
        item !== null && typeof item === "object" && "pergunta" in item && "resposta" in item
    )
  ) {
    return (
      <dl className="mt-1 space-y-1">
        {(respostas as Array<{ pergunta: string; resposta: string }>).map((item, indice) => (
          <div key={indice}>
            <dt className="text-neutral-500">{item.pergunta}</dt>
            <dd>{item.resposta || "—"}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-2 text-xs">
      {JSON.stringify(respostas, null, 2)}
    </pre>
  );
}

export function DossieAluna({ dossie }: { dossie: Dossie }) {
  const { aluna, pagamentos, documentos, formularios, proxima_reuniao, tasks_abertas } = dossie;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Secao titulo="Cadastro">
        <p className="text-base font-medium">{aluna.nome}</p>
        <p className="text-neutral-500">{aluna.email ?? "sem email"}</p>
        <p className="text-neutral-500">{aluna.telefone ?? "sem telefone"}</p>
        <p className="mt-1 text-neutral-400">Cadastrada em {formatarData(aluna.criado_em)}</p>
      </Secao>

      <Secao titulo="Pagamentos">
        <p>
          Situação:{" "}
          <span
            className={
              pagamentos.situacao === "atrasado" ? "font-semibold text-red-600" : "font-medium"
            }
          >
            {ROTULO_SITUACAO[pagamentos.situacao] ?? pagamentos.situacao}
          </span>
        </p>
        {pagamentos.quantidade_em_atraso > 0 && (
          <p className="text-red-600">
            {pagamentos.quantidade_em_atraso} em atraso ·{" "}
            {formatarReais(pagamentos.total_em_atraso)}
          </p>
        )}
        <p className="text-neutral-500">
          Último pagamento: {formatarData(pagamentos.ultimo_pagamento_em)}
        </p>
        {pagamentos.recentes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {pagamentos.recentes.map((pagamento) => (
              <li key={pagamento.id} className="flex justify-between gap-2">
                <span>
                  {formatarReais(pagamento.valor)} · venc. {formatarData(pagamento.vencimento)}
                </span>
                <span className="text-neutral-500">{pagamento.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Documentos">
        {documentos.pendentes.length === 0 && documentos.assinados.length === 0 ? (
          <Vazio texto="Nenhum documento." />
        ) : (
          <>
            {documentos.pendentes.length > 0 && (
              <div>
                <p className="text-neutral-500">Pendentes</p>
                <ul className="space-y-1">
                  {documentos.pendentes.map((documento) => (
                    <li key={documento.id} className="text-red-600">
                      {documento.tipo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {documentos.assinados.length > 0 && (
              <div className="mt-2">
                <p className="text-neutral-500">Assinados</p>
                <ul className="space-y-1">
                  {documentos.assinados.map((documento) => (
                    <li key={documento.id} className="flex justify-between gap-2">
                      <span>{documento.tipo}</span>
                      <span className="text-neutral-400">
                        {formatarData(documento.assinado_em)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Secao>

      <Secao titulo="Próxima reunião">
        {proxima_reuniao ? (
          <p>
            {formatarDataHora(proxima_reuniao.data_hora)} · {proxima_reuniao.status}
            {proxima_reuniao.link && (
              <>
                {" · "}
                <a
                  href={proxima_reuniao.link}
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  link
                </a>
              </>
            )}
          </p>
        ) : (
          <Vazio texto="Nenhuma reunião marcada." />
        )}
      </Secao>

      <Secao titulo="Formulários recentes">
        {formularios.length === 0 ? (
          <Vazio texto="Nenhum formulário respondido." />
        ) : (
          <ul className="space-y-3">
            {formularios.map((formulario) => (
              <li key={formulario.id}>
                <p className="font-medium">{formulario.formulario_nome}</p>
                <p className="text-neutral-400">
                  Respondido em {formatarData(formulario.respondido_em)}
                </p>
                <Respostas respostas={formulario.respostas} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Tasks abertas">
        {tasks_abertas.length === 0 ? (
          <Vazio texto="Nenhuma task aberta." />
        ) : (
          <ul className="space-y-1">
            {tasks_abertas.map((task) => (
              <li key={task.id} className="flex justify-between gap-2">
                <span>{task.titulo}</span>
                <span className="text-neutral-500">{task.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
