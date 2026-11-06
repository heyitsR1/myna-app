import PresentScreen from "@/components/stage/PresentScreen";
import "./present.css";

export const metadata = { title: "Present · Myna" };

/**
 * Projector view for the summit demo: the live wall, the desktop inbox and
 * the phone app behind one switch. Behind the password gate like /wall.
 */
export default function PresentPage() {
  return <PresentScreen />;
}
