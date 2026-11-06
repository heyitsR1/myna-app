import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  checkCredentials,
  gateEnabled,
  verifySessionToken,
} from "@/lib/session";

/**
 * Password gate over the whole app, so the deployed demo is private.
 *
 * Two ways in:
 *  - the `myna_session` cookie set by the `/login` page (people), or
 *  - HTTP Basic auth (scripts: `curl -u myna:…`, `simulate-dm.mjs`, health).
 * Anyone else gets a redirect to `/login` for pages, or a plain 401 for
 * `/api/*`. No `WWW-Authenticate` header, so browsers never show their
 * native password dialog over the styled login page.
 *
 * Deliberately NOT applied to (see `matcher` below):
 *  - `/api/webhooks/*` — Meta must reach it unauthenticated; that route
 *    authenticates every request by HMAC instead (X-Hub-Signature-256).
 *  - `/try` — the public page behind the summit QR code.
 *  - `/privacy` and `/data-deletion` — Meta's App Review team must be able
 *    to open these without credentials.
 *  - `/login` and `/api/auth/*` — the way in.
 *  - `/manifest.webmanifest`, `/sw.js`, `/icons/*` — the installable app's
 *    shell. Browsers fetch the manifest without cookies, so gating it breaks
 *    "Add to Home Screen". None of them contain data.
 *
 * With BASIC_AUTH_USER / BASIC_AUTH_PASSWORD unset the gate is off, which
 * keeps local `next dev` friction-free.
 */

function basicAuthOk(header: string | null): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf-8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  return checkCredentials(decoded.slice(0, separator), decoded.slice(separator + 1));
}

/**
 * Phones get the phone app. The desktop inbox is a three-pane layout that
 * can't fold down to 390px, so a phone opening /inbox (an old bookmark, a
 * shared link) lands on /m/chats instead. `?desktop=1` opts out.
 */
function phoneRedirect(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/inbox" || searchParams.has("desktop")) return null;
  const mobileHint = request.headers.get("sec-ch-ua-mobile") === "?1";
  const ua = request.headers.get("user-agent") ?? "";
  if (!mobileHint && !/iPhone|iPod|Android.+Mobile/.test(ua)) return null;
  const c = searchParams.get("c");
  return NextResponse.redirect(new URL(c ? `/m/chats/${c}` : "/m/chats", request.url));
}

export function proxy(request: NextRequest) {
  const toPhone = phoneRedirect(request);
  if (toPhone) return toPhone;
  if (!gateEnabled()) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (basicAuthOk(request.headers.get("authorization"))) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!api/webhooks|api/auth|login|try|privacy|data-deletion|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
