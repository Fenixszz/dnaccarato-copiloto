// Área administrativa. Autenticação entra em fase futura — nada aqui é
// considerado protegido ainda.
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b p-4">
        <h1 className="font-semibold">Copiloto Dnaccarato — área administrativa</h1>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
