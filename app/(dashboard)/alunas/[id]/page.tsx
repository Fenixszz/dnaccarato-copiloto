import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { montarDossie } from "@/lib/dossie";
import { registrarErroDeRota } from "@/lib/log";
import { DossieAluna } from "./dossie";

export default async function PaginaDetalheAluna({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  let dossie;
  try {
    dossie = await montarDossie(id);
  } catch (erro) {
    registrarErroDeRota({ rota: "/alunas/[id]", resumo: `aluna ${id}` }, erro);
    return (
      <section>
        <Voltar />
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar o dossiê agora. Recarregue a página em instantes.
        </p>
      </section>
    );
  }

  if (dossie === null) {
    notFound();
  }

  return (
    <section>
      <Voltar />
      <h2 className="mt-2 text-lg font-semibold">{dossie.aluna.nome}</h2>
      <div className="mt-4">
        <DossieAluna dossie={dossie} />
      </div>
    </section>
  );
}

function Voltar() {
  return (
    <Link href="/alunas" className="text-sm text-blue-600 hover:underline">
      ← Voltar para alunas
    </Link>
  );
}
