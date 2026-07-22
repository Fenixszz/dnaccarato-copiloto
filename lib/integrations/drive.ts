import { obterAccessTokenGoogle } from "@/lib/integrations/google";
import { listaArquivosDriveSchema, type ArquivoDrive } from "@/lib/validation/drive";

// Client do Google Drive (documentos de alunas).

// Lista os arquivos (não apagados) da pasta de documentos de alunas. A
// notificação push não diz O QUE mudou, então a sincronização relê a pasta
// inteira — barato na escala da clínica e imune a notificação perdida.
export async function listarArquivosDaPasta(pastaId: string): Promise<ArquivoDrive[]> {
  const accessToken = await obterAccessTokenGoogle();
  const parametros = new URLSearchParams({
    q: `'${pastaId}' in parents and trashed = false`,
    fields: "files(id, name, modifiedTime, webViewLink)",
    pageSize: "1000",
  });
  const resposta = await fetch(`https://www.googleapis.com/drive/v3/files?${parametros}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resposta.ok) {
    throw new Error(`Drive retornou HTTP ${resposta.status} ao listar a pasta ${pastaId}`);
  }
  const corpo: unknown = await resposta.json();
  const lista = listaArquivosDriveSchema.safeParse(corpo);
  if (!lista.success) {
    throw new Error("Resposta inesperada do Drive ao listar arquivos");
  }
  return lista.data.files;
}
