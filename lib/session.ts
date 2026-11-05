import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session cookie for the password gate. The value is
 * `<expiry-ms>.<hmac>`, keyed by the gate password itself, so rotating
 * BASIC_AUTH_PASSWORD signs everyone out. No database, no session table.
 */

export const SESSION_COOKIE = "myna_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

function credentials() {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  return user && password ? { user, password } : null;
}

/** True when the gate is switched on (both env vars set). */
export function gateEnabled(): boolean {
  return credentials() !== null;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Teammates' logins, in addition to the owner's: EXTRA_LOGINS="name:pass;name2:pass2".
 * Everyone sees the same shop; sessions are signed with the owner's password.
 */
function extraLogins(): { user: string; password: string }[] {
  return (process.env.EXTRA_LOGINS ?? "")
    .split(";")
    .map((pair) => {
      const i = pair.indexOf(":");
      return i > 0 ? { user: pair.slice(0, i).trim(), password: pair.slice(i + 1).trim() } : null;
    })
    .filter((x): x is { user: string; password: string } => Boolean(x?.user && x.password));
}

/** Compare both halves of every login regardless, so a wrong username costs the same time. */
export function checkCredentials(user: string, password: string): boolean {
  const creds = credentials();
  if (!creds) return false;
  let ok = false;
  for (const login of [creds, ...extraLogins()]) {
    const userOk = safeEqual(user, login.user);
    const passOk = safeEqual(password, login.password);
    ok ||= userOk && passOk;
  }
  return ok;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string | null {
  const creds = credentials();
  if (!creds) return null;
  const expires = String(now + SESSION_MAX_AGE * 1000);
  return `${expires}.${sign(expires, creds.password)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const creds = credentials();
  if (!creds || !token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expires = token.slice(0, dot);
  if (!/^\d+$/.test(expires) || Number(expires) < now) return false;
  return safeEqual(token.slice(dot + 1), sign(expires, creds.password));
}

/** Only same-origin paths are allowed as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/inbox";
  }
  return next;
}
