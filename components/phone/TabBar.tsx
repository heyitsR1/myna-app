"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePoll, type Summary } from "@/components/phone/usePoll";

const TABS = [
  {
    href: "/m",
    label: "Today",
    icon: <path d="M4 11.5L12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/m/chats",
    label: "Chats",
    icon: <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />,
  },
  {
    href: "/m/orders",
    label: "Orders",
    icon: (
      <>
        <path d="M6 7h12l-1 13H7z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </>
    ),
  },
  {
    href: "/m/customers",
    label: "Customers",
    icon: (
      <>
        <circle cx="9" cy="8.5" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0z" />
        <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.3a6.5 6.5 0 0 1 3.5 5.7" />
      </>
    ),
  },
] as const;

/** Bottom tabs, hidden inside a conversation so the composer owns the bottom edge. */
export default function TabBar() {
  const pathname = usePathname();
  const { data } = usePoll<Summary>("/api/summary", 15000);
  // Inside a conversation the composer owns the bottom edge; detail screens push over the tabs.
  if (/^\/m\/(chats|customers)\/[^/]+/.test(pathname)) return null;

  const badge: Record<string, number> = {
    "/m/chats": data?.needs ?? 0,
    "/m/orders": data?.pendingOrders ?? 0,
  };

  return (
    <nav className="ph-tabs" aria-label="Sections">
      {TABS.map((t) => {
        const active = t.href === "/m" ? pathname === "/m" : pathname.startsWith(t.href);
        const n = badge[t.href] ?? 0;
        return (
          <Link key={t.href} href={t.href} className={`ph-tab ${active ? "on" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="ph-tab-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {t.icon}
              </svg>
              {n > 0 && <span className="ph-tab-badge num">{n > 9 ? "9+" : n}</span>}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
