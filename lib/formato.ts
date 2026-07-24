// Formatação pt-BR para as telas do dashboard. Manual (sem Intl) pra ser
// determinística e testável. O Brasil não tem horário de verão desde 2019,
// então o fuso de Brasília é fixo em UTC-3.

const OFFSET_BRASILIA_MIN = -180;

function emBrasilia(iso: string): Date {
  return new Date(new Date(iso).getTime() + OFFSET_BRASILIA_MIN * 60 * 1000);
}

export function formatarReais(valor: number): string {
  const [inteiro, centavos] = Math.abs(valor).toFixed(2).split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sinal = valor < 0 ? "-" : "";
  return `${sinal}R$ ${comMilhar},${centavos}`;
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const data = emBrasilia(iso);
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const data = emBrasilia(iso);
  const hora = String(data.getUTCHours()).padStart(2, "0");
  const minuto = String(data.getUTCMinutes()).padStart(2, "0");
  return `${formatarData(iso)} ${hora}:${minuto}`;
}
