/**
 * Catalogue + order helpers shared by Maya's reply pipeline and the
 * owner-facing order routes.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Order, OrderItem, Product } from "@/lib/types";

export function formatNpr(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
}

export async function listProducts(brandId: string): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as Product[];
}

/** The catalogue as the customer sees it — one line per item, exact prices. */
export function formatCatalogue(products: Product[]): string {
  return products
    .map((p) => {
      const stock = p.in_stock ? "" : " (out of stock)";
      const desc = p.description ? ` — ${p.description}` : "";
      return `${p.sku} · ${p.name}${desc} — ${formatNpr(Number(p.price))}${stock}`;
    })
    .join("\n");
}

/** The catalogue as Maya sees it in her system prompt. */
export function catalogueForPrompt(products: Product[]): string {
  if (products.length === 0) return "(no products listed)";
  return products
    .map(
      (p) =>
        `- SKU ${p.sku}: ${p.name} — ${formatNpr(Number(p.price))}${p.in_stock ? "" : " — OUT OF STOCK"}${
          p.description ? `. ${p.description}` : ""
        }`,
    )
    .join("\n");
}

/**
 * Resolve what the customer asked for to a real product. The model is asked
 * for a SKU, but people (and models) say "the aviator" or "number 3", so
 * fall back to a name match before giving up.
 */
export function matchProduct(products: Product[], ref: string): Product | null {
  const needle = ref.trim().toLowerCase();
  if (!needle) return null;
  const bySku = products.find((p) => p.sku.toLowerCase() === needle);
  if (bySku) return bySku;
  const byName = products.find((p) => p.name.toLowerCase() === needle);
  if (byName) return byName;
  const index = Number(needle.replace(/[^0-9]/g, ""));
  if (Number.isInteger(index) && index >= 1 && index <= products.length && /^(#|no\.?|number|item)?\s*\d+$/.test(needle)) {
    return products[index - 1];
  }
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  const scored = products
    .map((p) => {
      const hay = `${p.sku} ${p.name} ${p.description ?? ""}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return { p, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.p ?? null;
}

export function orderSummaryLine(order: Pick<Order, "order_number" | "items" | "total">): string {
  const items = (order.items as OrderItem[])
    .map((i) => `${i.name} (${i.sku}) × ${i.quantity}`)
    .join(", ");
  return `Order #${order.order_number} · ${items} · ${formatNpr(Number(order.total))}`;
}
