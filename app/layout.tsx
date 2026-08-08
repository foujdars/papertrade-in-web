import type { Metadata } from "next";
import "./globals.css";

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://papertrade-in-web.foujdaaars.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
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
    icon: "/papertrade-icon-192.png",
    shortcut: "/papertrade-icon-192.png",
    apple: "/papertrade-icon-192.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
