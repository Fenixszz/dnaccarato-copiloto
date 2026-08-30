import { JWT } from "google-auth-library";
import { requireEnv } from "@/lib/env";

/**
 * Autenticação Google via CONTA DE SERVIÇO com domain-wide delegation —
 * projeto Google Cloud da Adriana.
 *
 * A conta de serviço faz impersonation (subject = EMAIL_ADRIANA) e acessa
 * Drive, Gmail, Google Agenda (Calendar) e Forms como se fosse a Adriana.
 * Usado por drive.ts, gmail.ts, agenda.ts e forms.ts.
 *
 * Não há tabela de tokens, rota de callback nem lógica de refresh: a
 * google-auth-library assina um JWT com a chave privada da conta de serviço e
 * troca por um access token automaticamente, renovando quando expira. O acesso
 * não "expira" no sentido de precisar de reautorização humana.
 *
 * Pré-requisitos no Google Workspace da Adriana:
 *  - Conta de serviço criada no projeto GCP, com uma chave JSON.
 *  - Domain-wide delegation habilitada, autorizando o Client ID da conta de
 *    serviço para EXATAMENTE os escopos em ESCOPOS_GOOGLE (Admin Console →
 *    Security → API Controls → Domain-wide delegation).
 *  - GOOGLE_SERVICE_ACCOUNT_JSON = o JSON inteiro da chave, em base64.
 *  - EMAIL_ADRIANA = e-mail dela a ser impersonado (subject).
 */

/**
 * Escopos concedidos ao token impersonado. DEVEM ser um subconjunto dos
 * autorizados na domain-wide delegation, senão o Google recusa o token INTEIRO
 * (unauthorized_client). O app só LÊ (agenda, drive, gmail, respostas de forms),
 * então usamos os escopos READ-ONLY — menor privilégio: o copiloto não pode
 * alterar nem apagar nada da conta da Adriana.
 * Se um dia precisar escrever (ex.: enviar e-mail = "gmail.send", criar evento =
 * "calendar"), acrescente o escopo aqui E autorize-o na delegation do Workspace.
 */
export const ESCOPOS_GOOGLE = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/forms.responses.readonly",
] as const;

interface ContaServico {
  client_email: string;
  private_key: string;
}

function ehContaServico(valor: unknown): valor is ContaServico {
  if (typeof valor !== "object" || valor === null) return false;
  const obj = valor as Record<string, unknown>;
  return typeof obj.client_email === "string" && typeof obj.private_key === "string";
}

/** Decodifica GOOGLE_SERVICE_ACCOUNT_JSON (base64) e valida os campos usados. */
function lerContaServico(): ContaServico {
  const b64 = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON");

  let bruto: string;
  try {
    bruto = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não pôde ser decodificado de base64.");
  }

  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON (após base64) não é um JSON válido de conta de serviço.",
    );
  }

  if (!ehContaServico(json)) {
    throw new Error(
      "JSON da conta de serviço sem client_email/private_key. Confira a chave gerada no GCP.",
    );
  }
  return { client_email: json.client_email, private_key: json.private_key };
}

// Cache de clientes JWT por conjunto de escopos (evita reconstruir a cada chamada).
const clientesPorEscopo = new Map<string, JWT>();

/**
 * Retorna um cliente JWT autenticado como a conta de serviço, impersonando
 * EMAIL_ADRIANA. Pode ser passado direto para a googleapis, se necessário.
 */
export function getGoogleClient(scopes: readonly string[] = ESCOPOS_GOOGLE): JWT {
  const chaveCache = scopes.join(" ");
  const existente = clientesPorEscopo.get(chaveCache);
  if (existente) return existente;

  const conta = lerContaServico();
  const jwt = new JWT({
    email: conta.client_email,
    key: conta.private_key,
    scopes: [...scopes],
    subject: requireEnv("EMAIL_ADRIANA"),
  });
  clientesPorEscopo.set(chaveCache, jwt);
  return jwt;
}

/**
 * Obtém um access token válido (impersonando a Adriana). A biblioteca cuida
 * de assinar o JWT, trocar por token e renovar quando expira.
 */
export async function obterAccessToken(
  scopes: readonly string[] = ESCOPOS_GOOGLE,
): Promise<string> {
  const jwt = getGoogleClient(scopes);
  const { token } = await jwt.getAccessToken();
  if (!token) {
    throw new Error("Google: não foi possível obter access token da conta de serviço.");
  }
  return token;
}
