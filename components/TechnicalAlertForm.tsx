"use client";
import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { ModernSelect } from "./ModernSelect";
import type { Instrument } from "@/lib/market";
import { defaultTechnicalConfig, TECHNICAL_FAMILIES, TECHNICAL_FRAMES, technicalChoices, technicalDescription, type TechnicalConfig, type TechnicalFamily, type TechnicalFrame, type TechnicalRule } from "@/lib/technical-alerts";

export function TechnicalAlertForm({ instrument, timeframe, editing, onSave, onDone, onEnablePush }: { instrument: Instrument; timeframe: string; editing?: TechnicalRule; onSave: (config: TechnicalConfig, instrument: Instrument, editing?: TechnicalRule) => Promise<string | null>; onDone: () => void; cloudReady?: boolean; cloudMessage?: string; onEnablePush?: () => Promise<string | null> }) {
  const [config, setConfig] = useState<TechnicalConfig>(() => editing ?? { ...defaultTechnicalConfig("ema", Object.hasOwn(TECHNICAL_FRAMES, timeframe) ? timeframe as TechnicalFrame : "5m"), delivery: "server" });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const update = <K extends keyof TechnicalConfig>(key: K, value: TechnicalConfig[K]) => setConfig(c => ({ ...c, [key]: value }));
  const number = (key: "period" | "slow" | "signal" | "threshold" | "multiplier" | "cooldown", label: string, min: number, max: number, step = 1) => <label key={key}>{label}<input type="number" inputMode="decimal" min={min} max={max} step={step} value={Number.isNaN(config[key]) ? "" : config[key]} onChange={e => update(key, e.target.value === "" ? NaN : Number(e.target.value))} /></label>;
  return <form className="technical-alert-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onEnablePush?.(); const failure = await onSave(config, instrument, editing); if (failure) setError(/sign in/i.test(failure) ? "Sign in so this alert can ping you when the app is closed 😊" : failure); else onDone(); } finally { setBusy(false); } }}>
    <div className="technical-intro"><Activity size={20} /><div><h3>{editing ? "Edit technical alert" : "Watch a technical condition"}</h3><p>{instrument.symbol} · saved independently of your chart settings</p></div></div>
    <p>{editing && editing.delivery !== "server" ? "This one stays on this device while the app is open." : "We'll ping you even when the app is closed 😊"}</p>
    {config.family !== "price" && <div className="price-form-grid"><ModernSelect label="Indicator" value={config.family} choices={Object.entries(TECHNICAL_FAMILIES).filter(([value]) => value !== "price").map(([value, label]) => ({ value: value as TechnicalFamily, label }))} onChange={family => setConfig(c => ({ ...defaultTechnicalConfig(family, c.timeframe), repeat: c.repeat, cooldown: c.cooldown, days: c.days, delivery: c.delivery === "device" ? "device" : "server" }))} /><ModernSelect label="Alert timeframe" value={config.timeframe} choices={Object.keys(TECHNICAL_FRAMES).map(value => ({ value: value as TechnicalFrame, label: value }))} onChange={value => update("timeframe", value)} /></div>}
    <ModernSelect label="Trigger condition" value={config.condition} choices={technicalChoices(config.family)} onChange={value => setConfig(c => ({ ...c, condition: value, ...(c.family === "volume" ? { multiplier: value === "dry" ? 0.5 : 2 } : {}) }))} />
    <div className="price-form-grid">
      {!["vwap", "previousDay", "price"].includes(config.family) && number("period", config.family === "macd" || config.condition.startsWith("average") ? "Fast period" : config.family === "supertrend" ? "ATR period" : config.family === "psbb" ? "RSI length" : "Period", 2, 200)}
      {(config.family === "macd" || config.condition.startsWith("average")) && number("slow", "Slow period", 2, 200)}
      {config.family === "macd" && number("signal", "Signal period", 2, 200)}
      {config.family === "price" && number("threshold", "Alert price (₹)", .01, 1e9, .01)}
      {(config.family === "rsi" || config.family === "psbb") && number("threshold", config.family === "psbb" ? "Overbought" : "RSI threshold", config.family === "psbb" ? 50 : 0.1, config.family === "psbb" ? 99 : 99.9, 0.1)}
      {["supertrend", "bollinger", "volume"].includes(config.family) && number("multiplier", config.family === "volume" ? "Volume multiplier (× average)" : config.family === "bollinger" ? "Standard deviations" : "ATR multiplier", 0.1, 10, 0.1)}
    </div>
    {config.family === "psbb" && <p>Fires when a regular RSI divergence is confirmed on a closed candle. Bullish is a lower price low with a higher RSI low. Bearish is a higher price high with a lower RSI high. Oversold stays at 30. Timeframes are 1m, 5m, 15m, 1H and 1D.</p>}
    {config.family === "vwap" && <p>Session resets at 09:15 IST. Requires intraday candles with actual traded volume; not available for indices.</p>}
    {config.family === "volume" && <p>Compares each completed candle with the preceding {config.period} candles, excluding itself. Fires when the condition becomes true, not on every candle that stays above/below it. Bullish/bearish means close above/below open, not buy/sell volume. Zero or missing volume is ignored. Intraday baselines can span sessions and are not time-of-day adjusted.</p>}
    {config.family === "macd" && <p>A MACD/signal cross and its histogram zero cross are equivalent events. Choose one to avoid redundant alerts.</p>}
    <div className="price-form-grid">{config.family !== "price" && <ModernSelect label="Frequency" value={config.repeat} choices={[{ value: "once", label: "Once only" }, { value: "repeat", label: "Each new crossing" }]} onChange={value => update("repeat", value)} />}<ModernSelect label="Expires after" value={String(config.days)} choices={[{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} onChange={value => update("days", Number(value))} /></div>
    {config.repeat === "repeat" && number("cooldown", "Minimum minutes between alerts", 0, 1440)}
    <div className="technical-summary"><ShieldCheck size={18} /><div><b>{config.family === "price" ? "Fresh quote · approximately once a minute" : "Confirmed candle close only"}</b><p>{technicalDescription(config)} · {config.timeframe}</p><small>{config.family === "price" ? "Once only. Brief price touches between checks may be missed. No automatic orders." : "New signals only. Editing or resuming starts a fresh watch; past signals are not replayed."}</small></div></div>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy} className="price-action-primary">{busy ? "Saving…" : editing ? "Save technical alert" : "Create technical alert"}</button>
  </form>;
}
