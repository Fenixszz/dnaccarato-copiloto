import { z } from "zod";

// OAuth compartilhado das integrações Google (Drive, Forms, Gmail, Agenda):
// troca o refresh token da conta da clínica por um access token de curta
// duração. Credenciais: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e
// GOOGLE_REFRESH_TOKEN (veja .env.example).

const respostaTokenSchema = z.object({
  access_token: z.string().min(1),
});

export async function obterAccessTokenGoogle(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN precisam estar definidas (veja .env.example)"
    );
  }
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Google OAuth retornou HTTP ${resposta.status} ao renovar o access token`);
  }
  const corpo: unknown = await resposta.json();
  const token = respostaTokenSchema.safeParse(corpo);
  if (!token.success) {
    throw new Error("Resposta inesperada do Google OAuth ao renovar o access token");
  }
  return token.data.access_token;
}
