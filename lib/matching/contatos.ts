// Matching de alunas por contato (email/telefone) entre sistemas. Cada
// sistema formata o contato de um jeito; a comparação é sempre sobre a forma
// normalizada — mesma filosofia de nomes.ts.

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

export function emailsCorrespondem(a: string, b: string): boolean {
  const emailA = normalizarEmail(a);
  const emailB = normalizarEmail(b);
  return emailA !== "" && emailA === emailB;
}

// Telefones brasileiros variam de formato (+55, DDD, 9 extra do celular).
// Os 8 últimos dígitos são estáveis entre as grafias; abaixo de 8 dígitos
// só aceita igualdade exata.
export function telefonesCorrespondem(a: string, b: string): boolean {
  const telefoneA = normalizarTelefone(a);
  const telefoneB = normalizarTelefone(b);
  if (telefoneA === "" || telefoneB === "") {
    return false;
  }
  if (telefoneA.length < 8 || telefoneB.length < 8) {
    return telefoneA === telefoneB;
  }
  return telefoneA.slice(-8) === telefoneB.slice(-8);
}

type RegistroComContato = {
  email: string | null;
  telefone: string | null;
};

// Acha o primeiro registro cujo email ou telefone bate com o contato dado.
export function encontrarPorContato<T extends RegistroComContato>(
  registros: T[],
  email: string | null | undefined,
  telefones: Array<string | null | undefined>
): T | null {
  const telefonesValidos = telefones.filter(
    (telefone): telefone is string => typeof telefone === "string" && telefone.trim() !== ""
  );
  for (const registro of registros) {
    if (email && registro.email && emailsCorrespondem(email, registro.email)) {
      return registro;
    }
    const telefoneDoRegistro = registro.telefone;
    if (
      telefoneDoRegistro &&
      telefonesValidos.some((telefone) => telefonesCorrespondem(telefone, telefoneDoRegistro))
    ) {
      return registro;
    }
  }
  return null;
}
