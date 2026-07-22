type ResultadoLeituraCorpo =
  | { sucesso: true; corpo: unknown }
  | { sucesso: false; erro: string };

// Lê o corpo da requisição como JSON sem deixar exceção de parse vazar pra
// rota. Corpo inválido vira um resultado de erro que a rota converte em 400.
export async function lerCorpoJson(request: Request): Promise<ResultadoLeituraCorpo> {
  try {
    return { sucesso: true, corpo: await request.json() };
  } catch {
    return { sucesso: false, erro: "Corpo da requisição não é JSON válido" };
  }
}
