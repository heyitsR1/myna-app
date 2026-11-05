import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { envAccountFor, envTokenFor, sendMessage } from "@/lib/meta";
import { photoUrl } from "@/lib/reply";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ messages: [] });
  }

  const [msgs, orders, conversation, products] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("*, channel_connections(channel)")
      .eq("id", conversationId)
      .maybeSingle(),
    supabase.from("products").select("*"),
  ]);
  if (msgs.error) {
    return NextResponse.json({ messages: [], orders: [], error: msgs.error.message }, { status: 500 });
  }
  // SKU → photo URL, so the phone thread can show the product photos Maya sent.
  const photos = Object.fromEntries(
    (products.data ?? []).map((p) => [p.sku, photoUrl(p)]).filter(([, url]) => url),
  );
  return NextResponse.json({
    messages: msgs.data ?? [],
    orders: orders.data ?? [],
    conversation: conversation.data ?? null,
    photos,
  });
}

interface SendContext {
  channel: Channel | null;
  accountId: string | null;
  accessToken: string | null;
  recipientId: string;
}

function sendViaChannel(ctx: SendContext, text: string) {
  return sendMessage(ctx.channel, ctx.accountId, ctx.recipientId, text, ctx.accessToken);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured — set the keys in .env.local" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    text?: string;
    approveDraftId?: string;
  } | null;
  if (!body || (!body.text && !body.approveDraftId)) {
    return NextResponse.json(
      { error: "Provide { text } for a reply or { approveDraftId } to send a draft" },
      { status: 400 },
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, channel_connections(*)")
    .eq("id", conversationId)
    .single();
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const connection = conversation.channel_connections;
  const channel: Channel | null = connection?.channel ?? null;
  const ctx: SendContext = {
    channel,
    accountId:
      connection?.external_account_id ?? (channel ? envAccountFor(channel) ?? null : null),
    accessToken: connection?.access_token ?? (channel ? envTokenFor(channel) ?? null : null),
    recipientId: conversation.external_customer_id,
  };

  // ── Approve a pending AI draft ──────────────────────────────────────────
  if (body.approveDraftId) {
    const { data: draft } = await supabase
      .from("messages")
      .select("*")
      .eq("id", body.approveDraftId)
      .eq("conversation_id", conversationId)
      .eq("status", "draft_pending")
      .single();
    if (!draft) {
      return NextResponse.json({ error: "Draft not found or already sent" }, { status: 404 });
    }

    const sent = await sendViaChannel(ctx, draft.body);
    const { data: updated, error } = await supabase
      .from("messages")
      .update({
        status: sent.ok ? "sent" : "failed",
        // Meta's id for the delivered message — the only proof it went out.
        external_message_id: sent.messageId ?? null,
        created_at: new Date().toISOString(),
      })
      .eq("id", draft.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase
      .from("conversations")
      .update({
        status: sent.ok ? "open" : "needs_human",
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (!sent.ok) {
      return NextResponse.json(
        { message: updated, error: sent.error ?? "send failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ message: updated });
  }

  // ── Human reply ─────────────────────────────────────────────────────────
  const text = body.text!.trim();
  if (!text) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const sent = await sendViaChannel(ctx, text);
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      sender_type: "human",
      body: text,
      external_message_id: sent.messageId ?? null,
      status: sent.ok ? "sent" : "failed",
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("conversations")
    .update({ status: "open", last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (!sent.ok) {
    return NextResponse.json({ message, error: sent.error ?? "send failed" }, { status: 502 });
  }
  return NextResponse.json({ message });
}
