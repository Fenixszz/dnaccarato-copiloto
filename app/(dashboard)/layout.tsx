/**
 * Layout base da área administrativa autenticada.
 * Sem estilização definitiva ainda — só a estrutura mínima.
 * A verificação de autenticação será adicionada numa sub-fase futura.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header>
        <span>Copiloto Dnaccarato — Painel</span>
      </header>
      <main>{children}</main>
    </div>
  );
}
