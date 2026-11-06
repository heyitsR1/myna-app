/** Single-weight line glyphs for the three doorways. Inherit `currentColor`, so they never shout. */
export type Platform = "instagram" | "whatsapp" | "facebook" | "messenger";

export default function PlatformGlyph({ name, size = 22 }: { name: Platform; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "instagram") {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === "whatsapp") {
    return (
      <svg {...common}>
        <path d="M4 20l1.3-3.9A8.2 8.2 0 1 1 8.1 18.9z" />
        <path d="M9.2 8.6c.2-.4.5-.5.8-.5h.4l1 2.1-.7.9c.5 1.1 1.3 1.9 2.4 2.4l.9-.7 2.1 1v.4c0 .3-.1.6-.5.8-.8.5-2 .4-3.3-.3a8 8 0 0 1-2.9-2.9c-.7-1.3-.8-2.5-.2-3.2z" />
      </svg>
    );
  }
  if (name === "messenger") {
    return (
      <svg {...common}>
        <path d="M12 3.5c-4.8 0-8.5 3.5-8.5 8 0 2.5 1.1 4.6 3 6.1v3l2.8-1.6c.8.2 1.7.4 2.7.4 4.8 0 8.5-3.5 8.5-8s-3.7-8-8.5-7.9z" />
        <path d="M7.5 13.6l3-3.2 2.2 1.9 3.8-2.4-3 3.2-2.2-1.9z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M13.2 20.5v-9.4c0-1.3.7-2 2-2h1.3M10.4 13.3h5" />
    </svg>
  );
}
