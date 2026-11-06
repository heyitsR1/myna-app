import type { Metadata, Viewport } from "next";
import "./try.css";

/**
 * Public landing page behind the summit QR code. The audience picks the app
 * they already use and messages Monso Eyewear; Maya answers there. No auth:
 * `try` is listed in the matcher exclusions in `proxy.ts`.
 */

export const metadata: Metadata = {
  title: "Message Monso Eyewear",
  description: "Ask anything. Maya answers in seconds, in Nepali or English.",
};

export const viewport: Viewport = {
  themeColor: "#f3ece2",
  viewportFit: "cover",
};

const CHANNELS = [
  {
    name: "Instagram",
    handle: "@monso.eyewear",
    href: "https://ig.me/m/monso.eyewear",
    tone: "ig",
  },
  {
    name: "WhatsApp",
    handle: "+977 976-8578052",
    href: "https://wa.me/9779768578052?text=" + encodeURIComponent("kati parcha?"),
    tone: "wa",
  },
  {
    name: "Messenger",
    handle: "Monso Eyewear",
    href: "https://m.me/1409707462227849",
    tone: "fb",
  },
];

const IDEAS = [
  "kati parcha?",
  "bike chalauna kun ramro?",
  "photo pathaunu na",
  "MS-03 chahiyo, Koteshwor",
  "discount milcha?",
];

export default function TryPage() {
  return (
    <main className="try">
      <div className="try-hero">
        <img src="/try/hero.webp" alt="Monso sunglasses" />
      </div>
      <section className="try-body">
        <p className="try-kicker">Monso Eyewear</p>
        <h1>Send us a message.</h1>
        <p className="try-lede">
          Maya answers in seconds, in Nepali, English or Roman Nepali. Ask about a price, a
          style, delivery, or order a pair.
        </p>

        <nav className="try-links" aria-label="Message Monso">
          {CHANNELS.map((c) => (
            <a key={c.name} className={`try-link try-${c.tone}`} href={c.href}>
              <span className="try-link-name">{c.name}</span>
              <span className="try-link-handle">{c.handle}</span>
            </a>
          ))}
        </nav>

        <p className="try-ideas-label">Not sure what to ask?</p>
        <ul className="try-ideas">
          {IDEAS.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>

        <p className="try-foot">
          Answered by Maya · <b>Myna</b>
        </p>
      </section>
    </main>
  );
}
