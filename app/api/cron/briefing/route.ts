import { NextResponse } from "next/server";
import { comTratamentoDeErro, logarErro } from "@/lib/webhooks/validation";
import { optionalEnv, requireEnv } from "@/lib/env";
import { getServiceClient } from "@/lib/db/client";
import { detectarFurosDeTodas } from "@/lib/matching/furos";
import {
  priorizarFuros,
  gerarTextoBriefing,
  type Compromisso,
} from "@/lib/briefing/priorizar";
import { compromissosDeHoje } from "@/lib/integrations/agenda";
import { enviarComRetry } from "@/lib/whatsapp/envio";
import { normalizarTelefone } from "@/lib/matching/matcher";
import { inicioDeHojeSP } from "@/lib/tempo";
import {
  lerSaldo,
  ultimaRecargaCentavos,
  mediaConsumoDiarioCentavos,
} from "@/lib/creditos";
import { avaliarCreditos } from "@/lib/creditos/avaliacao";
import type { Json } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Briefing diário — chamado pelo Cron da Vercel.
 *
 * O cron da Vercel dispara 1x/dia (vercel.json: `0 10 * * *` = 07:00 em
 * America/Sao_Paulo). Esta rota envia no máximo UM briefing por dia
 * (idempotência via `briefings_enviados`). Passe ?forcar=1 para reenviar já.
 *
 * Protegida: exige Authorization: Bearer <CRON_SECRET> (a Vercel injeta esse
 * header automaticamente quando CRON_SECRET está definido).
 *
 * Fluxo: detecta furos de todas as alunas → prioriza → gera a mensagem (+ resumo
 * da agenda do dia) → envia no WhatsApp da Adriana (via rate limiter) → grava
 * em briefings_enviados.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rota = "GET /api/cron/briefing";

  return comTratamentoDeErro({ rota }, async () => {
    // Autorização do cron.
    if (request.headers.get("authorization") !== `Bearer ${requireEnv("CRON_SECRET")}`) {
      logarErro(new Error("Chamada ao cron sem autorização"), { rota });
      return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
    }

    const forcar = new URL(request.url).searchParams.get("forcar") === "1";
    const db = getServiceClient();

    // Idempotência: o cron é diário, então no máximo um briefing enviado por dia.
    // Evita reenvio se a Vercel disparar o cron mais de uma vez no mesmo dia.
    if (!forcar) {
      const { data: jaHoje, error: eJa } = await db
        .from("briefings_enviados")
        .select("id")
        .eq("status", "enviado")
        .gte("enviado_em", inicioDeHojeSP())
        .limit(1);
      if (eJa) throw new Error(`Falha ao checar briefing do dia: ${eJa.message}`);
      if (jaHoje !== null && jaHoje.length > 0) {
        return NextResponse.json({ status: "ja_enviado_hoje" });
      }
    }

    // 1. Furos de todas as alunas → prioriza (top 2-3).
    const entradas = await detectarFurosDeTodas();
    const prioritizados = priorizarFuros(entradas);

    // Agenda do dia (contexto extra — nunca deve quebrar o briefing).
    let compromissos: Compromisso[] = [];
    try {
      compromissos = await compromissosDeHoje();
    } catch (erro) {
      logarErro(erro, { rota, resumo: { etapa: "agenda" } });
    }

    // Aviso de créditos (transparência — nunca deve quebrar o briefing).
    let avisoCredito: string | null = null;
    try {
      const [saldo, ultima, media] = await Promise.all([
        lerSaldo(),
        ultimaRecargaCentavos(),
        mediaConsumoDiarioCentavos(7),
      ]);
      avisoCredito = avaliarCreditos({
        saldoCentavos: saldo.saldoCentavos,
        ultimaRecargaCentavos: ultima,
        mediaDiariaCentavos: media,
        pixChave: optionalEnv("PIX_CHAVE_JOAO") || null,
      }).mensagem;
    } catch (erro) {
      logarErro(erro, { rota, resumo: { etapa: "credito" } });
    }

    // 2. Mensagem.
    const texto = gerarTextoBriefing(prioritizados, compromissos, avisoCredito);

    // 3. Envia no WhatsApp da Adriana (retry + backoff; rate limiter dentro).
    const destino = normalizarTelefone(requireEnv("BRIEFING_WHATSAPP"));
    const envio = await enviarComRetry(
      { numero: destino, texto },
      { contexto: { origem: "briefing" } },
    );

    // 4. Salva o histórico.
    const metadata: Record<string, Json> = {
      furos: prioritizados.length,
      compromissos: compromissos.length,
      tentativas: envio.tentativas,
    };
    const { error: eHist } = await db.from("briefings_enviados").insert({
      destino,
      canal: "whatsapp",
      conteudo: texto,
      status: envio.ok ? "enviado" : "falha",
      metadata,
    });
    if (eHist) throw new Error(`Falha ao salvar briefing: ${eHist.message}`);

    // Se todas as tentativas falharam, a falha já foi registrada em
    // falhas_sistema (por enviarComRetry).
    if (!envio.ok) {
      return NextResponse.json(
        { status: "falha_envio", tentativas: envio.tentativas },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: "enviado",
      furos: prioritizados.length,
      compromissos: compromissos.length,
    });
  });
}
