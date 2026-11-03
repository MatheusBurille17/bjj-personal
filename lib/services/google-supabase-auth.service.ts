import { cookies } from "next/headers";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { ApiError } from "@/lib/middleware/errors";
import { createClient } from "@/lib/supabase/server";
import { mapPostgrestError } from "@/lib/supabase/errors";
import {
  createSessionCookie,
  getCurrentSession,
  getUserRoles,
} from "@/lib/auth/session";
import { sanitizeRedirectPath } from "@/lib/utils/url";
import { GoogleOAuthError, toApiError } from "@/lib/google-oauth-errors";
import { logOAuthAuditSupabase } from "./oauth-audit-supabase.service";
import {
  PROVIDER_TOKEN_TTL_SECONDS,
  hasExistingGoogleTokens,
  isSupabaseConfiguredForGoogle,
  storeProviderTokens,
} from "./google-supabase-token.service";

const GOOGLE_DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

/** Intent (next + connect) guardado em cookie durante o redirect OAuth. */
export const GOOGLE_OAUTH_INTENT_COOKIE = "bjj_google_intent";
const GOOGLE_OAUTH_INTENT_TTL_MS = 10 * 60 * 1000;

export interface GoogleOAuthIntent {
  next?: string;
  connect?: boolean;
  /** E-mail da conta logada no momento do "Conectar Google". */
  email?: string;
  /** ID da conta logada no momento do "Conectar Google". */
  userId?: string;
  created_at: number;
}

type Client = SupabaseClient<Database>;

export interface BeginSupabaseGoogleAuthorizationInput {
  request: Request;
  redirectPath?: string;
  connectMode?: boolean;
  /** Sobrescreve o callback padrão (usado pelas rotas legadas do Drive). */
  callbackPath?: string;
}

export interface CompleteSupabaseGoogleAuthorizationInput {
  code: string;
  connectMode?: boolean;
  /** E-mail esperado no modo connect (evita trocar de conta silenciosamente). */
  connectEmail?: string | null;
  /** ID esperado no modo connect. */
  connectUserId?: string | null;
  context?: { ip?: string | null; userAgent?: string | null };
}

export interface SupabaseGoogleAuthorizationResult {
  userId: string;
  isNewUser: boolean;
  isConnectMode: boolean;
  activeRole: "teacher" | "student";
}

/**
 * Escopos enviados ao Google pelo Supabase Auth.
 *
 * O padrão usa `drive.file` (recomendado) em vez do escopo restrito `drive`:
 * a aplicação só precisa dos arquivos que ela mesma cria no Drive.
 */
export function getSupabaseGoogleScopes(): string[] {
  const raw = process.env.GOOGLE_OAUTH_SCOPES?.trim();
  if (raw) return raw.split(/\s+/).filter(Boolean);
  return ["openid", "email", "profile", GOOGLE_DRIVE_FILE_SCOPE];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Base URL pública do app, com fallback para os headers do proxy (Vercel). */
export function resolveAppBaseUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (request) {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol =
      request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    if (host) return `${protocol}://${host}`;
    return new URL(request.url).origin;
  }

  return "http://localhost:3000";
}

export function buildGoogleCallbackUrl(
  input: Pick<
    BeginSupabaseGoogleAuthorizationInput,
    "request" | "callbackPath"
  >,
): string {
  return new URL(
    input.callbackPath ?? "/api/auth/google/callback",
    resolveAppBaseUrl(input.request),
  ).toString();
}

function cookieOptions() {
  return {
    httpOnly: true,
    // Lax é necessário para o cookie ser enviado na navegação de volta do
    // Supabase/Google (cross-site top-level).
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GOOGLE_OAUTH_INTENT_TTL_MS / 1000,
  };
}

function encodeIntent(intent: GoogleOAuthIntent): string {
  return Buffer.from(JSON.stringify(intent), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeIntent(value: string): GoogleOAuthIntent | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "=",
    );
    const parsed = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8"),
    ) as GoogleOAuthIntent;
    if (!parsed || typeof parsed.created_at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function storeGoogleOAuthIntent(intent: {
  next?: string;
  connect?: boolean;
  email?: string;
  userId?: string;
}): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    GOOGLE_OAUTH_INTENT_COOKIE,
    encodeIntent({ ...intent, created_at: Date.now() }),
    cookieOptions(),
  );
}

/** Lê e sempre limpa o intent (uso único, TTL de 10 minutos). */
export async function consumeGoogleOAuthIntent(): Promise<GoogleOAuthIntent | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GOOGLE_OAUTH_INTENT_COOKIE)?.value;
  cookieStore.set(GOOGLE_OAUTH_INTENT_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });

  if (!raw) return null;
  const intent = decodeIntent(raw);
  if (!intent) return null;
  if (Date.now() - intent.created_at > GOOGLE_OAUTH_INTENT_TTL_MS) return null;

  return {
    next: sanitizeRedirectPath(intent.next),
    connect: intent.connect === true,
    email:
      typeof intent.email === "string"
        ? intent.email.trim().toLowerCase()
        : undefined,
    userId:
      typeof intent.userId === "string" && intent.userId
        ? intent.userId
        : undefined,
    created_at: intent.created_at,
  };
}

function mapSupabaseAuthError(error: {
  message?: string;
  status?: number;
  code?: string;
}): GoogleOAuthError {
  const message = (error.message ?? "").toLowerCase();

  if (
    message.includes("provider is not enabled") ||
    message.includes("unsupported provider") ||
    message.includes("missing oauth secret")
  ) {
    return new GoogleOAuthError(
      "configuration_error",
      "Ative o provider Google no Supabase Auth (Authentication → Providers → Google) e informe o Client ID/Secret.",
      { httpStatus: error.status },
    );
  }

  if (
    message.includes("not allowed") ||
    message.includes("redirect url") ||
    message.includes("redirect_to")
  ) {
    return new GoogleOAuthError(
      "configuration_error",
      "Adicione a URL de callback do app às Redirect URLs do Supabase Auth.",
      { httpStatus: error.status },
    );
  }

  if (
    message.includes("invalid_client") ||
    message.includes("client secret") ||
    message.includes("client id")
  ) {
    return new GoogleOAuthError("invalid_client", undefined, {
      httpStatus: error.status,
    });
  }

  if (message.includes("invalid_scope") || message.includes("invalid scope")) {
    return new GoogleOAuthError("invalid_scope", undefined, {
      httpStatus: error.status,
    });
  }

  if (
    message.includes("flow state") ||
    message.includes("code verifier") ||
    message.includes("pkce")
  ) {
    return new GoogleOAuthError(
      "invalid_code",
      "A sessão de autorização expirou. Comece novamente.",
      { httpStatus: error.status },
    );
  }

  if (message.includes("access denied") || message.includes("denied")) {
    return new GoogleOAuthError("access_denied", undefined, {
      httpStatus: error.status,
    });
  }

  if (message.includes("invalid grant") || message.includes("invalid token")) {
    return new GoogleOAuthError("invalid_grant", undefined, {
      httpStatus: error.status,
    });
  }

  return new GoogleOAuthError(
    "server_error",
    error.message || undefined,
    { httpStatus: error.status },
  );
}

/**
 * Inicia o OAuth usando o provider Google do Supabase Auth.
 *
 * - login/cadastro e conectar à conta já autenticada: `signInWithOAuth`;
 * - no connect, o e-mail retornado é comparado com o da conta logada.
 */
export async function beginSupabaseGoogleAuthorization(
  input: BeginSupabaseGoogleAuthorizationInput,
): Promise<string> {
  if (!isSupabaseConfiguredForGoogle()) {
    throw new GoogleOAuthError(
      "configuration_error",
      "Supabase não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e a chave pública para usar o login com Google.",
    );
  }

  const supabase = await createClient();
  let connectEmail: string | undefined;
  let connectUserId: string | undefined;

  if (input.connectMode) {
    const session = await getCurrentSession();
    if (!session) {
      throw ApiError.unauthorized(
        "Faça login antes de conectar sua conta Google.",
      );
    }
    connectEmail = session.user.email.trim().toLowerCase();
    connectUserId = session.user.id;
  }

  // O `redirectTo` fica sem query string para casar exatamente com as Redirect
  // URLs cadastradas no Supabase. O destino é recuperado pelo cookie de intent.
  const redirectTo = buildGoogleCallbackUrl(input);
  await storeGoogleOAuthIntent({
    next: sanitizeRedirectPath(input.redirectPath),
    connect: input.connectMode === true,
    email: connectEmail,
    userId: connectUserId,
  });
  const options = {
    redirectTo,
    scopes: getSupabaseGoogleScopes().join(" "),
    queryParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  };

  // Usamos signInWithOAuth também no connect: o Supabase vincula a identidade
  // pelo e-mail e devolve provider_token/provider_refresh_token, diferente do
  // linkIdentity (que hoje não expõe os tokens do provider).
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options,
  });
  if (error) {
    console.error("[google-auth] signInWithOAuth falhou", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    throw mapSupabaseAuthError(error);
  }
  if (!data?.url) {
    throw new GoogleOAuthError(
      "configuration_error",
      "O Supabase não retornou a URL de autorização do Google.",
    );
  }
  return data.url;
}

function isFirstSignIn(user: User): boolean {
  const created = Date.parse(user.created_at ?? "");
  const last = Date.parse(user.last_sign_in_at ?? user.created_at ?? "");
  if (!Number.isFinite(created) || !Number.isFinite(last)) return false;
  return Math.abs(last - created) < 10_000;
}

async function ensureGoogleAccount(
  supabase: Client,
  user: User,
): Promise<{ isNewUser: boolean; role: "teacher" | "student" }> {
  const metadata = user.user_metadata ?? {};
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new GoogleOAuthError(
      "invalid_token",
      "O Google não retornou um e-mail para esta conta.",
    );
  }

  const fullName =
    firstString(metadata.full_name, metadata.name) ??
    email.split("@")[0] ??
    "Usuário";
  const avatarUrl =
    firstString(metadata.avatar_url, metadata.picture) ?? null;

  const existing = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing.error) throw mapPostgrestError(existing.error);

  const isNewUser = !existing.data;

  if (isNewUser) {
    const profile = await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName,
        email,
        avatar_url: avatarUrl,
      },
      { onConflict: "id" },
    );
    if (profile.error) throw mapPostgrestError(profile.error);

    // Novos usuários do Google entram como professores, o mesmo papel padrão
    // do cadastro por e-mail (os vínculos de aluno vêm por convite).
    if (isFirstSignIn(user)) {
      const teacher = await supabase.from("teachers").upsert(
        {
          id: user.id,
          display_name: fullName,
          timezone: "America/Sao_Paulo",
          bio: null,
        },
        { onConflict: "id" },
      );
      if (teacher.error) throw mapPostgrestError(teacher.error);

      try {
        await supabase.auth.updateUser({
          data: {
            full_name: fullName,
            avatar_url: avatarUrl,
            signup_role: "teacher",
          },
        });
      } catch (error) {
        console.warn("[google-auth] falha ao atualizar metadados do usuário", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const roles = await getUserRoles(user.id, supabase);
  if (roles.is_teacher) return { isNewUser, role: "teacher" };
  if (roles.is_student) return { isNewUser, role: "student" };

  throw ApiError.forbidden(
    "Sua conta ainda não possui um vínculo ativo. Aceite o convite do seu professor para acessar o portal.",
  );
}

async function persistProviderTokens(
  user: User,
  session: Session | null,
): Promise<boolean> {
  const accessToken = session?.provider_token;
  if (!accessToken) {
    // Pode acontecer em reautorizações. Se já existem tokens válidos, seguimos
    // com eles; caso contrário, o Drive não pode ser considerado conectado.
    const preserved = await hasExistingGoogleTokens(user.id).catch(() => false);
    console.warn(
      preserved
        ? "[google-auth] Supabase não retornou provider_token; os tokens do Drive foram preservados."
        : "[google-auth] Supabase não retornou provider_token e não há tokens anteriores do Drive.",
    );
    return preserved;
  }

  const metadata = user.user_metadata ?? {};
  const identity = user.identities?.find(
    (item) => item.provider === "google",
  );
  const identityData = (identity?.identity_data ?? {}) as Record<
    string,
    unknown
  >;
  const email = (user.email ?? "").trim().toLowerCase();
  const googleId =
    firstString(identityData.sub, metadata.sub) ?? user.id;
  const name =
    firstString(metadata.full_name, metadata.name) ??
    email.split("@")[0] ??
    "Usuário Google";
  const pictureUrl =
    firstString(metadata.avatar_url, metadata.picture) ?? null;

  await storeProviderTokens({
    userId: user.id,
    accessToken,
    refreshToken: session?.provider_refresh_token ?? null,
    expiresIn: PROVIDER_TOKEN_TTL_SECONDS,
    scope: getSupabaseGoogleScopes().join(" "),
    googleId,
    email,
    name,
    pictureUrl,
  });
  return true;
}

/**
 * Conclui o callback do Supabase Auth: troca o code por sessão, garante o
 * perfil/professor e persiste os tokens do provider para o Google Drive.
 */
export async function completeSupabaseGoogleAuthorization(
  input: CompleteSupabaseGoogleAuthorizationInput,
): Promise<SupabaseGoogleAuthorizationResult> {
  if (!isSupabaseConfiguredForGoogle()) {
    throw new GoogleOAuthError(
      "configuration_error",
      "Supabase não está configurado. Defina NEXT_PUBLIC_SUPABASE_URL e a chave pública para concluir o login com Google.",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    input.code,
  );
  if (error) throw mapSupabaseAuthError(error);

  const user = data.user;
  if (!user) {
    throw new GoogleOAuthError(
      "invalid_code",
      "O Google não retornou um usuário válido.",
    );
  }

  // O connect usa signInWithOAuth (para receber os tokens do provider). Se a
  // conta Google tiver outro e-mail/usuário, encerra a sessão trocada e informa
  // o erro em vez de vincular os tokens à conta errada.
  if (input.connectMode) {
    const email = (user.email ?? "").trim().toLowerCase();
    const emailMismatch =
      input.connectEmail &&
      email !== input.connectEmail.trim().toLowerCase();
    const userMismatch =
      input.connectUserId && user.id !== input.connectUserId;

    if (emailMismatch || userMismatch) {
      await supabase.auth.signOut();
      throw new ApiError(
        409,
        "CONFLICT",
        "O e-mail da conta Google não corresponde ao e-mail da sua conta.",
        { error: "email_mismatch_on_connect" },
      );
    }
  }

  const { isNewUser, role } = await ensureGoogleAccount(supabase, user);

  // Mantém o cookie de visão ativa (professor/aluno) usado pela navegação.
  await createSessionCookie(user.id, role);

  let tokensPersisted = false;
  try {
    tokensPersisted = await persistProviderTokens(user, data.session);
  } catch (tokenError) {
    tokensPersisted = false;
    console.warn("[google-auth] falha ao persistir tokens do Google", {
      user_id: user.id,
      message:
        tokenError instanceof Error ? tokenError.message : String(tokenError),
    });
  }

  // No connect o objetivo é justamente habilitar o Drive; sem tokens, falhe de
  // forma explícita em vez de mostrar "conectado".
  if (input.connectMode && !tokensPersisted) {
    await logOAuthAuditSupabase({
      event: "google_connected",
      userId: user.id,
      success: false,
      ip: input.context?.ip,
      userAgent: input.context?.userAgent,
      metadata: { reason: "token_storage_failed", connect_mode: true },
    });
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Não foi possível salvar os tokens do Google. Tente novamente.",
      { error: "token_storage_failed" },
    );
  }

  await logOAuthAuditSupabase({
    event: input.connectMode
      ? "google_connected"
      : isNewUser
        ? "google_signup"
        : "google_login",
    userId: user.id,
    success: true,
    ip: input.context?.ip,
    userAgent: input.context?.userAgent,
    metadata: {
      is_new_user: isNewUser,
      connect_mode: input.connectMode === true,
      tokens_persisted: tokensPersisted,
    },
  });

  return {
    userId: user.id,
    isNewUser,
    isConnectMode: input.connectMode === true,
    activeRole: role,
  };
}

export { toApiError };
