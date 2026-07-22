import { z } from "zod";

// Client da API do Asana (tarefas da equipe). Credenciais: ASANA_ACCESS_TOKEN
// e ASANA_PROJETO_ID (veja .env.example).

const respostaTaskSchema = z.object({
  data: z.object({
    gid: z.string().min(1),
    permalink_url: z.string().nullish(),
  }),
});

export type TaskAsanaCriada = {
  gid: string;
  url: string | null;
};

export async function criarTaskAsana(titulo: string, descricao: string): Promise<TaskAsanaCriada> {
  const token = process.env.ASANA_ACCESS_TOKEN;
  const projetoId = process.env.ASANA_PROJETO_ID;
  if (!token || !projetoId) {
    throw new Error(
      "ASANA_ACCESS_TOKEN e ASANA_PROJETO_ID precisam estar definidas (veja .env.example)"
    );
  }
  const resposta = await fetch("https://app.asana.com/api/1.0/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      data: { name: titulo, notes: descricao, projects: [projetoId] },
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Asana retornou HTTP ${resposta.status} ao criar task`);
  }
  const corpo: unknown = await resposta.json();
  const task = respostaTaskSchema.safeParse(corpo);
  if (!task.success) {
    throw new Error("Resposta inesperada do Asana ao criar task");
  }
  return { gid: task.data.data.gid, url: task.data.data.permalink_url ?? null };
}
