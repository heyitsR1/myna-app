import { NextResponse } from "next/server";
import { getOrCreateDefaultBrand } from "@/lib/brand";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Store (POST) or forget (DELETE) one device's Web Push subscription.
 *
 *   POST   /api/push/subscribe  PushSubscription JSON: { endpoint, keys: { p256dh, auth } }
 *   DELETE /api/push/subscribe  { endpoint }
 *
 * POST is an upsert on `endpoint`, so the phone app re-sends its
 * subscription on every launch without creating duplicates.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) {
    return NextResponse.json({ error: "Expected a PushSubscription: endpoint, keys.p256dh, keys.auth" }, { status: 400 });
  }

  const brand = await getOrCreateDefaultBrand();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint,
      p256dh,
      auth,
      brand_id: brand?.id ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || !body.endpoint) {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
