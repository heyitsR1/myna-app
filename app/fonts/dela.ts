import localFont from "next/font/local";

/**
 * Dela Gothic One, the summit deck's display face, subset to printable ASCII
 * (10 KB instead of the 2.5 MB CJK original). Brand moments only: the "Myna"
 * wordmark and the big number on the phone's Today card. Never body text.
 */
export const dela = localFont({
  src: "./DelaGothicOne-ascii.woff",
  variable: "--font-dela",
  display: "swap",
});
