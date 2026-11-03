"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    href: "/inbox",
    label: "Inbox",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z" />
      </svg>
    ),
  },
  {
    href: "/brain",
    label: "Knowledge",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: "/channels",
    label: "Channels",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22v-5" />
        <path d="M9 8V2" />
        <path d="M15 8V2" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
      </svg>
    ),
  },
] as const;

export default function Rail() {
  const pathname = usePathname();

  return (
    <nav className="side" aria-label="Main">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 18V7.5l7 6.5 7-6.5V18" />
          </svg>
        </span>
        <span className="brand-name">Myna</span>
      </div>

      <div className="side-nav">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`side-link ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="side-foot">
        <span className="live-dot" aria-hidden="true" />
        <div>
          <div className="side-foot-title">Maya is on</div>
          <div className="side-foot-sub">Replying across 3 channels</div>
        </div>
      </div>
    </nav>
  );
}
