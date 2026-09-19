import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, connections: [] });
  }

  const { data, error } = await supabase
    .from("channel_connections")
    .select("id, channel, external_account_id, status, token_expires_at, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      { configured: true, connections: [], error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    configured: true,
    connections: data ?? [],
    devMode: {
      // Dev-mode single-brand tokens, per channel — no OAuth flow yet.
      envReady: {
        instagram: Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_ACCOUNT_ID),
        messenger: Boolean(process.env.FB_PAGE_ACCESS_TOKEN && process.env.FB_PAGE_ID),
        whatsapp: Boolean(process.env.WA_ACCESS_TOKEN && process.env.WA_PHONE_NUMBER_ID),
      },
      webhookConfigured: Boolean(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN),
    },
  });
}
