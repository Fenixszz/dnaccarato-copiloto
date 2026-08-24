/**
 * Cards de métrica da tela inicial + o esqueleto usado no estado de loading.
 * Componentes de servidor puros (sem estado) — reaproveitados por page.tsx e
 * loading.tsx para que o skeleton tenha exatamente o mesmo shape do card.
 */
import Link from "next/link";

export type TomCard = "neutro" | "alerta" | "info";

const TONS: Record<TomCard, { borda: string; valor: string }> = {
  neutro: { borda: "border-l-marca-areia", valor: "text-marca-grafite" },
  alerta: { borda: "border-l-marca-vinho", valor: "text-marca-vinho" },
  info: { borda: "border-l-marca-caramelo", valor: "text-marca-caramelo" },
};

export function CardMetrica({
  titulo,
  valor,
  descricao,
  tom = "neutro",
  href,
}: {
  titulo: string;
  valor: number;
  descricao: string;
  tom?: TomCard;
  href?: string;
}) {
  // Métricas de "problema" (atraso/pendências) só ganham cor quando há o que
  // resolver; zeradas ficam neutras (é boa notícia, não precisa gritar).
  const tomEfetivo: TomCard =
    (tom === "alerta" || tom === "info") && valor === 0 ? "neutro" : tom;
  const estilo = TONS[tomEfetivo];

  const conteudo = (
    <>
      <p className="text-sm font-medium text-marca-texto">{titulo}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${estilo.valor}`}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-marca-texto/70">{descricao}</p>
    </>
  );

  const classeBase = `block rounded-xl border border-l-4 border-marca-nevoa bg-white p-5 shadow-sm ${estilo.borda}`;

  if (href) {
    return (
      <Link href={href} className={`${classeBase} transition-shadow hover:shadow-md`}>
        {conteudo}
      </Link>
    );
  }
  return <div className={classeBase}>{conteudo}</div>;
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-l-4 border-marca-nevoa border-l-marca-areia bg-white p-5 shadow-sm">
      <div className="h-4 w-24 animate-pulse rounded bg-marca-nevoa" />
      <div className="mt-3 h-8 w-12 animate-pulse rounded bg-marca-nevoa" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-marca-nevoa/60" />
    </div>
  );
}

/** Grade responsiva compartilhada pelos cards (page e loading). */
export function GradeCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}
