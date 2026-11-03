import { requireApiUser, route } from "@/lib/middleware/errors";
import { getVideoPlayback } from "@/lib/services/video-storage.service";
import { getClientIp } from "@/lib/middleware/rate-limit";
import { toApiError } from "@/lib/google-drive-errors";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GET = route<{ videoId: string }>(async (request, context) => {
  const session = await requireApiUser();
  const { videoId } = await context.params;
  const url = new URL(request.url);
  const width = Math.min(1920, Math.max(240, Number(url.searchParams.get("width")) || 960));
  const height = Math.min(1080, Math.max(160, Number(url.searchParams.get("height")) || 540));

  try {
    const result = await getVideoPlayback(
      videoId,
      session.user.id,
      session.activeRole,
      {
        ip: getClientIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    );
    const inner =
      result.provider === "google_drive"
        ? `<iframe src="${escapeHtml(result.playback_url)}" width="${width}" height="${height}" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>`
        : `<video src="${escapeHtml(result.playback_url)}" width="${width}" height="${height}" controls autoplay></video>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;height:100%}iframe,video{display:block;width:100%;height:100%;border:0}</style></head><body>${inner}</body></html>`;
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    const apiError = toApiError(error) as Error & { status?: number };
    return new Response(
      `<!doctype html><html lang="pt-BR"><body style="font-family:sans-serif;padding:24px"><p>${escapeHtml(apiError.message || "Vídeo indisponível")}</p></body></html>`,
      {
        status: apiError.status ?? 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  }
});
