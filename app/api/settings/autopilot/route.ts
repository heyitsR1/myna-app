import { NextResponse } from "next/server";
import { getOrCreateDefaultBrand } from "@/lib/brand";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * The Autopilot switch. When on, Maya confirms orders herself and the owner
 * just gets a "confirmed" notification (see `autopilotEnabled` in lib/push.ts).
 *
 *   GET  /api/settings/autopilot            → { enabled }
 *   POST /api/settings/autopilot { enabled } → { enabled }
 */
export async function GET() {
  const brand = await getOrCreateDefaultBrand();
  if (!brand) return NextResponse.json({ enabled: false, error: "Supabase is not configured" }, { status: 503 });
  return NextResponse.json({ enabled: (brand as { autopilot?: boolean }).autopilot === true });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const brand = await getOrCreateDefaultBrand();
  if (!supabase || !brand) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("brands")
    .update({ autopilot: body.enabled })
    .eq("id", brand.id)
    .select("autopilot")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: data.autopilot === true });
}
