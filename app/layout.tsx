import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

// Nunito Sans é a fonte oficial da marca Adriana Naccarato (drinaccarato.com.br).
// Aplicada globalmente: todo o app herda a tipografia da marca.
const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
  variable: "--fonte-marca",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Copiloto Naccarato",
  description: "Copiloto operacional do escritório Adriana Naccarato.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={nunito.variable}>
      <body className="bg-marca-creme font-marca text-marca-grafite">{children}</body>
    </html>
  );
}
