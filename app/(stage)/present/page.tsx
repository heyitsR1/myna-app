import localFont from "next/font/local";
import PresentScreen from "@/components/stage/PresentScreen";
import { DECK_ORIGINS } from "@/components/stage/present-config";
import "./present.css";

export const metadata = { title: "Present · Myna" };

// Dela Gothic One for the audience timer, subset to printable ASCII (10 KB
// instead of the 2.5 MB CJK original).
const dela = localFont({
  src: "./fonts/DelaGothicOne-timer.woff",
  variable: "--font-dela",
  display: "block",
});

const DECK_URL = "https://myna-summit-show.vercel.app/";

/**
 * Projector console for the summit demo: the slide deck, the /try landing,
 * the live wall, the desktop inbox and the phone app behind one switch, plus
 * the audience timer. Behind the password gate like /wall.
 *
 * `?deck=http://localhost:5190/` points the Slides tab at a local deck; only
 * the origins the console accepts keys from are allowed.
 */
export default async function PresentPage({ searchParams }: PageProps<"/present">) {
  const { deck } = await searchParams;
  let deckUrl = DECK_URL;
  if (typeof deck === "string") {
    try {
      if (DECK_ORIGINS.includes(new URL(deck).origin)) deckUrl = deck;
    } catch {
      // Not a URL: keep the production deck.
    }
  }
  return (
    <div className={dela.variable}>
      <PresentScreen deckUrl={deckUrl} />
    </div>
  );
}
