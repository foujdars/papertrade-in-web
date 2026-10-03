"use client";
import { useMemo } from "react";
import type { PerpAccount, PerpQuote } from "@/lib/global-markets";
import { equityMetrics, portfolioRisk, type EquitySample } from "@/lib/portfolio-risk";
import { formatUsd } from "@/lib/global-order-engine";
export function EquityHistory({ samples, currency = "USD", benchmark = "BTC buy & hold", currentEquity }: { samples: EquitySample[]; currency?: "USD" | "INR"; benchmark?: string; currentEquity?: number | null }) {
  const metrics = useMemo(() => equityMetrics(samples), [samples]);
  const money = (n: number) => currency === "USD" ? formatUsd(n) : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  const values = samples.map(p => p.equity), lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const points = samples.map((p, i) => `${20 + i / Math.max(1, samples.length - 1) * 560},${130 - (p.equity - lo) / span * 100}`).join(" ");
  return <section className="research-card equity-history" aria-label={`${currency} portfolio equity history`}>
    <h3>Portfolio equity · {currency}</h3>
    <div className="research-metrics"><span>Equity including open P&L<b>{currentEquity !== null && currentEquity !== undefined ? money(currentEquity) : "Fresh marks needed"}</b></span><span>Observed max drawdown<b>{metrics.count ? `${metrics.maxDrawdownPercent.toFixed(2)}%` : "—"}</b></span><span>Return since first observation<b>{metrics.count > 1 ? `${metrics.returnPercent?.toFixed(2)}%` : "—"}</b></span><span>{benchmark}<b>{metrics.benchmarkReturn === null ? "—" : `${metrics.benchmarkReturn.toFixed(2)}%`}</b></span></div>
    {samples.length > 1 ? <><svg viewBox="0 0 600 155" role="img" aria-label={`Daily observed portfolio equity from ${samples[0].day} to ${samples.at(-1)!.day}`}><polyline points={points} fill="none" stroke="var(--purple)" strokeWidth="3" /><text x="20" y="151">{samples[0].day}</text><text x="580" y="151" textAnchor="end">{samples.at(-1)!.day}</text></svg><details><summary>{samples.length} daily observations</summary><div className="research-table-wrap"><table><thead><tr><th>Date (IST)</th><th>Equity</th><th>Wallet</th><th>Benchmark</th></tr></thead><tbody>{samples.slice(-30).reverse().map(p => <tr key={p.day}><td>{p.day}</td><td>{money(p.equity)}</td><td>{money(p.wallet)}</td><td>{p.benchmark === null ? "—" : p.benchmark.toFixed(2)}</td></tr>)}</tbody></table></div></details></> : <p>Daily history begins with this update. Open the app on later days to add observations.</p>}
    <p className="research-help">Observations are saved while the app monitors fresh prices, including fees already paid and open P&L. Missing days are not filled in. This whole-wallet history is separate from closed-trade filters. Benchmark returns use matching observation dates{metrics.comparableReturn !== null ? `; portfolio return over those dates: ${metrics.comparableReturn.toFixed(2)}%` : ""}.</p>
  </section>;
}
export function PortfolioEquity({ account, quotes, now }: { account: PerpAccount; quotes: Partial<Record<string, PerpQuote>>; now: number }) {
  const stats = portfolioRisk(account, quotes, now);
  return <EquityHistory samples={account.equitySamples ?? []} currentEquity={stats.missing || stats.unsupported ? null : stats.equity} />;
}
