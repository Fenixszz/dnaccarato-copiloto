/**
 * Layout do widget de chat público white-label (rota /widget).
 *
 * Página PÚBLICA — sem autenticação (o middleware não cobre /widget). Ocupa a
 * viewport inteira (chat full-screen). Usa a MESMA paleta/tipografia do
 * dashboard (Fase 6.2): canvas slate-50, texto slate-900, tons neutros — sem
 * identidade de marca. O que importa aqui é consistência com o dashboard.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh bg-slate-50 text-slate-900">{children}</div>;
}
