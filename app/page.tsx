import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthProvider } from "@/components/AuthProvider";
import { TradingDashboard } from "@/components/TradingDashboard";

export const metadata: Metadata = {
  title: "PaperTrade IN — Indian Market Simulator",
  description: "A modern INR paper-trading terminal with live simulated candlesticks, EMA, RSI, watchlists and drawing tools.",
};

type PageSearchParams = Record<string, string | string[] | undefined>;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function canonicalSymbol(value: string | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9&.-]{1,40}$/.test(normalized) ? normalized : "";
}

export default async function Home({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const params = await searchParams;
  if (params && Object.prototype.hasOwnProperty.call(params, "sym")) {
    const canonical = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(params)) {
      if (key === "sym" || key === "symbol" || rawValue === undefined) continue;
      for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) canonical.append(key, value);
    }
    const symbol = canonicalSymbol(firstSearchValue(params.symbol) ?? firstSearchValue(params.sym));
    if (symbol) canonical.set("symbol", symbol);
    redirect(canonical.size ? `/?${canonical.toString()}` : "/");
  }
  return <AuthProvider><TradingDashboard /></AuthProvider>;
}
