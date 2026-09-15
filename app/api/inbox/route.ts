import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Dev-mode read path: the UI reads through the service role until a real
// auth/session flow exists (webhook-created rows have no auth.users owner).
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, conversations: [] });
  }

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "*, channel_connections(channel, external_account_id), messages(body, created_at, sender_type, direction, status), orders(id, status, order_number, total)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" });

  if (error) {
    return NextResponse.json(
      { configured: true, conversations: [], error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ configured: true, conversations: data ?? [] });
}
