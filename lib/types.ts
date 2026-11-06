// Type-only, so the TypeSafe SDK is never pulled into the client bundle.
import type { Triage } from "@/lib/triage";

export type Channel = "instagram" | "whatsapp" | "messenger";

export interface Brand {
  id: string;
  owner_id: string | null;
  name: string;
  tone_notes: string | null;
  created_at: string;
}

export interface ChannelConnection {
  id: string;
  brand_id: string;
  channel: Channel;
  external_account_id: string;
  access_token: string | null;
  token_expires_at: string | null;
  status: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  brand_id: string;
  channel_connection_id: string;
  external_customer_id: string;
  customer_name: string | null;
  ai_enabled: boolean;
  status: "open" | "needs_human" | "resolved";
  last_message_at: string | null;
  created_at: string;
  /** Jev's read of the most recent inbound message — denormalised for the list. */
  last_intent: string | null;
  last_frustration: number | null;
  last_warmth: number | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "ai" | "human";
  body: string;
  external_message_id: string | null;
  ai_confidence: number | null;
  ai_sources: AiSource[] | null;
  status: "sent" | "draft_pending" | "failed";
  created_at: string;
  /** Null on outbound messages, and when TypeSafe was unreachable. */
  triage: Triage | null;
  /** A photo the customer sent (migration 008). */
  media?: { kind: "image"; url?: string; wa_media_id?: string; mime?: string } | null;
}

export interface AiSource {
  document_id: string;
  similarity: number;
  excerpt: string;
}

export interface DocumentRow {
  id: string;
  brand_id: string;
  filename: string;
  storage_path: string;
  status: "processing" | "ready" | "failed";
  chunk_count: number | null;
  created_at: string;
}

export interface DocChunk {
  id: string;
  document_id: string;
  brand_id: string;
  content: string;
  chunk_index: number;
}

export interface Product {
  id: string;
  brand_id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  in_stock: boolean;
  sort_order: number;
  created_at: string;
  /** Storefront fields (migration 005); null until the store seeds them. */
  slug?: string | null;
  image_url?: string | null;
}

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  order_number: number;
  brand_id: string;
  conversation_id: string;
  items: OrderItem[];
  total: number;
  customer_name: string | null;
  delivery_address: string | null;
  phone: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "shipped" | "cancelled";
  created_at: string;
  confirmed_at: string | null;
  /** Migration 010: the customer's order-check page. */
  public_token?: string | null;
  customer_confirmed_at?: string | null;
  customer_edits?: { at: string; field: string; from: unknown; to: unknown }[] | null;
}
