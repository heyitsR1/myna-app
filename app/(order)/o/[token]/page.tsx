import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { loadCustomerOrder } from "@/lib/order-link";
import OrderCheck from "./OrderCheck";
import "./order.css";

/**
 * The page Maya links to when she books an order: the customer checks the
 * details, says they look right, or fixes the address / phone / quantity.
 * Public (no login): `o/` is excluded in proxy.ts, and the random token is
 * the only key. Almost always opened inside Instagram's, WhatsApp's or
 * Messenger's in-app browser, so it is one narrow column, cream like /try.
 */

export const dynamic = "force-dynamic";

const sans = Inter_Tight({
  variable: "--font-order",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Your order · Monso Eyewear",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#eee7db",
  viewportFit: "cover",
};

export default async function OrderLinkPage({ params }: PageProps<"/o/[token]">) {
  const { token } = await params;
  const order = await loadCustomerOrder(token);
  return (
    <main className={`oc ${sans.variable}`}>
      <div className="oc-shell">
        <header className="oc-bar">
          <span className="oc-mark">Monso</span>
          {order && <span className="oc-no">Order #{order.orderNumber}</span>}
        </header>
        {order ? (
          <OrderCheck token={token} initial={order} />
        ) : (
          <section className="oc-missing">
            <h1>We couldn&apos;t find this order.</h1>
            <p>The link may be incomplete. Message Monso Eyewear on the app you ordered from and we&apos;ll help.</p>
          </section>
        )}
      </div>
    </main>
  );
}
