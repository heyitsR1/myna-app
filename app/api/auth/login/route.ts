import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkCredentials,
  createSessionToken,
  gateEnabled,
  safeNextPath,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    user?: unknown;
    password?: unknown;
    next?: unknown;
  } | null;
  const next = safeNextPath(typeof body?.next === "string" ? body.next : null);

  if (!gateEnabled()) return NextResponse.json({ ok: true, next });

  const user = typeof body?.user === "string" ? body.user.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkCredentials(user, password)) {
    // A small fixed delay makes guessing slower without a rate-limit store.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ ok: false, error: "That password didn't match." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, next });
  response.cookies.set(SESSION_COOKIE, createSessionToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
