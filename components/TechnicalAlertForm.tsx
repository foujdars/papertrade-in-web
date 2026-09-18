"use client";
import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { ModernSelect } from "./ModernSelect";
import type { Instrument } from "@/lib/market";
import { defaultTechnicalConfig, TECHNICAL_FAMILIES, TECHNICAL_FRAMES, technicalChoices, technicalDescription, type TechnicalConfig, type TechnicalFamily, type TechnicalFrame, type TechnicalRule } from "@/lib/technical-alerts";

export function TechnicalAlertForm({ instrument, timeframe, editing, onSave, onDone }: { instrument: Instrument; timeframe: string; editing?: TechnicalRule; onSave: (config: TechnicalConfig, instrument: Instrument, editing?: TechnicalRule) => Promise<string | null>; onDone: () => void }) {
  const [config, setConfig] = useState<TechnicalConfig>(() => editing ?? defaultTechnicalConfig("ema", Object.hasOwn(TECHNICAL_FRAMES, timeframe) ? timeframe as TechnicalFrame : "5m"));
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const update = <K extends keyof TechnicalConfig>(key: K, value: TechnicalConfig[K]) => setConfig(c => ({ ...c, [key]: value }));
  const number = (key: "period" | "slow" | "signal" | "threshold" | "multiplier" | "cooldown", label: string, min: number, max: number, step = 1) => <label key={key}>{label}<input type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isNaN(config[key]) ? "" : config[key]} onChange={e => update(key, e.target.value === "" ? NaN : Number(e.target.value))} /></label>;
  return <form className="technical-alert-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const failure = await onSave(config, instrument, editing); if (failure) setError(failure); else onDone(); } finally { setBusy(false); } }}>
    <div className="technical-intro"><Activity size={20} /><div><h3>{editing ? "Edit technical alert" : "Watch a technical condition"}</h3><p>{instrument.symbol} · saved independently of your chart settings</p></div></div>
    <div className="price-form-grid"><ModernSelect label="Indicator" value={config.family} choices={Object.entries(TECHNICAL_FAMILIES).map(([value, label]) => ({ value: value as TechnicalFamily, label }))} onChange={family => setConfig(c => ({ ...defaultTechnicalConfig(family, c.timeframe), repeat: c.repeat, cooldown: c.cooldown, days: c.days }))} /><ModernSelect label="Alert timeframe" value={config.timeframe} choices={Object.keys(TECHNICAL_FRAMES).map(value => ({ value: value as TechnicalFrame, label: value }))} onChange={value => update("timeframe", value)} /></div>
    <ModernSelect label="Trigger condition" value={config.condition} choices={technicalChoices(config.family)} onChange={value => update("condition", value)} />
    <div className="price-form-grid">
      {!["vwap", "previousDay"].includes(config.family) && number("period", config.family === "macd" || config.condition.startsWith("average") ? "Fast period" : config.family === "supertrend" ? "ATR period" : "Period", 2, 200)}
      {(config.family === "macd" || config.condition.startsWith("average")) && number("slow", "Slow period", 2, 200)}
      {config.family === "macd" && number("signal", "Signal period", 2, 200)}
      {config.family === "rsi" && number("threshold", "RSI threshold", 0.1, 99.9, 0.1)}
      {["supertrend", "bollinger"].includes(config.family) && number("multiplier", config.family === "bollinger" ? "Standard deviations" : "ATR multiplier", 0.1, 10, 0.1)}
    </div>
    {config.family === "vwap" && <p>Session resets at 09:15 IST. Requires intraday candles with actual traded volume; not available for indices.</p>}
    {config.family === "macd" && <p>A MACD/signal cross and its histogram zero cross are equivalent events. Choose one to avoid redundant alerts.</p>}
    <div className="price-form-grid"><ModernSelect label="Frequency" value={config.repeat} choices={[{ value: "once", label: "Once only" }, { value: "repeat", label: "Each new crossing" }]} onChange={value => update("repeat", value)} /><ModernSelect label="Expires after" value={String(config.days)} choices={[{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} onChange={value => update("days", Number(value))} /></div>
    {config.repeat === "repeat" && number("cooldown", "Minimum minutes between alerts", 0, 1440)}
    <div className="technical-summary"><ShieldCheck size={18} /><div><b>Confirmed candle close only</b><p>{technicalDescription(config)} · {config.timeframe}</p><small>New signals only. Editing or resuming starts a fresh watch; past signals are not replayed.</small></div></div>
    <p>Checked about every 30 seconds while the app is visible and online. Alerts appear in List / Log and the notification centre. No closed-app delivery or automatic orders. Saved on this device for your account.</p>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy} className="price-action-primary">{busy ? "Saving…" : editing ? "Save technical alert" : "Create technical alert"}</button>
  </form>;
}
