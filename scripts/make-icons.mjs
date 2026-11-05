/**
 * Renders the PWA icons in public/icons/ from the Myna "M" mark (the same
 * path as components/BrandMark.tsx). Needs Playwright, which is not a
 * project dependency:
 *
 *   npx -y -p playwright node scripts/make-icons.mjs     # or from any dir with playwright installed
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const M = "M5 18V7.5l7 6.5 7-6.5V18";

/** scale: how much of the canvas the 24-unit mark spans; radius in % of size. */
function svg({ size, scale, radius = 0, bg = true, stroke = "#fff", width = 2.4 }) {
  const markPx = size * scale;
  const offset = (size - markPx) / 2;
  const k = markPx / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#292524"/><stop offset="1" stop-color="#1c1917"/></linearGradient></defs>
  ${bg ? `<rect width="${size}" height="${size}" rx="${(size * radius) / 100}" fill="url(#g)"/>` : ""}
  <g transform="translate(${offset} ${offset}) scale(${k})">
    <path d="${M}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const ICONS = [
  ["icon-192.png", { size: 192, scale: 0.62, radius: 22 }],
  ["icon-512.png", { size: 512, scale: 0.62, radius: 22 }],
  // Maskable: full bleed, mark inside the 80% safe circle.
  ["icon-maskable-512.png", { size: 512, scale: 0.5 }],
  // iOS masks the corners itself; it wants a full-bleed square.
  ["apple-touch-icon.png", { size: 180, scale: 0.62 }],
  // Android status-bar badge: alpha only, so white on transparent.
  ["badge-96.png", { size: 96, scale: 0.86, bg: false, width: 2.8 }],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, opts] of ICONS) {
  await page.setViewportSize({ width: opts.size, height: opts.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(opts)}</body></html>`);
  const png = await page.locator("svg").screenshot({ omitBackground: true });
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png);
  console.log("wrote", name);
}
writeFileSync(new URL("../public/icons/icon.svg", import.meta.url), svg({ size: 512, scale: 0.62, radius: 22 }));
await browser.close();
