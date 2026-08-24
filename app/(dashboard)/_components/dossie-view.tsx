/**
 * Renderização (server component) do dossiê agregado de uma aluna — o mesmo
 * objeto montado por `montarDossie` e servido pela rota /api/alunas/[id]/dossie.
 * Só apresentação; nenhuma regra de negócio aqui.
 */
import Link from "next/link";
import type { Dossie } from "@/lib/dossie";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato";

const CORES_STATUS: Record<string, string> = {
  pago: "bg-emerald-50 text-emerald-700",
  assinado: "bg-emerald-50 text-emerald-700",
  concluida: "bg-emerald-50 text-emerald-700",
  agendada: "bg-marca-agua/20 text-marca-grafite",
  pendente: "bg-amber-50 text-amber-700",
  em_andamento: "bg-amber-50 text-amber-700",
  atrasado: "bg-marca-vinho/10 text-marca-vinho",
  rejeitado: "bg-marca-vinho/10 text-marca-vinho",
  cancelada: "bg-marca-nevoa text-marca-texto",
};

function Badge({ status }: { status: string | null }) {
  const chave = status ?? "—";
  const cor = CORES_STATUS[chave] ?? "bg-marca-nevoa text-marca-texto";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>
      {chave}
    </span>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-marca-nevoa bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-marca-grafite">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-marca-texto/70">{texto}</p>;
}

export function DossieView({ dossie }: { dossie: Dossie }) {
  const { aluna, pagamentos, documentos } = dossie;
  const todosDocumentos = [
    ...documentos.pendentes,
    ...documentos.rejeitados,
    ...documentos.assinados,
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/alunas"
          className="text-sm text-marca-texto hover:text-marca-grafite"
        >
          ← Voltar para alunas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-marca-grafite">{aluna.nome}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-marca-texto">
          <span>{aluna.email ?? "sem e-mail"}</span>
          <span>{aluna.telefone ?? "sem telefone"}</span>
          <span>Cadastro: {formatarData(aluna.criado_em)}</span>
        </div>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-marca-nevoa bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-marca-texto">Valor em aberto</p>
          <p className="mt-1 text-xl font-semibold text-marca-grafite">
            {formatarMoeda(pagamentos.resumo.valor_em_aberto)}
          </p>
        </div>
        <div className="rounded-xl border border-marca-nevoa bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-marca-texto">Pagamentos</p>
          <p className="mt-1 text-xl font-semibold text-marca-grafite">
            {pagamentos.resumo.total}
            {pagamentos.resumo.em_atraso ? (
              <span className="ml-2 align-middle">
                <Badge status="atrasado" />
              </span>
            ) : null}
          </p>
        </div>
        <div className="rounded-xl border border-marca-nevoa bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-marca-texto">Próxima reunião</p>
          <p className="mt-1 text-sm font-semibold text-marca-grafite">
            {dossie.proxima_reuniao
              ? formatarDataHora(dossie.proxima_reuniao.data_hora)
              : "Nenhuma agendada"}
          </p>
        </div>
      </div>

      {/* Pagamentos */}
      <Secao titulo="Pagamentos">
        {pagamentos.itens.length === 0 ? (
          <Vazio texto="Nenhum pagamento registrado." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-marca-texto/70">
              <tr>
                <th className="py-1 font-medium">Origem</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Valor</th>
                <th className="py-1 font-medium">Vencimento</th>
                <th className="py-1 font-medium">Pago em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-marca-nevoa">
              {pagamentos.itens.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 text-marca-texto">{p.origem}</td>
                  <td className="py-2">
                    <Badge status={p.status} />
                  </td>
                  <td className="py-2 tabular-nums text-marca-grafite">
                    {formatarMoeda(p.valor)}
                  </td>
                  <td className="py-2 text-marca-texto">{formatarData(p.vencimento)}</td>
                  <td className="py-2 text-marca-texto">{formatarData(p.pago_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      {/* Documentos */}
      <Secao titulo="Documentos">
        {todosDocumentos.length === 0 ? (
          <Vazio texto="Nenhum documento registrado." />
        ) : (
          <ul className="space-y-2">
            {todosDocumentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge status={d.status} />
                <span className="text-marca-grafite">{d.tipo}</span>
                {d.status === "rejeitado" && d.motivo_rejeicao ? (
                  <span className="text-marca-vinho">— {d.motivo_rejeicao}</span>
                ) : null}
                {d.status === "assinado" && d.link_assinado ? (
                  <a
                    href={d.link_assinado}
                    target="_blank"
                    rel="noreferrer"
                    className="text-marca-caramelo hover:underline"
                  >
                    ver assinado
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Tasks abertas */}
      <Secao titulo="Tasks abertas (Asana)">
        {dossie.tasks_abertas.length === 0 ? (
          <Vazio texto="Nenhuma task aberta." />
        ) : (
          <ul className="space-y-2">
            {dossie.tasks_abertas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge status={t.status} />
                <span className="text-marca-grafite">{t.titulo}</span>
                <span className="text-marca-texto/70">
                  criada {formatarData(t.criado_em)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Materiais recentes */}
      <Secao titulo="Materiais recentes">
        {dossie.materiais_recentes.length === 0 ? (
          <Vazio texto="Nenhum material no Drive." />
        ) : (
          <ul className="space-y-2">
            {dossie.materiais_recentes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                {m.link_drive ? (
                  <a
                    href={m.link_drive}
                    target="_blank"
                    rel="noreferrer"
                    className="text-marca-caramelo hover:underline"
                  >
                    {m.nome_arquivo}
                  </a>
                ) : (
                  <span className="text-marca-grafite">{m.nome_arquivo}</span>
                )}
                <span className="text-marca-texto/70">
                  {formatarData(m.adicionado_em)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Últimas respostas de formulário */}
      <Secao titulo="Últimas respostas de formulário">
        {dossie.ultimas_respostas_formulario.length === 0 ? (
          <Vazio texto="Nenhuma resposta registrada." />
        ) : (
          <ul className="space-y-3">
            {dossie.ultimas_respostas_formulario.map((f) => (
              <li key={f.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-marca-grafite">
                    {f.formulario_nome}
                  </span>
                  <span className="text-marca-texto/70">
                    {formatarData(f.respondido_em)}
                  </span>
                </div>
                <RespostasFormulario respostas={f.respostas} />
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

/** Mostra as respostas (Json) como pares chave/valor quando for um objeto. */
function RespostasFormulario({ respostas }: { respostas: unknown }) {
  if (respostas === null || typeof respostas !== "object" || Array.isArray(respostas)) {
    return null;
  }
  const pares = Object.entries(respostas as Record<string, unknown>);
  if (pares.length === 0) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-marca-texto">
      {pares.map(([chave, valor]) => (
        <div key={chave} className="contents">
          <dt className="text-marca-texto/70">{chave}</dt>
          <dd>{typeof valor === "string" ? valor : JSON.stringify(valor)}</dd>
        </div>
      ))}
    </dl>
  );
}
