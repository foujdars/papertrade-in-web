"use client";
import { useEffect, useRef, useState } from "react";
import { BOT_FRAMES, type BotConfig } from "@/lib/paper-bot-state";
import { backtestBot } from "@/lib/bot-backtest";
import type { GlobalTrading } from "./useGlobalTrading";
import { formatUsd } from "@/lib/global-order-engine";
type Report = ReturnType<typeof backtestBot>;
export function BotBacktestPanel({ config, trading }: { config: BotConfig; trading: GlobalTrading }) {
  const [initialEquity, setInitialEquity] = useState(10000), [spread, setSpread] = useState(2), [slippage, setSlippage] = useState(2), [bars, setBars] = useState(600);
  const [report, setReport] = useState<{ enhanced: Report; baseline: Report; signature: string } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const signature = JSON.stringify([config, initialEquity, spread, slippage, bars, trading.account?.riskLimits]);
  const run = async () => {
    setError(""); setBusy(true); setReport(null); const controller = new AbortController(); controllerRef.current?.abort(); controllerRef.current = controller;
    try {
      const seconds = BOT_FRAMES[config.timeframe], fetched: import("@/lib/market").Candle[] = []; let before = "";
      for (let page = 0; page < Math.ceil(bars / 600); page++) {
        const r = await fetch(`/api/global-markets?mode=candles&symbol=${config.symbol}&timeframe=${config.timeframe}${before ? `&before=${before}` : ""}`, { signal: controller.signal, cache: "no-store" }), data = await r.json();
        if (!r.ok || !data.ok || !Array.isArray(data.candles)) throw new Error(data.error ?? "Historical candles unavailable.");
        const rows = data.candles.filter((c: { time: number }) => c.time + seconds <= Date.now() / 1000); if (!rows.length) break;
        fetched.push(...rows); before = String(Math.min(...rows.map((c: { time: number }) => c.time)));
      }
      const specResponse = await fetch(`/api/global-markets?symbol=${config.symbol}`, { signal: controller.signal, cache: "no-store" }), snapshot = await specResponse.json();
      if (!specResponse.ok || !snapshot.ok || !snapshot.spec) throw new Error("Contract rules unavailable.");
      const unique = [...new Map(fetched.map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time).slice(-bars);
      const options = { initialEquity, spreadBps: spread, slippageBps: slippage, riskLimits: trading.account?.riskLimits };
      const enhanced = backtestBot(config, unique, snapshot.spec, options);
      const baselineConfig = { ...config, sizingMode: "notional" as const, stopMode: "percent" as const, breakEvenR: 0, trailAtr: 0, firstExitPercent: 0, secondExitPercent: 0, regimeFilter: "any" as const };
      const baseline = backtestBot(baselineConfig, unique, snapshot.spec, { ...options, riskLimits: undefined });
      if (!controller.signal.aborted) setReport({ enhanced, baseline, signature });
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Backtest failed."); }
    finally { if (controllerRef.current === controller) setBusy(false); }
  };
  return <details className="research-card bot-backtest"><summary>Backtest & compare this strategy</summary><div className="bot-fields"><label>Starting equity (USD)<input type="number" min="1" max="10000000" value={initialEquity} onChange={e => setInitialEquity(Number(e.target.value))} /></label><label>Historical candles<select value={bars} onChange={e => setBars(Number(e.target.value))}><option value={600}>600</option><option value={1800}>1,800</option><option value={3000}>3,000</option></select></label><label>Assumed spread (bps)<input type="number" min="0" max="100" value={spread} onChange={e => setSpread(Number(e.target.value))} /></label><label>Slippage per side (bps)<input type="number" min="0" max="100" value={slippage} onChange={e => setSlippage(Number(e.target.value))} /></label></div>
    <button type="button" onClick={() => void run()} disabled={busy}>{busy ? "Testing history…" : "Run historical comparison"}</button>{error && <p role="alert">{error}</p>}
    {report && <>{signature !== report.signature && <p role="status">Settings changed. Run again to compare the current settings.</p>}<div className="research-table-wrap"><table><thead><tr><th>Metric</th><th>These settings</th><th>Original policy</th></tr></thead><tbody>{[["Net after fees", formatUsd(report.enhanced.net), formatUsd(report.baseline.net)], ["Completed trades", report.enhanced.trades, report.baseline.trades], ["Win rate", report.enhanced.winRate === null ? "—" : `${report.enhanced.winRate.toFixed(1)}%`, report.baseline.winRate === null ? "—" : `${report.baseline.winRate.toFixed(1)}%`], ["Max equity drawdown", `${report.enhanced.maxDrawdownPercent.toFixed(2)}%`, `${report.baseline.maxDrawdownPercent.toFixed(2)}%`], ["Fees", formatUsd(report.enhanced.costs), formatUsd(report.baseline.costs)], ["Profit factor", report.enhanced.profitFactor?.toFixed(2) ?? "No losing trades / insufficient data", report.baseline.profitFactor?.toFixed(2) ?? "No losing trades / insufficient data"]].map(([label, enhanced, baseline]) => <tr key={label}><th>{label}</th><td>{enhanced}</td><td>{baseline}</td></tr>)}</tbody></table></div><p>{report.enhanced.curve.length} tested candles · Buy & hold: {report.enhanced.benchmarkReturnPercent?.toFixed(2)}%</p><details><summary>Entry decisions</summary><ul>{Object.entries(report.enhanced.rejected).map(([reason, count]) => <li key={reason}>{reason}: {count}</li>)}</ul></details><p className="research-help">{report.enhanced.assumptions}</p></>}
    <p className="research-help">Original policy keeps the same entry parameters with fixed notional, percentage stop/target, and no new filters or wallet limits. This comparison isolates the combined changes; it does not prove future performance. Historical runs use a separate temporary wallet.</p>
  </details>;
}
