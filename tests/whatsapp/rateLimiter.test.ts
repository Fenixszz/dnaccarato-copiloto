import { describe, it, expect } from "vitest";
import { RateLimiter } from "@/lib/whatsapp/rateLimiter";

/** Cria um limiter com relógio e dormir controlados (sem esperar de verdade). */
function limiterFake(minMs: number) {
  const esperas: number[] = [];
  let now = 1_000_000;
  const rl = new RateLimiter({
    minMs,
    agora: () => now,
    dormir: (ms) => {
      esperas.push(ms);
      now += ms; // "passa o tempo" ao esperar
      return Promise.resolve();
    },
  });
  return { rl, esperas };
}

describe("RateLimiter", () => {
  it("executa as tarefas em ordem (serial)", async () => {
    const { rl } = limiterFake(3000);
    const ordem: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) =>
        rl.agendar(async () => {
          ordem.push(n);
          return n;
        }),
      ),
    );
    expect(ordem).toEqual([1, 2, 3]);
  });

  it("espera pelo menos o intervalo mínimo entre envios (não em rajada)", async () => {
    const { rl, esperas } = limiterFake(3000);
    await rl.agendar(async () => 1);
    await rl.agendar(async () => 2);
    await rl.agendar(async () => 3);
    // primeiro envio não espera; os seguintes esperam >= minMs.
    expect(esperas).toHaveLength(2);
    expect(esperas.every((w) => w >= 3000)).toBe(true);
  });

  it("devolve o resultado da tarefa", async () => {
    const { rl } = limiterFake(0);
    await expect(rl.agendar(async () => 42)).resolves.toBe(42);
  });

  it("uma tarefa que falha não trava a fila", async () => {
    const { rl } = limiterFake(0);
    await expect(rl.agendar(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(rl.agendar(async () => "ok")).resolves.toBe("ok");
  });
});
