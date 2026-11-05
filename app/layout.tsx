import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "@/components/phone/RegisterServiceWorker";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Myna",
  description:
    "One inbox for every doorway to your shop: Instagram, WhatsApp and Facebook DMs, answered by Maya.",
  // Installable owner app (manifest: app/manifest.ts, push: public/sw.js).
  applicationName: "Myna",
  appleWebApp: { capable: true, title: "Myna", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  // Lets the phone screens paint under the notch / home indicator; they pad
  // themselves back with env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
