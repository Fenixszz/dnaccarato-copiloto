import { NextResponse } from "next/server";

// Endpoint do servidor MCP. As tools (consultas e ações do copiloto) entram na
// fase do MCP; toda tool de escrita gravará na tabela de auditoria.
export function POST() {
  return NextResponse.json(
    { erro: "Servidor MCP ainda não implementado" },
    { status: 501 }
  );
}
