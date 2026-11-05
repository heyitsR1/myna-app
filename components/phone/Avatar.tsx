import type { Channel } from "@/lib/types";
import { hueOf, initialsOf } from "@/components/phone/chat";

/** Customer initials with the channel they wrote from as a corner badge. */
export default function Avatar({
  who,
  channel,
  size = 48,
}: {
  who: { customer_name: string | null; external_customer_id: string };
  channel?: Channel | null;
  size?: number;
}) {
  const hue = hueOf(who.external_customer_id);
  return (
    <span
      className="ph-avatar"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 45% 92%)`, color: `hsl(${hue} 35% 32%)` }}
      aria-hidden="true"
    >
      {initialsOf(who)}
      {channel && <span className={`ph-avatar-ch ${channel}`}><ChannelGlyph channel={channel} /></span>}
    </span>
  );
}

export function ChannelGlyph({ channel }: { channel: Channel }) {
  if (channel === "instagram") {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="16.8" cy="7.2" r="1.3" fill="#fff" />
      </svg>
    );
  }
  if (channel === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24">
        <path
          d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 15l4.5-5 3 2.5L18 9l-4.5 5-3-2.5z" fill="#fff" />
    </svg>
  );
}
