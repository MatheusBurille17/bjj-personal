import { createClient } from "@supabase/supabase-js";
import { isValidImageSize, isValidImageType } from "@/lib/utils/validation";

const AVATARS_BUCKET = "avatars";

let adminClient: ReturnType<typeof createClient> | null = null;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

/**
 * Upload de avatar para o Supabase Storage (bucket `avatars`).
 *
 * O MVP local não utiliza este caminho; a função fica pronta para o ambiente
 * Supabase e mantém as mesmas validações da camada de serviço.
 */
export async function uploadAvatarToStorage(
  userId: string,
  file: File,
): Promise<{ path: string; publicUrl: string } | null> {
  if (!isValidImageType(file.type) || !isValidImageSize(file.size)) return null;

  const client = getAdminClient();
  if (!client) return null;

  const extension = file.type.split("/")[1] ?? "jpg";
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await client.storage
    .from(AVATARS_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });

  if (error) throw new Error(error.message);

  const { data } = client.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function deleteAvatarFromStorage(path: string): Promise<void> {
  const client = getAdminClient();
  if (!client || !path) return;
  await client.storage.from(AVATARS_BUCKET).remove([path]);
}

export { AVATARS_BUCKET };
