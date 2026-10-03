"use client";
import { useState } from "react";
import { defaultWalletRisk, portfolioRisk, validateWalletRisk, type WalletRisk } from "@/lib/portfolio-risk";
import type { GlobalTrading } from "./useGlobalTrading";
import { formatUsd } from "@/lib/global-order-engine";
export function WalletRiskSettings({ trading }: { trading: GlobalTrading }) {
  const [limits, setLimits] = useState<WalletRisk>(trading.account?.riskLimits ?? defaultWalletRisk()), [message, setMessage] = useState("");
  const quotes = Object.fromEntries(Object.entries(trading.snapshots).map(([s, v]) => [s, v?.quote]));
  const stats = trading.account ? portfolioRisk(trading.account, quotes, trading.clock) : null;
  const fields = [["maxDailyLoss", "Combined daily loss (USD)", 100000, .01], ["maxDailyEntries", "Combined daily entries", 1000, 1], ["maxOpenRiskPercent", "Open risk / equity (%)", 100, .1], ["maxConcentrationPercent", "Asset notional / equity (%)", 100, 1], ["maxDrawdownPercent", "Drawdown pause (%)", 100, .1]] as const;
  return <details className="research-card wallet-risk"><summary>Wallet risk limits · {trading.account?.riskLimits?.enabled ? "On" : "Off"}</summary><form onSubmit={async e => { e.preventDefault(); setMessage(""); try { validateWalletRisk(limits); const ok = await trading.transact((a, data) => { const s = portfolioRisk(a, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v?.quote])), Date.now()); if (limits.enabled && (s.missing || s.unsupported || s.unprotected || a.orders.some(o => !o.reduceOnly))) throw new Error("Review stale prices, option exposure, unprotected positions and pending entries before enabling wallet limits."); return { ...a, revision: a.revision + 1, riskLimits: limits, equityPeak: Math.max(a.equityPeak ?? s.equity, s.equity) }; }); if (ok) setMessage("Wallet limits saved."); } catch (err) { setMessage(err instanceof Error ? err.message : "Check wallet limits."); } }}>
    <label className="research-check"><input type="checkbox" checked={limits.enabled} onChange={e => setLimits(r => ({ ...r, enabled: e.target.checked }))} /> Apply limits to bot and manual perpetual entries</label>
    <div className="bot-fields">{fields.map(([key, label, max, step]) => <label key={key}>{label}<input required type="number" min={step} max={max} step={step} value={limits[key]} onChange={e => setLimits(r => ({ ...r, [key]: Number(e.target.value) }))} /></label>)}</div>
    {stats && <p>Combined entries today: {stats.entries} · Net today: {formatUsd(stats.dailyNet)} · Open stop risk: {stats.missing ? "fresh marks needed" : formatUsd(stats.openRisk)} · Peak drawdown: {stats.missing ? "—" : `${stats.drawdownPercent.toFixed(2)}%`}</p>}
    <p className="research-help">Stops estimate risk; gaps can lose more. Limits pause new entries and keep exits available. New option exposure is paused while wallet risk mode is on because its risk requires a separate model. Existing positions are not force-closed.</p>
    <button type="submit" disabled={!trading.account || trading.busy}>Save wallet limits</button>{message && <p role="status">{message}</p>}
  </form></details>;
}
