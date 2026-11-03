import { NextResponse } from "next/server";
import {
  resolvePlaybackTarget,
  verifyPlaybackToken,
} from "@/lib/services/playback-token.service";
import { jsonError, route } from "@/lib/middleware/errors";

export const runtime = "nodejs";

/**
 * Valida o token de reprodução e redireciona para o preview do Google Drive.
 * O token é a credencial efêmera; links expirados deixam de funcionar.
 */
export const GET = route<{ token: string }>(async (_request, context) => {
  const { token } = await context.params;
  const payload = verifyPlaybackToken(token);
  if (!payload) {
    return jsonError(410, "GONE", "Este link de reprodução expirou");
  }
  return NextResponse.redirect(resolvePlaybackTarget(payload), 302);
});
