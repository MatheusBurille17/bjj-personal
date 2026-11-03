import { muxRequest } from "./client";

interface MuxUploadResponse {
  data: {
    id: string;
    url: string;
    timeout: number;
  };
}

/**
 * Cria um direct upload na Mux. No modo demo retorna uma URL local fictícia
 * para que o fluxo de cadastro de vídeo continue funcional.
 */
export async function createDirectUpload(): Promise<{
  upload_id: string;
  upload_url: string;
  demo: boolean;
}> {
  const response = await muxRequest<MuxUploadResponse>("/video/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      new_asset_settings: { playback_policy: ["signed"], mp4_support: "standard" },
      timeout: 86400,
    }),
  });

  if (!response) {
    return {
      upload_id: `demo-upload-${Date.now()}`,
      upload_url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      demo: true,
    };
  }

  return {
    upload_id: response.data.id,
    upload_url: response.data.url,
    demo: false,
  };
}
