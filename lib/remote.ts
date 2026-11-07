import { createHmac } from "node:crypto";

/**
 * Realtime channel the phone remote (/remote) and the projector console
 * (/present) talk over. Both pages are behind the gate; the name is derived
 * from the gate password so someone holding only the public anon key can't
 * guess it and drive the slides.
 */
export function remoteChannel(): string {
  const secret = process.env.BASIC_AUTH_PASSWORD ?? "dev";
  return `present-${createHmac("sha256", secret).update("myna-remote").digest("hex").slice(0, 24)}`;
}

/** What the console reports back to the remote. */
export type RemoteState = {
  mode: string;
  backup: boolean;
  backupReady: boolean;
  tabs: boolean;
  timer: { shown: boolean; running: boolean; remaining: number };
  deck: { slide: string; step: number; index: number; total: number } | null;
};
