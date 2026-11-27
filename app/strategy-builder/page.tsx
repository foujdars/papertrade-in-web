import type { Metadata } from "next";
import { OptionSpreadBuilder } from "@/components/OptionSpreadBuilder";
import type { SpreadMarket } from "@/lib/spread-chain-client";

export const metadata: Metadata = {
  title: "Option Strategy Builder | PaperTrade IN",
  description: "Build and compare option credit and debit spreads across NSE, Delta Exchange India and MCX.",
};

export default async function StrategyBuilderPage({ searchParams }: {
  searchParams: Promise<{ market?: string | string[]; underlying?: string | string[]; expiry?: string | string[] }>;
}) {
  const query = await searchParams;
  const initialMarket: SpreadMarket = query.market === "crypto" || query.market === "metals" ? query.market : "india";
  const initialRoot = typeof query.underlying === "string" ? query.underlying : "";
  const initialExpiry = typeof query.expiry === "string" ? query.expiry : "";
  return <OptionSpreadBuilder key={JSON.stringify([initialMarket, initialRoot, initialExpiry])}
    initialMarket={initialMarket} initialRoot={initialRoot} initialExpiry={initialExpiry} />;
}
