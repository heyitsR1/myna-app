import { NextResponse } from "next/server";
import { sendToAllSubscriptions } from "@/lib/push";

export const runtime = "nodejs";

/**
 * POST /api/push/test — send a test notification to every subscribed device
 * and report what the push services said, so the owner (and we) can see a
 * delivery actually happened.
 */
export async function POST() {
  const report = await sendToAllSubscriptions({
    kind: "test",
    title: "Myna is set up",
    body: "New orders and anything Maya needs you for will arrive like this.",
    url: "/m",
    tag: "myna-test",
  });
  if (!report.configured) {
    return NextResponse.json({ ...report, error: "Push keys (VAPID) are not configured" }, { status: 503 });
  }
  const status = report.subscriptions > 0 && report.delivered === 0 ? 502 : 200;
  return NextResponse.json(report, { status });
}
