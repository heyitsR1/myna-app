"use client";

import Link from "next/link";
import AutopilotSwitch from "@/components/phone/AutopilotSwitch";
import { NotificationRow, NotificationSetupCard } from "@/components/phone/NotificationCard";
import { usePush } from "@/components/phone/usePush";

/** Maya's tab: how much she's allowed to do, and how loudly Myna tells you. */
export default function SettingsScreen() {
  const push = usePush();
  return (
    <div className="ph">
      <header className="ph-top bar">
        <Link href="/m" className="ph-back" aria-label="Back to Today">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Today
        </Link>
        <span className="ph-top-title">Maya</span>
        <span className="ph-top-spacer" />
      </header>
      <main className="ph-main with-tabs">
        <section className="ph-maya-card">
          <span className="ph-maya-spark big" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3l2.2 6.6L21 12l-6.8 2.4L12 21l-2.2-6.6L3 12l6.8-2.4z" />
            </svg>
          </span>
          <div>
            <div className="ph-card-title">Maya answers every DM</div>
            <p className="ph-card-sub">
              Instagram, WhatsApp and Messenger, in Nepali, English or romanised Nepali. She sends photos, books
              orders, and hands discounts, complaints and anything unsure to you.
            </p>
          </div>
        </section>

        <section className="ph-sec">
          <h2 className="ph-label">What Maya may do</h2>
          <div className="ph-settings">
            <AutopilotSwitch />
          </div>
        </section>

        <section className="ph-sec">
          <h2 className="ph-label">Notifications</h2>
          {push.state === "on" ? (
            <div className="ph-settings">
              <NotificationRow push={push} />
            </div>
          ) : (
            <NotificationSetupCard push={push} />
          )}
        </section>

        <section className="ph-sec">
          <h2 className="ph-label">Always goes to you</h2>
          <ul className="ph-rules">
            <li>Discount or bargaining requests</li>
            <li>Complaints and upset customers</li>
            <li>Anyone who asks for a person</li>
            <li>Questions your shop guide doesn&apos;t answer</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
