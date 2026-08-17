"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Registrar recarga recebida" (só o João): um botão que abre o campo de valor
 * e confirma via POST /api/creditos/recarga. A rota reconfere a autorização no
 * servidor (checa EMAIL_JOAO), então o botão é só conveniência de UI.
 */
export function RegistrarRecarga() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    const valorReais = Number(valor.replace(",", "."));
    if (!Number.isFinite(valorReais) || valorReais <= 0) {
      setErro("Informe um valor em reais maior que zero.");
      return;
    }

    setEnviando(true);
    try {
      const resp = await fetch("/api/creditos/recarga", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          valor_reais: valorReais,
          observacao: observacao.trim() || undefined,
        }),
      });
      const corpo = (await resp.json()) as { erro?: string };
      if (!resp.ok) {
        setErro(corpo.erro ?? "Não foi possível registrar a recarga.");
        return;
      }
      setOk("Recarga registrada e somada ao saldo.");
      setValor("");
      setObservacao("");
      router.refresh(); // reflete o novo saldo e o histórico na tela
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          setOk(null);
        }}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Registrar recarga recebida
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="valor" className="block text-sm font-medium text-slate-700">
          Valor recebido (R$)
        </label>
        <input
          id="valor"
          name="valor"
          inputMode="decimal"
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Ex: 100,00"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="observacao" className="block text-sm font-medium text-slate-700">
          Observação (opcional)
        </label>
        <input
          id="observacao"
          name="observacao"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Ex: Pix recebido dia 10"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      {erro !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      ) : null}
      {ok !== null ? (
        <p role="status" className="text-sm text-emerald-700">
          {ok}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {enviando ? "Registrando…" : "Confirmar recarga"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
