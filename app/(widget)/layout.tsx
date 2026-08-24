/**
 * Layout do widget de chat público (rota /widget).
 *
 * Página PÚBLICA — sem autenticação (o middleware não cobre /widget). Ocupa a
 * viewport inteira (chat full-screen). Usa a identidade visual da Adriana
 * Naccarato (paleta marca-*, fonte Nunito Sans herdada do layout raiz).
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh bg-marca-creme text-marca-grafite">{children}</div>;
}
