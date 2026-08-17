import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { carregarDossie } from "@/lib/db/queries";
import { DossieView } from "../../_components/dossie-view";

export const metadata: Metadata = { title: "Dossiê da aluna — Copiloto Dnaccarato" };

// Dado sempre fresco: o dossiê reflete o estado atual do banco a cada acesso.
export const dynamic = "force-dynamic";

export default async function AlunaDossiePage({ params }: { params: { id: string } }) {
  const idValido = z.string().uuid().safeParse(params.id);
  if (!idValido.success) notFound();

  const dossie = await carregarDossie(idValido.data);
  if (dossie === null) notFound();

  return (
    <section className="mx-auto max-w-4xl px-6 py-8">
      <DossieView dossie={dossie} />
    </section>
  );
}
