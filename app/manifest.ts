import type { MetadataRoute } from "next";

/** Installable owner app: "Add to Home Screen" opens straight into /m. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/m",
    name: "Myna",
    short_name: "Myna",
    description: "New orders and messages that need you, from every channel, in one place.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#fafaf9",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
