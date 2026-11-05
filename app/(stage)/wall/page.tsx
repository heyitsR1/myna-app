import WallScreen from "@/components/wall/WallScreen";
import "./wall.css";

export const metadata = { title: "Live · Myna" };

/**
 * The projector view for the summit. Outside the `(app)` group on purpose:
 * no rail, no chrome, just the room's DMs and Maya's answers. Still behind
 * the Basic-auth gate in `proxy.ts`.
 */
export default async function WallPage({ searchParams }: PageProps<"/wall">) {
  // `?handle=` changes the call to action without a deploy.
  const { handle } = await searchParams;
  const shown = typeof handle === "string" && handle.trim() ? handle.trim().replace(/^@/, "") : "monso.eyewear";
  return <WallScreen handle={shown} />;
}
