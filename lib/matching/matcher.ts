import { emailsCorrespondem, telefonesCorrespondem } from "@/lib/matching/contatos";
import { normalizarNome, nomesCorrespondem } from "@/lib/matching/nomes";

// Matcher central: decide se um evento novo (webhook de qualquer origem)
// pertence a uma aluna já cadastrada ou é uma pessoa nova.
//
// Princípio: FALSO POSITIVO É PIOR QUE FALSO NEGATIVO. Vincular o pagamento
// da pessoa errada é grave; criar uma aluna duplicada é chato mas corrigível.
// Por isso as regras são conservadoras e a prioridade é dos sinais mais
// fortes pros mais fracos: email > telefone > nome. Na dúvida (ambiguidade),
// não casa.

export type ContatoDeEvento = {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
};

export type AlunaCandidata = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
};

export type ResultadoMatching<T> =
  { corresponde: true; aluna: T; criterio: "email" | "telefone" | "nome" } | { corresponde: false };

// Conectivos não carregam identidade: "Maria de Souza" ≡ "Maria Souza".
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

export function tokensDeNome(nome: string): string[] {
  return normalizarNome(nome)
    .split(" ")
    .filter((token) => token !== "" && !CONECTIVOS.has(token));
}

// Nome fuzzy conservador: igualdade normalizada, OU sobrenome incompleto —
// todos os tokens do nome mais curto presentes no mais longo, com primeiro
// nome idêntico e pelo menos 2 tokens ("Maria Costa" casa com "Maria
// Fernanda Costa"; "Maria" sozinho nunca casa; "Mariana" nunca casa com
// "Maria").
export function nomesProvavelmenteIguais(a: string, b: string): boolean {
  if (nomesCorrespondem(a, b)) {
    return true;
  }
  const tokensA = tokensDeNome(a);
  const tokensB = tokensDeNome(b);
  const [curto, longo] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (curto.length < 2) {
    return false;
  }
  if (curto[0] !== longo[0]) {
    return false;
  }
  return curto.every((token) => longo.includes(token));
}

export function encontrarAluna<T extends AlunaCandidata>(
  alunas: T[],
  contato: ContatoDeEvento
): ResultadoMatching<T> {
  const email = contato.email;
  if (email && email.trim() !== "") {
    const porEmail = alunas.find(
      (aluna) => aluna.email !== null && emailsCorrespondem(email, aluna.email)
    );
    if (porEmail) {
      return { corresponde: true, aluna: porEmail, criterio: "email" };
    }
  }

  const telefone = contato.telefone;
  if (telefone && telefone.trim() !== "") {
    const porTelefone = alunas.find(
      (aluna) => aluna.telefone !== null && telefonesCorrespondem(telefone, aluna.telefone)
    );
    if (porTelefone) {
      return { corresponde: true, aluna: porTelefone, criterio: "telefone" };
    }
  }

  const nome = contato.nome;
  if (nome && nome.trim() !== "") {
    const porNome = alunas.filter((aluna) => nomesProvavelmenteIguais(aluna.nome, nome));
    // Só casa por nome se a candidata for ÚNICA: com duas alunas plausíveis,
    // escolher uma seria chute — e falso positivo é pior que falso negativo.
    if (porNome.length === 1) {
      return { corresponde: true, aluna: porNome[0], criterio: "nome" };
    }
  }

  return { corresponde: false };
}
