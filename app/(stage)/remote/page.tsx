import type { Metadata, Viewport } from "next";
import RemoteScreen from "@/components/stage/RemoteScreen";
import { remoteChannel } from "@/lib/remote";
import "./remote.css";

export const metadata: Metadata = {
  title: "Remote · Myna",
  icons: { icon: "/icons/maya-icon.png", apple: "/icons/maya-icon.png" },
};

export const viewport: Viewport = { themeColor: "#10261b", viewportFit: "cover" };

/**
 * Phone remote for /present: the speaker at the podium drives the laptop
 * (slides, views, timer, backup) from their phone. Behind the gate.
 */
export default function RemotePage() {
  return <RemoteScreen channel={remoteChannel()} />;
}
