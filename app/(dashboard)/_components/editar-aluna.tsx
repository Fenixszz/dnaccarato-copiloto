"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Edição inline de contato da aluna (nome / e-mail / telefone) no dossiê.
 * Chama PATCH /api/alunas/[id] e recarrega os dados no sucesso. Tem estado de
 * salvando e de erro (CLAUDE.md: toda tela tem loading e erro).
 */
export function EditarAluna({
  aluna,
}: {
  aluna: { id: string; nome: string; email: string | null; telefone: string | null };
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(aluna.nome);
  const [email, setEmail] = useState(aluna.email ?? "");
  const [telefone, setTelefone] = useState(aluna.telefone ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setNome(aluna.nome);
    setEmail(aluna.email ?? "");
    setTelefone(aluna.telefone ?? "");
    setErro(null);
    setAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch(`/api/alunas/${aluna.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, telefone }),
      });
      const corpo = (await resp.json().catch(() => ({}))) as { erro?: string };
      if (!resp.ok) {
        setErro(corpo.erro ?? "Não foi possível salvar.");
        return;
      }
      setAberto(false);
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="rounded-lg border border-marca-areia px-3 py-1.5 text-sm font-medium text-marca-grafite transition-colors hover:bg-marca-nevoa"
      >
        Editar
      </button>
    );
  }

  return (
    <form
      onSubmit={salvar}
      className="mt-3 rounded-xl border border-marca-nevoa bg-white p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-marca-texto">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-marca-areia px-3 py-2 text-sm text-marca-grafite focus:border-marca-caramelo focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-marca-texto">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sem e-mail"
            className="mt-1 w-full rounded-lg border border-marca-areia px-3 py-2 text-sm text-marca-grafite focus:border-marca-caramelo focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-marca-texto">
          Telefone
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="sem telefone"
            className="mt-1 w-full rounded-lg border border-marca-areia px-3 py-2 text-sm text-marca-grafite focus:border-marca-caramelo focus:outline-none"
          />
        </label>
      </div>

      {erro ? <p className="mt-3 text-sm text-marca-vinho">{erro}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-lg bg-marca-caramelo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-caramelo-escuro disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          disabled={salvando}
          className="rounded-lg border border-marca-areia px-4 py-2 text-sm font-medium text-marca-grafite transition-colors hover:bg-marca-nevoa"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
