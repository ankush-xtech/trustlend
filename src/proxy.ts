import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic routing only: unauthenticated visitors to portal pages are sent to the login page.
 * This is NOT the security boundary — every page, Server Action and Route Handler re-validates the
 * session and permissions on the server (see src/server/auth/current.ts and the services).
 */
const PROTECTED = /^\/(customer|agent|staff|admin)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const hasSession = request.cookies.has("__Host-tl_session") || request.cookies.has("tl_session");

  if (PROTECTED.test(pathname) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
