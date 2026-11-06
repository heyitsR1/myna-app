import localFont from "next/font/local";
import WallScreen from "@/components/wall/WallScreen";
import "./wall.css";

export const metadata = { title: "Live · Myna" };

// The summit deck's type, so the wall and the slides read as one show.
const dela = localFont({
  src: "../../fonts/DelaGothicOne-Regular.ttf",
  variable: "--font-wall-display",
  display: "block",
});
const atkinson = localFont({
  src: [
    { path: "../../fonts/AtkinsonHyperlegible-Regular.ttf", weight: "400" },
    { path: "../../fonts/AtkinsonHyperlegible-Bold.ttf", weight: "700" },
  ],
  variable: "--font-wall-text",
  display: "block",
});

/**
 * The projector view for the summit. Outside the `(app)` group on purpose:
 * no rail, no chrome, just the room's DMs and Maya's answers. Still behind
 * the Basic-auth gate in `proxy.ts`.
 */
export default async function WallPage({ searchParams }: PageProps<"/wall">) {
  // `?handle=` changes the call to action without a deploy.
  const { handle } = await searchParams;
  const shown = typeof handle === "string" && handle.trim() ? handle.trim().replace(/^@/, "") : "monso.eyewear";
  return (
    <div className={`${dela.variable} ${atkinson.variable}`}>
      <WallScreen handle={shown} />
    </div>
  );
}
