import { obterSupabase } from "@/lib/db/supabase";
import { registrarFalhaCritica } from "@/lib/log";

// Registra uma falha grave do sistema: loga com severidade alta E grava em
// falhas_sistema pra monitoramento. Nunca lança — é o registrador de última
// instância; se nem o insert funcionar, só sobra o log.
export async function registrarFalha(area: string, contexto: string, erro: unknown): Promise<void> {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  registrarFalhaCritica(area, contexto, mensagem);

  const { error } = await obterSupabase().from("falhas_sistema").insert({
    area,
    contexto,
    erro: mensagem,
    severidade: "alta",
  });
  if (error) {
    registrarFalhaCritica(area, `não gravou em falhas_sistema: ${contexto}`, error.message);
  }
}
