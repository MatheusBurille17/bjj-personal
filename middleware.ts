import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ACTIVE_ROLE_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PAGES = ["/login", "/signup", "/recover", "/reset-password"];
const TEACHER_PREFIXES = ["/dashboard", "/students", "/plans", "/schedule", "/library", "/settings"];
const STUDENT_PREFIXES = ["/portal"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return false;
  if (PUBLIC_PAGES.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
  if (pathname.startsWith("/invite/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  // O token efêmero é a credencial da URL de reprodução embutida.
  if (pathname.startsWith("/api/google-drive/embed/")) return true;
  if (pathname === "/api/library/videos/webhook") return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/dev/")) return true;
  return false;
}

function homeFor(role: string | undefined): string {
  return role === "student" ? "/portal" : "/dashboard";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publicKey) {
    return NextResponse.next();
  }

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Valida/renova a sessão. Não troque por getSession(): getUser() valida no servidor.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activeRole = request.cookies.get(ACTIVE_ROLE_COOKIE)?.value;

  if (isPublic(pathname)) {
    if (user && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL(homeFor(activeRole), request.url));
    }
    return response;
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { data: null, error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isTeacherPath = TEACHER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isStudentPath = STUDENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // O cookie é apenas uma dica de navegação; a autorização real é revalidada
  // nos layouts e em cada rota/servidor.
  if (activeRole) {
    if (isTeacherPath && activeRole !== "teacher") {
      return NextResponse.redirect(new URL("/portal", request.url));
    }
    if (isStudentPath && activeRole !== "student") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(homeFor(activeRole), request.url));
  }

  return response;
}

export const config = {
  // Uploads grandes não passam pelo middleware: o limite de corpo do
  // middleware (10MB) truncaria arquivos de vídeo. A autenticação é feita
  // dentro das próprias rotas de upload.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/videos/upload|api/google-drive/upload).*)",
  ],
};
