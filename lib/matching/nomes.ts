// Cruzamento de nomes de pacientes entre sistemas (Asaas, Calendly, Forms,
// WhatsApp...). Cada sistema grafa o nome de um jeito; a comparação é sempre
// feita sobre a forma normalizada.

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function nomesCorrespondem(a: string, b: string): boolean {
  const nomeA = normalizarNome(a);
  const nomeB = normalizarNome(b);
  if (nomeA.length === 0 || nomeB.length === 0) {
    return false;
  }
  return nomeA === nomeB;
}
