"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { MensagemChat } from "@/lib/integrations/anthropic";

/**
 * Chat full-screen do widget, conectado ao backend (/api/widget/chat), que fala
 * com a Anthropic + MCP no servidor — a API key NUNCA chega aqui. O histórico é
 * do usuário logado (vem via SSR em `historicoInicial`).
 *
 * Estados: histórico, "digitando…" enquanto responde, erro por mensagem, e
 * aviso quando não há sessão (o chat exige login pra guardar o histórico).
 */

interface Mensagem extends MensagemChat {
  id: string;
}

const SAUDACAO: Mensagem = {
  id: "saudacao",
  autor: "assistente",
  texto: "Olá! Como podemos ajudar?",
};

export function ChatWidget({
  autenticado,
  historicoInicial,
}: {
  autenticado: boolean;
  historicoInicial: MensagemChat[];
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(() =>
    historicoInicial.length > 0
      ? historicoInicial.map((m, i) => ({ ...m, id: `h${i}` }))
      : [SAUDACAO],
  );
  const [rascunho, setRascunho] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const contadorRef = useRef(0);

  function novoId(): string {
    contadorRef.current += 1;
    return `m${contadorRef.current}`;
  }

  // Mantém a conversa rolada até o fim (e enquanto "digita").
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  async function enviar(): Promise<void> {
    const texto = rascunho.trim();
    if (texto === "" || enviando) return;
    setErro(null);

    setMensagens((atual) => [...atual, { id: novoId(), autor: "usuario", texto }]);
    setRascunho("");
    setEnviando(true);
    try {
      const resp = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensagem: texto }),
      });
      const corpo = (await resp.json()) as { resposta?: string; erro?: string };
      if (!resp.ok) {
        setErro(corpo.erro ?? "Não foi possível enviar agora.");
        return;
      }
      setMensagens((atual) => [
        ...atual,
        { id: novoId(), autor: "assistente", texto: corpo.resposta ?? "" },
      ]);
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      void enviar();
    }
  }

  const podeEnviar = autenticado && rascunho.trim() !== "" && !enviando;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-marca-nevoa bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <Image
            src="/marca/an-monograma.png"
            alt="Adriana Naccarato"
            width={28}
            height={28}
            className="h-6 w-6 object-contain"
            priority
          />
          <h1 className="text-sm font-semibold text-marca-grafite">Atendimento</h1>
        </div>
      </header>

      {/* Histórico (canvas creme herdado do layout) */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ul
          className="mx-auto flex max-w-2xl flex-col gap-3"
          aria-live="polite"
          aria-label="Histórico da conversa"
        >
          {mensagens.map((mensagem) => (
            <li
              key={mensagem.id}
              className={mensagem.autor === "usuario" ? "self-end" : "self-start"}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${
                  mensagem.autor === "usuario"
                    ? "bg-marca-caramelo text-white"
                    : "border border-marca-nevoa bg-white text-marca-grafite"
                }`}
              >
                {mensagem.texto}
              </div>
            </li>
          ))}

          {enviando ? (
            <li className="self-start" aria-hidden>
              <div className="rounded-2xl border border-marca-nevoa bg-white px-4 py-2 text-sm text-marca-texto/70">
                digitando…
              </div>
            </li>
          ) : null}
        </ul>
        <div ref={fimRef} />
      </div>

      {/* Aviso de sessão + erro por mensagem */}
      {!autenticado ? (
        <p className="mx-auto max-w-2xl px-4 pb-1 text-center text-xs text-marca-texto/70">
          Entre para conversar e manter seu histórico.
        </p>
      ) : null}
      {erro !== null ? (
        <p
          role="alert"
          className="mx-auto max-w-2xl px-4 pb-1 text-center text-xs text-marca-vinho"
        >
          {erro}
        </p>
      ) : null}

      {/* Campo de texto */}
      <form
        className="shrink-0 border-t border-marca-nevoa bg-white px-4 py-3"
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar();
        }}
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={rascunho}
            onChange={(evento) => setRascunho(evento.target.value)}
            onKeyDown={aoTeclar}
            rows={1}
            disabled={!autenticado}
            placeholder={autenticado ? "Escreva sua mensagem…" : "Entre para conversar…"}
            aria-label="Sua mensagem"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-marca-areia px-3 py-2 text-sm shadow-sm outline-none transition focus:border-marca-caramelo disabled:bg-marca-creme"
          />
          <button
            type="submit"
            disabled={!podeEnviar}
            className="h-10 shrink-0 rounded-lg bg-marca-caramelo px-4 text-sm font-medium text-white transition-colors hover:bg-marca-caramelo-escuro disabled:opacity-50"
          >
            Enviar
          </button>
        </div>

        {/* Aviso de privacidade (LGPD): transparência sobre uso dos dados e
            direito de eliminação. Neutro/white-label, como o resto do widget. */}
        <details className="mx-auto mt-2 max-w-2xl px-1 text-xs text-marca-texto/70">
          <summary className="cursor-pointer select-none hover:text-marca-caramelo">
            Aviso de privacidade
          </summary>
          <p className="mt-1 leading-relaxed">
            Suas mensagens são usadas apenas para o atendimento e ficam associadas à sua
            conta. Não compartilhamos seus dados com terceiros para fins de marketing.
            Você pode solicitar a qualquer momento o acesso ou a exclusão completa dos
            seus dados escrevendo para o atendimento — atenderemos conforme a LGPD,
            preservando apenas os registros que a lei exige manter (ex.: financeiros e
            documentos assinados).
          </p>
        </details>
      </form>
    </div>
  );
}
