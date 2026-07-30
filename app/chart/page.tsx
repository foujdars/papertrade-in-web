import type { Metadata } from "next";
import { AdvancedChartWorkspace } from "@/components/AdvancedChartWorkspace";

export const metadata: Metadata = {
  title: "Advanced NSE Chart",
  description: "Full-screen KLineChart paper-trading workspace with EMA, RSI and professional drawing tools.",
};

export default async function AdvancedChartPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; timeframe?: string }>;
}) {
  const query = await searchParams;
  return (
    <AdvancedChartWorkspace
      initialSymbol={(query.symbol ?? "RELIANCE").toUpperCase()}
      initialTimeframe={query.timeframe ?? "5m"}
    />
  );
}
