/**
 * Layout base do widget de chat público white-label.
 * Página pública — sem autenticação. Estilização definitiva vem depois.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
