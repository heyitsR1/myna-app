/**
 * A phone with Safari's share sheet up and "Add to Home Screen" picked out,
 * drawn in the app's stone palette with the one amber accent on the steps
 * the owner has to tap.
 */
export default function AddToHomeIllustration() {
  return (
    <svg className="ph-illo" viewBox="0 0 240 200" role="img" aria-label="Safari's share sheet with Add to Home Screen highlighted">
      <defs>
        <clipPath id="ph-illo-screen">
          <rect x="62" y="14" width="116" height="200" rx="18" />
        </clipPath>
      </defs>
      {/* phone body */}
      <rect x="56" y="8" width="128" height="220" rx="24" fill="#fff" stroke="#d6d3d1" strokeWidth="1.5" />
      <g clipPath="url(#ph-illo-screen)">
        <rect x="62" y="14" width="116" height="200" fill="#fafaf9" />
        {/* page behind the sheet */}
        <rect x="74" y="34" width="44" height="6" rx="3" fill="#d6d3d1" />
        <rect x="74" y="48" width="92" height="5" rx="2.5" fill="#e7e5e4" />
        <rect x="74" y="58" width="78" height="5" rx="2.5" fill="#e7e5e4" />
        <rect x="62" y="70" width="116" height="140" fill="#1c1917" fillOpacity="0.18" className="ph-illo-dim" />
        {/* share sheet */}
        <g className="ph-illo-sheet">
          <rect x="62" y="96" width="116" height="130" rx="14" fill="#fff" />
          <rect x="108" y="102" width="24" height="3" rx="1.5" fill="#d6d3d1" />
          <rect x="72" y="114" width="96" height="16" rx="5" fill="#f5f5f4" />
          <rect x="72" y="134" width="96" height="22" rx="6" fill="#fffbeb" stroke="#b45309" strokeWidth="1.4" className="ph-illo-pick" />
          <rect x="79" y="140" width="10" height="10" rx="2.5" fill="none" stroke="#b45309" strokeWidth="1.4" />
          <path d="M84 142.5v5M81.5 145h5" stroke="#b45309" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="95" y="143" width="56" height="4" rx="2" fill="#b45309" opacity="0.75" />
          <rect x="72" y="160" width="96" height="16" rx="5" fill="#f5f5f4" />
        </g>
      </g>
      {/* Safari's share glyph, called out beside the phone */}
      <g transform="translate(14 150)">
        <circle cx="16" cy="16" r="16" fill="#fffbeb" stroke="#fde68a" />
        <path d="M16 8.5v11M12 12l4-3.5 4 3.5M11 15.5h-.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V17a1.5 1.5 0 0 0-1.5-1.5H21" fill="none" stroke="#b45309" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* the icon it ends up as */}
      <g transform="translate(196 36)">
        <rect width="32" height="32" rx="8" fill="#1c1917" />
        <path d="M9.3 23V13.7l6.7 6.2 6.7-6.2V23" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -2)" />
      </g>
    </svg>
  );
}
