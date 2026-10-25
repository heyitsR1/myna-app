import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic auth over the whole app, so the deployed demo is private.
 *
 * Deliberately NOT applied to (see `matcher` below):
 *  - `/api/webhooks/*` — Meta must reach it unauthenticated; that route
 *    authenticates every request by HMAC instead (X-Hub-Signature-256).
 *  - `/privacy` and `/data-deletion` — Meta's App Review team must be able
 *    to open these without credentials.
 *
 * With BASIC_AUTH_USER / BASIC_AUTH_PASSWORD unset the gate is off, which
 * keeps local `next dev` friction-free.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Myna", charset="UTF-8"' },
  });
}

export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf-8");
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return unauthorized();

  // Compare both halves regardless, so a wrong username costs the same time.
  const userOk = safeEqual(decoded.slice(0, separator), user);
  const passOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk ? NextResponse.next() : unauthorized();
}

export const config = {
  matcher: [
    "/((?!api/webhooks|privacy|data-deletion|_next/static|_next/image|favicon.ico).*)",
  ],
};
