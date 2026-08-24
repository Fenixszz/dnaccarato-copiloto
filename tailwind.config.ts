import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Identidade visual oficial da Adriana Naccarato (drinaccarato.com.br).
        // Paleta extraída do kit Elementor do site.
        marca: {
          caramelo: "#A6764E", // cor primária/assinatura
          "caramelo-escuro": "#6E4A2C", // caramelo tostado (gradientes/hover)
          vinho: "#760E0D", // vermelho oxblood do monograma AN
          grafite: "#23282C", // secundária (quase preto)
          texto: "#7A7A7A", // texto de apoio
          areia: "#DDD0C8", // bege
          nevoa: "#EDE5DF", // bege claro
          creme: "#F9F7F5", // off-white de fundo
          agua: "#74C3B8", // accent verde-água
        },
      },
      fontFamily: {
        marca: ["var(--fonte-marca)", "Nunito Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
