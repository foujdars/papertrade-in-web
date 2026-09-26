import type { Metadata, Viewport } from "next";
import { NativeViewportGuard } from "@/components/NativeViewportGuard";
import "./globals.css";
import "./motion.css";
import "./allotments.css";
import "./ipo-directory.css";
import "./candle-legend.css";
import "./compact-workspaces.css";
import "./studio-theme.css";
import "./stock-logos.css";
import "./interface-cleanup.css";
import "./trading-coach.css";
import "./bar-replay.css";
import "./portfolio-controls.css";
import "./chart-brackets.css";
import "./price-actions.css";
import "./smc-learner.css";
import "./ipo-lifecycle.css";
import "./list-density.css";
import "./refinements.css";
import "./polish.css";
import "./notifications.css";
import "./launch-screen.css";
import "./chart-focus.css";
import "./chart-style.css";
import "./pnl-analytics.css";
import "./modern-select.css";
import "./ipo-studio.css";
import "./drawing-studio.css";
import "./indicator-studio.css";
import "./home-hub.css";
import "./global-markets.css";
import "./home-studio.css";
import "./trading-watchlist.css";

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
    icon: [
      { url: "/favicon-32-v120.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64-v120.png", sizes: "64x64", type: "image/png" },
    ],
    shortcut: "/papertrade-icon-192.png?v=1.20",
    apple: "/apple-touch-icon-v120.png",
  },
  manifest: "/manifest.webmanifest?v=1.20",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body><NativeViewportGuard />{children}</body>
    </html>
  );
}
