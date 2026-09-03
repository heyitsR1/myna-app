"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/inbox",
    label: "INBOX",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z" />
      </svg>
    ),
  },
  {
    href: "/brain",
    label: "BRAIN",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: "/channels",
    label: "CHANNELS",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M9 3v6l-3 3v2h5v7h2v-7h5v-2l-3-3V3" />
      </svg>
    ),
  },
] as const;

export default function Rail() {
  const pathname = usePathname();

  return (
    <nav className="rail">
      <div className="mark">
        <span>M</span>
      </div>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rail-btn ${pathname.startsWith(item.href) ? "active" : ""}`}
          aria-label={item.label}
        >
          <div>
            {item.icon}
            <span className="rail-label">{item.label}</span>
          </div>
        </Link>
      ))}
      <div className="rail-spacer" />
      <div className="rail-me">S</div>
    </nav>
  );
}
