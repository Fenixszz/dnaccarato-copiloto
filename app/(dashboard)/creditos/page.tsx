import type { Metadata } from "next";
import { getServerSupabase } from "@/lib/supabase/server";
import { normalizarEmail } from "@/lib/auth/allowlist";
import { optionalEnv, requireEnv } from "@/lib/env";
import {
  lerSaldo,
  ultimaRecargaCentavos,
  mediaConsumoDiarioCentavos,
  extratoUsoPorCategoria,
  historicoRecargas,
  totalUsoServicoUltimosDias,
} from "@/lib/creditos";
import {
  avaliarCreditos,
  semaforoDoNivel,
  type CorSemaforo,
} from "@/lib/creditos/avaliacao";
import { custoRealAnthropicPorDia } from "@/lib/integrations/anthropic-admin";
import { formatarMoeda, formatarData } from "@/lib/formato";
import { CopiarPix } from "./copiar-pix";
import { RegistrarRecarga } from "./recarga-form";
import { GraficoConsumoReal } from "./grafico-consumo";

export const metadata: Metadata = { title: "Créditos — Copiloto Naccarato" };

// Dado sempre fresco: o saldo reflete o estado atual a cada acesso.
export const dynamic = "force-dynamic";

const SEMAFORO: Record<CorSemaforo, { ponto: string; texto: string; rotulo: string }> = {
  verde: { ponto: "bg-emerald-500", texto: "text-emerald-700", rotulo: "Tranquilo" },
  amarelo: { ponto: "bg-amber-500", texto: "text-amber-700", rotulo: "Atenção" },
  vermelho: { ponto: "bg-marca-vinho", texto: "text-marca-vinho", rotulo: "Baixo" },
};

const ROTULO_SERVICO: Record<string, string> = {
  anthropic: "IA (Anthropic)",
  whatsapp: "WhatsApp",
};

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-marca-nevoa bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-marca-grafite">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default async function CreditosPage() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = normalizarEmail(user?.email ?? "");
  const ehJoao = email === normalizarEmail(requireEnv("EMAIL_JOAO"));
  const ehAdriana = email === normalizarEmail(requireEnv("EMAIL_ADRIANA"));

  const [saldo, ultima, media, extrato, recargas] = await Promise.all([
    lerSaldo(),
    ultimaRecargaCentavos(),
    mediaConsumoDiarioCentavos(7),
    extratoUsoPorCategoria(),
    historicoRecargas(20),
  ]);

  const pixChave = optionalEnv("PIX_CHAVE_JOAO");
  const avaliacao = avaliarCreditos({
    saldoCentavos: saldo.saldoCentavos,
    ultimaRecargaCentavos: ultima,
    mediaDiariaCentavos: media,
    pixChave: pixChave || null,
  });
  const cor = SEMAFORO[semaforoDoNivel(avaliacao.nivel)];

  // Consumo real (só o João, e só se a Admin API estiver configurada).
  const consumoReal = ehJoao
    ? await custoRealAnthropicPorDia(30)
    : { estado: "indisponivel" as const };
  const estimadoIa30 =
    consumoReal.estado === "ok" ? await totalUsoServicoUltimosDias("anthropic", 30) : 0;

  const totalUsado = extrato.reduce((s, e) => s + e.totalCentavos, 0);
  const fraseDias =
    avaliacao.diasRestantes !== null
      ? `Dá pra aproximadamente ${avaliacao.diasRestantes} ${avaliacao.diasRestantes === 1 ? "dia" : "dias"} no ritmo atual.`
      : "Sem consumo suficiente ainda pra estimar os dias.";

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-marca-grafite">Créditos</h1>
        <p className="mt-1 text-sm text-marca-texto">
          Medidor de transparência do custo do copiloto.
        </p>
      </div>

      {/* ===== Saldo em destaque, com semáforo (ambos) ===== */}
      <div className="rounded-xl border border-marca-nevoa bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${cor.ponto}`}
            aria-hidden
          />
          <span className={`text-xs font-medium ${cor.texto}`}>{cor.rotulo}</span>
        </div>
        <p
          className={`mt-2 text-4xl font-semibold tabular-nums ${
            saldo.saldoCentavos < 0 ? "text-marca-vinho" : "text-marca-grafite"
          }`}
        >
          {formatarMoeda(saldo.saldoCentavos / 100)}
        </p>
        <p className="mt-1 text-sm text-marca-texto">{fraseDias}</p>
        {/* Frase tranquilizadora (ambos) */}
        <p className="mt-3 rounded-lg bg-marca-creme p-3 text-xs text-marca-texto">
          Fica tranquila: o serviço <strong>não para</strong> se o saldo acabar. O
          copiloto continua respondendo e enviando tudo normalmente — isto aqui é só pra
          você acompanhar o gasto e saber quando vale a pena recarregar.
        </p>
      </div>

      {/* ===== Extrato de uso por categoria (ambos) ===== */}
      <Bloco titulo="Uso por categoria">
        {totalUsado === 0 ? (
          <p className="text-sm text-marca-texto/70">Nenhum consumo registrado ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-marca-texto/70">
              <tr>
                <th className="py-1 font-medium">Categoria</th>
                <th className="py-1 font-medium">Eventos</th>
                <th className="py-1 text-right font-medium">Gasto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-marca-nevoa">
              {extrato.map((e) => (
                <tr key={e.servico}>
                  <td className="py-2 text-marca-grafite">
                    {ROTULO_SERVICO[e.servico] ?? e.servico}
                  </td>
                  <td className="py-2 tabular-nums text-marca-texto">{e.eventos}</td>
                  <td className="py-2 text-right tabular-nums text-marca-grafite">
                    {formatarMoeda(e.totalCentavos / 100)}
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 text-marca-grafite">Total</td>
                <td className="py-2" />
                <td className="py-2 text-right tabular-nums text-marca-grafite">
                  {formatarMoeda(totalUsado / 100)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Bloco>

      {/* ===== Histórico de recargas (ambos) ===== */}
      <Bloco titulo="Histórico de recargas">
        {recargas.length === 0 ? (
          <p className="text-sm text-marca-texto/70">Nenhuma recarga registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-marca-nevoa">
            {recargas.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium tabular-nums text-marca-grafite">
                    {formatarMoeda(r.valorCentavos / 100)}
                  </span>
                  {r.observacao ? (
                    <span className="ml-2 text-marca-texto">{r.observacao}</span>
                  ) : null}
                </div>
                <span className="text-xs text-marca-texto/70">
                  {formatarData(r.criadoEm)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      {/* ===== Adicionar créditos — só a Adriana ===== */}
      {ehAdriana ? (
        <Bloco titulo="Adicionar créditos">
          {pixChave ? (
            <>
              <p className="text-xs text-marca-texto">
                Faça um Pix para o João usando a chave abaixo:
              </p>
              <div className="mt-3">
                <CopiarPix chave={pixChave} />
              </div>
              <p className="mt-3 text-xs text-marca-texto/70">
                Depois de enviar, o valor aparece aqui assim que for confirmado.
              </p>
            </>
          ) : (
            <p className="text-sm text-marca-texto/70">
              Chave Pix não configurada (defina PIX_CHAVE_JOAO no ambiente).
            </p>
          )}
        </Bloco>
      ) : null}

      {/* ===== Registrar recarga — só o João ===== */}
      {ehJoao ? (
        <Bloco titulo="Recarga recebida">
          <p className="text-xs text-marca-texto/70">
            Some ao saldo um Pix que você confirmou ter recebido.
          </p>
          <div className="mt-3">
            <RegistrarRecarga />
          </div>
        </Bloco>
      ) : null}

      {/* ===== Consumo real de IA (só o João, se a Admin API existir) ===== */}
      {ehJoao && consumoReal.estado !== "indisponivel" ? (
        <Bloco titulo="Consumo real de IA — últimos 30 dias">
          {consumoReal.estado === "erro" ? (
            <p className="text-sm text-marca-texto/70">
              Não foi possível carregar o consumo real da Anthropic agora.
            </p>
          ) : (
            <GraficoConsumoReal
              dias={consumoReal.dias}
              totalCentavosUsd={consumoReal.totalCentavosUsd}
              estimadoBrlCentavos={estimadoIa30}
            />
          )}
        </Bloco>
      ) : null}
    </section>
  );
}
