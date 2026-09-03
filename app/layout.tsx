import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./motion.css";
import "./allotments.css";
import "./ipo-directory.css";
import "./candle-legend.css";
import "./compact-workspaces.css";
import "./studio-theme.css";

const productionUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://papertrade.site";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  applicationName: "PaperTrade IN",
  appleWebApp: {
    capable: true,
    title: "PaperTrade IN",
    statusBarStyle: "black-translucent",
  },
  title: {
    default: "PaperTrade IN",
    template: "%s · PaperTrade IN",
  },
  description: "Indian market paper-trading simulator in INR.",
  openGraph: {
    title: "PaperTrade IN",
    description: "Practice Indian stock trading with dynamic candlesticks, EMA, RSI and drawing tools.",
    images: [{ url: "/papertrade-social.png", width: 1678, height: 939, alt: "PaperTrade IN candlestick chart" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PaperTrade IN",
    description: "A colorful INR paper-trading simulator for Indian markets.",
    images: ["/papertrade-social.png"],
  },
  icons: {
    icon: "/favicon.svg?v=original-20260903",
    shortcut: "/papertrade-icon-192.png?v=1.13",
    apple: "/papertrade-icon-192.png?v=1.13",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
