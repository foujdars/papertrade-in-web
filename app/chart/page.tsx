import { redirect } from "next/navigation";

export default async function AdvancedChartPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; timeframe?: string }>;
}) {
  const query = await searchParams;
  const symbol = (query.symbol ?? "RELIANCE").toUpperCase();
  const timeframe = query.timeframe ? `&timeframe=${encodeURIComponent(query.timeframe)}` : "";
  redirect(`/?symbol=${encodeURIComponent(symbol)}${timeframe}`);
}
