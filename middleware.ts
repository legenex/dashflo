import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate: presence of the session cookie decides redirects.
// Every server page re-validates the session cryptographically via auth().

const PUBLIC_PREFIXES = [
  "/login",
  "/docs",
  "/api/auth",
  "/api/ingest",
  "/api/v1",
  "/api/mock",
  "/_next",
  "/favicon",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (!hasSession) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
