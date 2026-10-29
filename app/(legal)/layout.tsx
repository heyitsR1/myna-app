import Link from "next/link";

/**
 * Public document shell — no rail, no auth. Meta's App Review team and any
 * customer must be able to read these pages without credentials, so keep
 * these routes listed in the `matcher` exclusions in `proxy.ts`.
 */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="legal">
      <header className="legal-head">
        <Link href="/privacy" className="legal-mark">
          Myna
        </Link>
        <nav className="legal-nav">
          <Link href="/privacy">Privacy</Link>
          <Link href="/data-deletion">Data deletion</Link>
        </nav>
      </header>
      <article className="legal-body">{children}</article>
      <footer className="legal-foot">
        Myna · One inbox for Instagram, WhatsApp and Facebook ·{" "}
        <a href="mailto:toolsmxpo@gmail.com">toolsmxpo@gmail.com</a>
      </footer>
    </div>
  );
}
