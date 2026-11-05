/** The Myna "M" mark — same glyph as the rail, reused on the gate and onboarding. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 18V7.5l7 6.5 7-6.5V18" />
      </svg>
    </span>
  );
}
