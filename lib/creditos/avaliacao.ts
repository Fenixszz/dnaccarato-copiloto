/**
 * Avaliação do saldo de créditos para os avisos escalonados do briefing.
 *
 * Função PURA (não busca nada): recebe saldo, última recarga e média de
 * consumo diário já calculados, e devolve o nível + a mensagem pronta.
 *
 * Regra de ouro (CLAUDE.md do produto): o saldo NUNCA bloqueia nada. Estes
 * avisos são só transparência — a Adriana nunca fica sem serviço; o auto-reload
 * do cartão do João cobre. O objetivo é ela saber QUANDO pagar, sem cobrança.
 */
import { formatarMoeda } from "@/lib/formato";

export type NivelCredito = "ok" | "leve" | "claro" | "zerado";

/** Cor do semáforo (verde/amarelo/vermelho) a partir do nível. */
export type CorSemaforo = "verde" | "amarelo" | "vermelho";

/**
 * Mapeia o nível para a cor do indicador visual: verde (ok), amarelo (aviso
 * leve) e vermelho (baixo/zerado — exige atenção, mas sem pânico: o serviço
 * segue rodando).
 */
export function semaforoDoNivel(nivel: NivelCredito): CorSemaforo {
  switch (nivel) {
    case "ok":
      return "verde";
    case "leve":
      return "amarelo";
    case "claro":
    case "zerado":
      return "vermelho";
  }
}

export interface AvaliacaoCredito {
  nivel: NivelCredito;
  saldoCentavos: number;
  /** Dias restantes no ritmo atual, ou null se não há consumo pra estimar. */
  diasRestantes: number | null;
  /** Aviso pronto pro briefing, ou null quando está tudo tranquilo (nível ok). */
  mensagem: string | null;
}

/** Fração da última recarga abaixo da qual soa o aviso leve (~30%). */
export const LIMIAR_LEVE = 0.3;
/** Fração da última recarga abaixo da qual soa o aviso claro (~10%). */
export const LIMIAR_CLARO = 0.1;

function reais(centavos: number): string {
  return formatarMoeda(centavos / 100);
}

/** Estima os dias restantes no ritmo atual; null se não há consumo. */
export function diasRestantes(
  saldoCentavos: number,
  mediaDiariaCentavos: number,
): number | null {
  if (mediaDiariaCentavos <= 0) return null;
  return Math.max(0, Math.floor(saldoCentavos / mediaDiariaCentavos));
}

function trechoDias(dias: number | null): string {
  if (dias === null) return "";
  const unidade = dias === 1 ? "dia" : "dias";
  return ` — dá pra mais ou menos ${dias} ${unidade} no ritmo atual`;
}

export function avaliarCreditos(params: {
  saldoCentavos: number;
  ultimaRecargaCentavos: number | null;
  mediaDiariaCentavos: number;
  /** Chave Pix do João, incluída nos avisos mais fortes pra facilitar o acerto. */
  pixChave?: string | null;
}): AvaliacaoCredito {
  const { saldoCentavos, ultimaRecargaCentavos, mediaDiariaCentavos, pixChave } = params;
  const dias = diasRestantes(saldoCentavos, mediaDiariaCentavos);
  const pix = pixChave ? ` Chave Pix pra recarregar: ${pixChave}.` : "";

  // Zerado/negativo: o serviço SEGUE normal — sem alarme, só transparência.
  if (saldoCentavos <= 0) {
    const aAcertar = saldoCentavos < 0 ? ` Há ${reais(-saldoCentavos)} a acertar.` : "";
    return {
      nivel: "zerado",
      saldoCentavos,
      diasRestantes: dias,
      mensagem:
        `Seus créditos zeraram, mas o serviço continua rodando normalmente — ` +
        `nada para de funcionar.${aAcertar}${pix}`.trim(),
    };
  }

  // Sem referência de recarga: não dá pra calcular %; considera tranquilo.
  if (ultimaRecargaCentavos !== null && ultimaRecargaCentavos > 0) {
    if (saldoCentavos < ultimaRecargaCentavos * LIMIAR_CLARO) {
      return {
        nivel: "claro",
        saldoCentavos,
        diasRestantes: dias,
        mensagem:
          `Seus créditos estão baixos: ${reais(saldoCentavos)}${trechoDias(dias)}. ` +
          `Vale recarregar em breve.${pix}`.trim(),
      };
    }
    if (saldoCentavos < ultimaRecargaCentavos * LIMIAR_LEVE) {
      return {
        nivel: "leve",
        saldoCentavos,
        diasRestantes: dias,
        mensagem: `Seus créditos estão em ${reais(saldoCentavos)}${trechoDias(dias)}.`,
      };
    }
  }

  return { nivel: "ok", saldoCentavos, diasRestantes: dias, mensagem: null };
}
