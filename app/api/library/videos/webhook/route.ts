import { createHmac, timingSafeEqual } from "node:crypto";
import { applyVideoWebhook } from "@/lib/services/library.service";

export const runtime = "nodejs";

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  // Sem segredo configurado (modo demonstração), aceita o payload local.
  if (!secret) return true;
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => part.split("=") as [string, string]),
  );
  if (!parts.t || !parts.v1) return false;

  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const received = Buffer.from(parts.v1);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("mux-signature");

  if (!verifySignature(rawBody, signature)) {
    return Response.json(
      { data: null, error: { code: "UNAUTHORIZED", message: "Assinatura inválida" } },
      { status: 401 },
    );
  }

  try {
    const payload = JSON.parse(rawBody) as {
      type?: string;
      provider_video_id?: string;
      data?: {
        id?: string;
        playback_ids?: Array<{ id: string }>;
        duration?: number;
        thumbnail_url?: string;
        status?: string;
      };
    };

    const providerVideoId = payload.provider_video_id ?? payload.data?.id;
    if (providerVideoId && payload.type) {
      const status =
        payload.type === "video.asset.ready"
          ? "ready"
          : payload.type === "video.asset.errored"
            ? "error"
            : payload.data?.status === "ready"
              ? "ready"
              : "processing";
      applyVideoWebhook(providerVideoId, status, {
        duration_seconds: payload.data?.duration ?? null,
        thumbnail_url: payload.data?.thumbnail_url ?? null,
      });
    }
    return Response.json({ data: { received: true }, error: null });
  } catch {
    // Sempre responde 200 para evitar retentativas infinitas do provedor.
    return Response.json({ data: { received: true }, error: null });
  }
}
