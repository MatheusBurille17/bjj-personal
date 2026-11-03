import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (isPublic(pathname)) {
    // Usuário autenticado não precisa ver login/cadastro; recuperação continua acessível.
    if (session && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL(session.role === "teacher" ? "/dashboard" : "/portal", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
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

  if (isTeacherPath && session.role !== "teacher") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }
  if (isStudentPath && session.role !== "student") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(session.role === "teacher" ? "/dashboard" : "/portal", request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
