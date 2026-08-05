import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { TradingDashboard } from "@/components/TradingDashboard";

export const metadata: Metadata = {
  title: "PaperTrade IN — Indian Market Simulator",
  description: "A modern INR paper-trading terminal with live simulated candlesticks, EMA, RSI, watchlists and drawing tools.",
};

export default function Home() {
  return <AuthProvider><TradingDashboard /></AuthProvider>;
}
