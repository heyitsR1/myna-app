import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { instagramToken, refreshInstagramToken } from "@/lib/meta";

export const runtime = "nodejs";

/**
 * Instagram long-lived tokens die after 60 days and nothing warns you —
 * Myna just goes quiet. Refreshing mints a fresh 60-day token from a still-
 * valid one (Meta requires the current token to be at least 24h old). The
 * new token is stored on every Instagram connection row, which the send and
 * ingest paths prefer over the env token, so no redeploy and no secret
 * update is needed.
 *
 *   POST /api/maintenance/refresh-ig-token
 *
 * `scripts/demo-up.sh` calls this; it is safe to call every day. Behind the
 * Basic-auth gate like everything else.
 */
export async function POST() {
  const { token, expiresAt } = await instagramToken();
  if (!token) return NextResponse.json({ ok: false, error: "no Instagram token configured" }, { status: 400 });

  // Skip when the stored token is still young: refreshing a <24h-old token
  // errors, and refreshing a 50-day-fresh one is pointless churn.
  if (expiresAt) {
    const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft > 50) {
      return NextResponse.json({ ok: true, skipped: true, expiresAt, daysLeft: Math.round(daysLeft) });
    }
  }

  const result = await refreshInstagramToken(token);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("channel_connections")
    .update({ access_token: result.token, token_expires_at: result.expiresAt })
    .eq("channel", "instagram")
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt, connectionsUpdated: data?.length ?? 0 });
}
