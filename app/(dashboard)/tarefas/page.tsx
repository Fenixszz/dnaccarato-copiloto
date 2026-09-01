import type { Metadata } from "next";
import Link from "next/link";
import { carregarTarefas, estadoTarefa, type EstadoTarefa } from "@/lib/tarefas/carregar";
import { formatarData } from "@/lib/formato";
import { EstadoVazio } from "../_components/estados";

export const metadata: Metadata = { title: "Tarefas — Copiloto Naccarato" };

// Dado sempre fresco: reflete as tarefas do Asana a cada acesso.
export const dynamic = "force-dynamic";

const ROTULO_ESTADO: Record<EstadoTarefa, string> = {
  aberta: "Em andamento",
  concluida: "Concluída",
  removida: "Removida",
};

const CORES_ESTADO: Record<EstadoTarefa, string> = {
  aberta: "bg-marca-caramelo/15 text-marca-caramelo-escuro",
  concluida: "bg-emerald-100 text-emerald-700",
  removida: "bg-marca-nevoa text-marca-texto",
};

export default async function TarefasPage() {
  const tarefas = await carregarTarefas();
  const abertas = tarefas.filter((t) => estadoTarefa(t.status) === "aberta").length;

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-marca-grafite">Tarefas</h1>
          <p className="mt-1 text-sm text-marca-texto">
            Tarefas do Asana vinculadas às alunas — em andamento primeiro.
          </p>
        </div>
        <span className="text-sm text-marca-texto">
          {abertas} em andamento · {tarefas.length} no total
        </span>
      </div>

      <div className="mt-6">
        {tarefas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma tarefa por aqui ainda."
            descricao="Quando uma tarefa do Asana vinculada a uma aluna for criada ou atualizada, ela aparece aqui."
          />
        ) : (
          <ul className="space-y-3">
            {tarefas.map((t) => {
              const estado = estadoTarefa(t.status);
              return (
                <li
                  key={t.id}
                  className="rounded-xl border border-marca-nevoa bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CORES_ESTADO[estado]}`}
                        >
                          {ROTULO_ESTADO[estado]}
                        </span>
                        {t.aluna ? (
                          <Link
                            href={`/alunas/${t.aluna.id}`}
                            className="text-xs font-medium text-marca-texto hover:text-marca-caramelo hover:underline"
                          >
                            {t.aluna.nome}
                          </Link>
                        ) : (
                          <span className="text-xs text-marca-texto">Sem aluna</span>
                        )}
                      </div>
                      <p
                        className={`mt-1 text-sm font-medium text-marca-grafite ${
                          estado === "removida" ? "line-through opacity-70" : ""
                        }`}
                      >
                        {t.titulo}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-marca-texto">
                    Criada {formatarData(t.criado_em)}
                    {estado === "concluida" && t.concluido_em
                      ? ` · concluída ${formatarData(t.concluido_em)}`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
