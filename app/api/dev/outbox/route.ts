import { NextResponse } from "next/server";
import { getOutbox } from "@/lib/resend/send";

export const runtime = "nodejs";

/** Caixa de saída local, disponível apenas fora de produção. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ data: null, error: { code: "NOT_FOUND", message: "Recurso não encontrado" } }, { status: 404 });
  }
  return NextResponse.json({
    data: getOutbox().slice(0, 20),
    error: null,
  });
}
