// Grupo de rotas públicas do widget de chat white-label. Sem chrome da área
// administrativa: o widget é embutido em sites de terceiros.
export default function WidgetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="min-h-screen">{children}</div>;
}
