import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import PlatformGlyph, { type Platform } from "@/components/PlatformGlyph";
import "./try.css";

/**
 * Public landing page behind the summit QR code. The audience picks the app
 * they already use, sees the Monso Eyewear shop there, then DMs to order;
 * Maya answers. No auth:
 * `try` is listed in the matcher exclusions in `proxy.ts`.
 *
 * On a wide screen (the projector) it also shows its own QR, so people who
 * missed the one on the slide can still scan in.
 */

const display = Fraunces({
  variable: "--font-try-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Monso Eyewear",
  description: "Pick an app and message us. Maya replies in seconds, in Nepali or English.",
};

export const viewport: Viewport = {
  themeColor: "#eee7db",
  viewportFit: "cover",
};

const CHANNELS: { name: string; handle: string; href: string; glyph: Platform }[] = [
  {
    name: "Instagram",
    handle: "@monso.eyewear",
    href: "https://www.instagram.com/monso.eyewear/",
    glyph: "instagram",
  },
  {
    name: "WhatsApp",
    handle: "+977 976-8578052",
    href: "https://wa.me/9779768578052?text=" + encodeURIComponent("kati parcha?"),
    glyph: "whatsapp",
  },
  {
    name: "Facebook",
    handle: "Monso Eyewear",
    href: "https://www.facebook.com/1409707462227849",
    glyph: "facebook",
  },
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
    <main className={`try ${display.variable}`}>
      <div className="try-shell">
        <header className="try-bar">
          <span className="try-mark">Monso</span>
          <span className="try-bar-note">Eyewear · Kathmandu</span>
        </header>

        <div className="try-hero">
          <img src="/try/hero.webp" alt="MS-03 Wayfarer sunglasses in matte black" />
        </div>

        <section className="try-main">
          <h1>
            Pick an app and message&nbsp;us.
            <em>Maya replies in seconds.</em>
          </h1>

          <nav className="try-links" aria-label="Message Monso Eyewear">
            {CHANNELS.map((c) => (
              <a key={c.name} className="try-link" href={c.href}>
                <span className="try-glyph" aria-hidden="true">
                  <PlatformGlyph name={c.glyph} />
                </span>
                <span className="try-link-text">
                  <span className="try-link-name">{c.name}</span>
                  <span className="try-link-handle">{c.handle}</span>
                </span>
                <span className="try-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            ))}
          </nav>

          <div className="try-ideas">
            <p className="try-label">Try asking</p>
            <ul>
              {IDEAS.map((i) => (
                <li key={i}>“{i}”</li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="try-qr" aria-label="Scan to open this page on your phone">
          <div className="try-qr-card">
            <img src="/try/qr.svg" alt="QR code for myna.tailsgate.com/try" />
          </div>
          <p className="try-qr-title">Scan me</p>
          <p className="try-qr-url">myna.tailsgate.com/try</p>
        </aside>

        <section className="try-collection" aria-label="The collection">
          <p className="try-label">The collection</p>
          <ul>
            {PRODUCTS.map((p) => (
              <li key={p.sku}>
                <img src={`/try/products/${p.img}.jpg`} alt={`${p.sku} ${p.name}`} loading="lazy" />
                <span className="try-sku">{p.sku}</span>
                <span className="try-pname">{p.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="try-foot">
          Replies by Maya, an AI assistant on <b>Myna</b>. Nepali, English or Roman&nbsp;Nepali.
        </footer>
      </div>
    </main>
  );
}
