import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import BrandGlyph, { type Brand } from "./BrandGlyph";
import CopyIdeas from "./CopyIdeas";
import "./try.css";

/**
 * Public landing page behind the summit QR code. The audience picks the app
 * they already use and DMs Monso Eyewear; Maya answers. No auth:
 * `try` is listed in the matcher exclusions in `proxy.ts`.
 *
 * On a wide screen (the projector) it also shows its own QR, so people who
 * missed the one on the slide can still scan in.
 */

const sans = Inter_Tight({
  variable: "--font-try",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Monso Eyewear",
  description: "Message Monso Eyewear on Instagram, WhatsApp or Facebook to order.",
};

export const viewport: Viewport = {
  themeColor: "#eee7db",
  viewportFit: "cover",
};

const CHANNELS: { name: string; href: string; brand: Brand }[] = [
  { name: "Instagram", href: "https://www.instagram.com/monso.eyewear/", brand: "instagram" },
  {
    name: "WhatsApp",
    href: "https://wa.me/9779768578052?text=" + encodeURIComponent("kati parcha?"),
    brand: "whatsapp",
  },
  { name: "Facebook", href: "https://www.facebook.com/1409707462227849", brand: "facebook" },
];

const IDEAS = ["kati parcha?", "bike chalauna kun ramro?", "MS-03 chahiyo, Koteshwor"];

const PRODUCTS = [
  { sku: "MS-01", name: "Navigator", img: "navigator-amber" },
  { sku: "MS-02", name: "Retro Round", img: "retro-round" },
  { sku: "MS-03", name: "Wayfarer", img: "wayfarer-matte-black" },
  { sku: "MS-04", name: "Oval Rose", img: "oval-rose" },
  { sku: "MS-05", name: "Square Tortoise", img: "square-tortoise" },
];

export default function TryPage() {
  return (
    <main className={`try ${sans.variable}`}>
      <div className="try-shell">
        <header className="try-bar">
          <span className="try-mark">Monso</span>
        </header>

        <div className="try-hero">
          <img src="/try/hero.webp" alt="MS-03 Wayfarer sunglasses in matte black" />
        </div>

        <section className="try-main">
          <h1>Message us to order.</h1>

          <nav className="try-links" aria-label="Message Monso Eyewear">
            {CHANNELS.map((c) => (
              <a key={c.name} className="try-link" href={c.href}>
                <BrandGlyph name={c.brand} />
                <span>Message on {c.name}</span>
              </a>
            ))}
          </nav>

          <CopyIdeas ideas={IDEAS} />
        </section>

        <aside className="try-qr" aria-label="Scan to open this page on your phone">
          <div className="try-qr-card">
            <img src="/try/qr.svg" alt="QR code for myna.tailsgate.com/try" />
          </div>
          <p className="try-qr-title">Scan me</p>
        </aside>

        <section className="try-collection" aria-labelledby="try-collection-label">
          <h2 id="try-collection-label">The collection</h2>
          <ul>
            {PRODUCTS.map((p) => (
              <li key={p.sku}>
                <img src={`/try/products/${p.img}.jpg`} alt="" loading="lazy" />
                <span>
                  <b>{p.sku}</b> {p.name}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
