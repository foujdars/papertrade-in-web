"use client";
import { useState } from "react";
import { Bot, Pause, Play, ShieldCheck, X } from "lucide-react";
import { BOT_ASSETS, BOT_FRAMES, BOT_STRATEGIES, BOT_RULES, botFrames, botPreset, botScope, configureBot, defaultBot, validateBotConfig, type BotConfig, type BotSymbol, type BotFrame, type PaperBot } from "@/lib/paper-bot-state";
import { botDailyStats, botSignal, botOrderPlan, botTrendAllows, type BotObservation } from "@/lib/paper-bot-engine";
import { closePerp, freshPerpQuote, positionPnl } from "@/lib/global-markets";
import { formatUsd } from "@/lib/global-order-engine";
import type { GlobalTrading } from "./useGlobalTrading";

export function BotWorkspace({ trading, onClose, onPnl }: { trading: GlobalTrading; onClose: () => void; onPnl: () => void }) {
  const [symbol, setSymbol] = useState<BotSymbol>("BTCUSD");
  const [notice, setNotice] = useState("");
  const account = trading.account;
  const bots = account?.bots ?? [];
  const selected = bots.find(b => b.symbol === symbol);
  const snapshot = trading.snapshots[symbol];
  const currentPosition = account?.positions.find(p => p.symbol === symbol);
  const daily = account ? botDailyStats(account, symbol, trading.clock) : { entries: 0, net: 0 };
  const pause = async (all = false) => {
    const saved = await trading.transact(a => ({ ...a, revision: a.revision + 1, bots: (a.bots ?? []).map(b => all || b.symbol === symbol ? { ...b, enabled: false, status: "Paused · existing positions keep their TP/SL" } : b) }));
    if (saved) setNotice(all ? "All bots paused. Open positions keep their stop loss and target." : "Bot paused. Open positions keep their stop loss and target.");
  };
  const close = async () => {
    const saved = await trading.transact((a, snapshots) => {
      const p = a.positions.find(p => p.symbol === symbol && p.botId === symbol), live = snapshots[symbol];
      if (!p || !live) throw new Error("Waiting for the bot position and a fresh quote.");
      const next = closePerp(a, symbol, live.quote, p.contracts, Date.now(), "CLOSE", "Bot · manual close");
      return { ...next, bots: next.bots?.map(b => b.symbol === symbol ? { ...b, enabled: false, status: "Paused · position closed" } : b) };
    });
    if (saved) setNotice("Position closed and this bot paused.");
  };
  return <div className="modal-backdrop navigation-page-backdrop">
    <section className="modal navigation-page bot-workspace" aria-label="Automatic paper trading bot">
      <div className="modal-head"><div><span className="eyebrow">Strategy automation · virtual trades</span><h2><Bot size={25} /> Paper trading bot</h2></div><button className="icon-button" onClick={onClose} aria-label="Close bot"><X size={20} /></button></div>
      <div className="bot-intro"><p>Define a strategy and let the bot place protected paper trades in your existing USD wallet.</p><span><ShieldCheck size={15} /> Public market data · no API key or paid bot service</span></div>
      <div className="bot-runtime"><b>{bots.filter(b => b.enabled).length} bots enabled</b><span>Runs while this app is open and visible. Browser backgrounding, closing the app, or sleep pauses monitoring. Returning observes current prices; missed fills are not replayed.</span><button onClick={() => void pause(true)} disabled={trading.busy || !bots.some(b => b.enabled)}><Pause size={15} /> Pause all</button></div>
      <div className="bot-assets" role="group" aria-label="Bot asset">
        {(Object.keys(BOT_ASSETS) as BotSymbol[]).map(asset => {
          const q = trading.snapshots[asset]?.quote, live = freshPerpQuote(q, trading.clock);
          const b = bots.find(b => b.symbol === asset);
          return <button key={asset} className={asset === symbol ? "active" : ""} aria-pressed={asset === symbol} onClick={() => { setSymbol(asset); setNotice(""); }}><span>{BOT_ASSETS[asset]}</span><b>{q ? formatUsd(q.mark) : "—"}</b><small className={live ? "positive" : ""}>{live ? "Live" : "Waiting for live data"} · {b?.enabled ? "Bot enabled" : "Paused"}</small>{q && <small>Updated {new Date(q.at).toLocaleTimeString("en-IN")}</small>}</button>;
        })}
      </div>
      {(notice || trading.error) && <p className="bot-notice" role="status">{trading.error || notice}</p>}
      <div className="bot-layout">
        <BotSettings key={`${symbol}:${selected?.startedAt ?? 0}`} bot={selected ?? defaultBot(symbol)} trading={trading} onSaved={() => setNotice("Settings saved. Each selected timeframe is watching for a new completed candle.")} />
        <aside className="bot-monitor">
          <div className="bot-card"><span className="eyebrow">Engine status</span><h3>{BOT_ASSETS[symbol]}</h3><p role="status">{selected?.status ?? "Choose your settings, then start the bot."}</p><dl><div><dt>Paper wallet</dt><dd>{account ? formatUsd(account.wallet) : "Loading…"}</dd></div><div><dt>Entries today (India)</dt><dd>{daily.entries} / {selected?.maxEntries ?? 5}</dd></div><div><dt>Realised net today + entry fees</dt><dd className={daily.net >= 0 ? "positive" : "negative"}>{formatUsd(daily.net)}</dd></div><div><dt>Last candle evaluated</dt><dd>{selected?.lastCandle ? new Date(selected.lastCandle * 1000).toLocaleString("en-IN") : "—"}</dd></div></dl><button onClick={() => void pause()} disabled={!selected?.enabled || trading.busy}><Pause size={15} /> Pause this bot</button></div>
          <div className="bot-card"><span className="eyebrow">Current position</span>{currentPosition ? <><h3>{currentPosition.side === "BUY" ? "Long" : "Short"} · {currentPosition.contracts} lots</h3><p>{currentPosition.botId ? "Bot paper trade" : "Existing paper position · bot will wait"}</p><dl><div><dt>Entry</dt><dd>{formatUsd(currentPosition.entry)}</dd></div><div><dt>Open P&L before exit fees</dt><dd>{snapshot ? formatUsd(positionPnl(currentPosition, snapshot.quote.mark)) : "—"}</dd></div><div><dt>Stop loss</dt><dd>{currentPosition.protection?.stopLoss?.trigger ? formatUsd(currentPosition.protection.stopLoss.trigger) : "—"}</dd></div><div><dt>Take profit</dt><dd>{currentPosition.protection?.takeProfit?.trigger ? formatUsd(currentPosition.protection.takeProfit.trigger) : "—"}</dd></div></dl>{currentPosition.botId === symbol && <button disabled={trading.busy || !freshPerpQuote(snapshot?.quote, trading.clock)} onClick={() => void close()}>Close position & pause</button>}</> : <p>No open position. The bot waits for a new entry signal.</p>}<button onClick={onPnl}>View Global P&L</button></div>
          <div className="bot-card bot-frame-monitor"><h3>Timeframe monitor</h3>{selected ? <ul>{botFrames(selected).map(frame => <li key={frame}><b>{frame}</b><span>{selected.frameStatus?.[frame] ?? "Waiting for a new candle"}</span></li>)}</ul> : <p>Save your strategy to start monitoring each chosen timeframe.</p>}{selected?.trendTimeframe && selected.trendTimeframe !== "off" && <p>Trend gate: {selected.trendTimeframe} EMA {selected.trendPeriod ?? 21}. Longs require a close above EMA; shorts require a close below.</p>}</div>
          <div className="bot-card bot-help"><h3>How entries work</h3><p>Select up to four entry timeframes. Each completed candle is evaluated once across browser tabs. Same-direction signals favour the highest timeframe; conflicting signals skip entry. One position per asset; existing orders or positions block new entries.</p><p>Stops and targets use live observed prices. Daily loss limits block new entries after realised losses and fees reach the limit; they do not close positions or cap total losses.</p><p>Gold uses the XAUTUSD tokenised gold perpetual, rather than a spot-gold quote. Settings and trades are saved on this browser for this account.</p></div>
        <div className="bot-card bot-decisions"><h3>Strategy decision log</h3>{!selected?.decisions?.length ? <p>New candle decisions and skipped entries will appear here.</p> : <ol>{selected.decisions.slice(-12).reverse().map((d, i) => <li key={`${d.at}:${d.timeframe}:${i}`}><b>{d.timeframe} · {d.side === "BUY" ? "Long" : d.side === "SELL" ? "Short" : "No signal"} · {d.outcome}</b><p>{d.reason}</p><small>{new Date(d.at).toLocaleString("en-IN")} · candle {new Date(d.candle * 1000).toLocaleTimeString("en-IN")}</small></li>)}</ol>}</div>
        </aside>
      </div>
      <div className="bot-card bot-activity"><h3>Bot activity</h3>{!account?.events.some(e => e.botId) ? <p>Automatic entries and exits will appear here and in Global P&L.</p> : <ul>{account.events.filter(e => e.botId).slice(-20).reverse().map(e => <li key={e.id}><div><b>{e.symbol} · {e.kind}</b><small>{new Date(e.at).toLocaleString("en-IN")} · {e.detail}</small></div><span>{e.contracts} lots @ {formatUsd(e.price)}<small>Net {formatUsd(e.pnl - e.fee)}</small></span></li>)}</ul>}</div>
    </section>
  </div>;
}

function BotSettings({ bot, trading, onSaved }: { bot: PaperBot; trading: GlobalTrading; onSaved: () => void }) {
  const [config, setConfig] = useState<BotConfig>(bot);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const update = (fn: (current: BotConfig) => BotConfig) => { setConfig(fn); setPreview([]); setError(""); };
  type NumericField = "fast" | "slow" | "period" | "oversold" | "overbought" | "notional" | "leverage" | "stopPercent" | "targetPercent" | "maxEntries" | "maxDailyLoss" | "cooldown" | "trendPeriod" | "riskUsd" | "riskReward" | "stopBufferTicks";
  const field = (key: NumericField, label: string, min: number, max: number, step = 1) => <label>{label}<input type="number" required min={min} max={max} step={step} value={Number.isFinite(config[key]) ? config[key] : ""} onChange={e => update(c => ({ ...c, [key]: e.target.value === "" ? NaN : Number(e.target.value) }))} /></label>;
  const frames = botFrames(config);
  const toggleFrame = (frame: BotFrame) => update(c => {
    const current = botFrames(c), selected = current.includes(frame) ? current.filter(f => f !== frame) : [...current, frame];
    if (!selected.length || selected.length > 4) return c;
    selected.sort((a, b) => BOT_FRAMES[a] - BOT_FRAMES[b]);
    return { ...c, timeframe: selected[0], timeframes: selected, trendTimeframe: c.trendTimeframe && c.trendTimeframe !== "off" && BOT_FRAMES[c.trendTimeframe] <= Math.max(...selected.map(f => BOT_FRAMES[f])) ? "off" : c.trendTimeframe };
  });
  const handleCheckSetup = async () => {
    setChecking(true); setError(""); setPreview([]);
    try {
      const candidate = { ...defaultBot(config.symbol), ...config, startedAt: 0 };
      validateBotConfig(config);
      const scopes = [...frames, ...(config.trendTimeframe && config.trendTimeframe !== "off" ? [config.trendTimeframe] : [])];
      const histories: Record<string, BotObservation> = {};
      const failures: Record<string, string> = {};
      await Promise.all(scopes.map(async frame => {
        try {
          const response = await fetch(`/api/global-markets?mode=candles&symbol=${config.symbol}&timeframe=${frame}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
          const data = await response.json();
          if (!response.ok || !data.ok || !Array.isArray(data.candles)) throw new Error("Candle history unavailable");
          histories[botScope(config.symbol, frame)] = { candles: data.candles, fetchedAt: data.fetchedAt };
        } catch (e) { failures[frame] = e instanceof Error ? e.message : "History unavailable"; }
      }));
      // This handler runs only on a click; freshness needs the time after the fetch.
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();
      setPreview(frames.map(frame => {
        try {
          if (failures[frame]) throw new Error(failures[frame]);
          const history = histories[botScope(config.symbol, frame)];
          if (!history || !Number.isFinite(history.fetchedAt) || now - history.fetchedAt > 30000 || history.fetchedAt > now + 5000) throw new Error("Waiting for fresh candle history");
          const signal = botSignal(candidate, history.candles, now, frame);
          if (!signal.side) return `${frame}: ${signal.reason}`;
          const snapshot = trading.snapshots[config.symbol];
          if (!freshPerpQuote(snapshot?.quote, now)) return `${frame}: ${signal.reason}. Waiting for a fresh quote to preview sizing.`;
          const filter = botTrendAllows(candidate, signal.side, histories[botScope(config.symbol, config.trendTimeframe as BotFrame)], now);
          if (!filter) return `${frame}: signal blocked by ${config.trendTimeframe} EMA trend filter`;
          const plan = botOrderPlan(candidate, signal, snapshot!.quote, snapshot!.spec);
          return `${frame}: ${signal.reason}. Preview ${plan.contracts} lots, stop ${formatUsd(plan.stop)}, target ${formatUsd(plan.target)}, planned stop risk ${formatUsd(plan.plannedRisk)} before fees.`;
        } catch (e) { return `${frame}: ${e instanceof Error ? e.message : "Setup unavailable"}`; }
      }));
    } catch (e) { setError(e instanceof Error ? e.message : "Check the strategy settings."); }
    finally { setChecking(false); }
  };
  return <form className="bot-card bot-settings" onSubmit={async e => {
    e.preventDefault(); setError("");
    try {
      configureBot(bot, config, true, Date.now());
      const saved = await trading.transact(a => {
        const next = configureBot(a.bots?.find(b => b.symbol === config.symbol), config, true, Date.now());
        return { ...a, revision: a.revision + 1, bots: [...(a.bots ?? []).filter(b => b.symbol !== config.symbol), next] };
      });
      if (saved) onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Check the strategy settings."); }
  }}>
    <span className="eyebrow">Strategy builder</span><h3>Configure {BOT_ASSETS[config.symbol]}</h3>
    <fieldset className="bot-editor" disabled={checking || trading.busy}>
    <div className="bot-presets" aria-label="Your EMA strategy presets"><button type="button" onClick={() => update(c => botPreset(c, "ema21"))}>Use my EMA 21</button><button type="button" onClick={() => update(c => botPreset(c, "ema5"))}>Use my EMA 5 reversal</button></div>
    <div className="bot-fields"><label>Strategy<select aria-label="Strategy" value={config.strategy} onChange={e => update(c => ({ ...c, strategy: e.target.value as BotConfig["strategy"], direction: e.target.value === "ema5" ? "long" : c.direction }))}>{Object.entries(BOT_STRATEGIES).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label>
      <label>Trade direction<select aria-label="Trade direction" value={config.direction} onChange={e => update(c => ({ ...c, direction: e.target.value as BotConfig["direction"] }))}><option value="both">Long & short{config.strategy === "ema5" ? " (mirrored short)" : ""}</option><option value="long">Long only</option><option value="short">Short only{config.strategy === "ema5" ? " (mirrored setup)" : ""}</option></select></label>
      {config.strategy === "ema" && <>{field("fast", "Fast EMA period", 2, 99)}{field("slow", "Slow EMA period", 3, 100)}</>}
      {(config.strategy === "rsi" || config.strategy === "breakout") && <>{field("period", config.strategy === "rsi" ? "RSI period" : "Breakout lookback", 2, 100)}{config.strategy === "rsi" && <>{field("oversold", "Oversold threshold", 1, 49)}{field("overbought", "Overbought threshold", 51, 99)}</>}</>}
    </div>
    <p className="bot-rule">{BOT_RULES[config.strategy]}</p>
    <fieldset className="bot-timeframes"><legend>Entry timeframes · choose up to 4</legend>{(Object.keys(BOT_FRAMES) as BotFrame[]).map(frame => <label key={frame}><input type="checkbox" aria-label={`Entry timeframe ${frame}`} checked={frames.includes(frame)} disabled={frames.includes(frame) && frames.length === 1 || !frames.includes(frame) && frames.length === 4} onChange={() => toggleFrame(frame)} /><span>{frame}</span></label>)}</fieldset>
    <p className="bot-rule">Each selected timeframe watches independently. The highest timeframe wins simultaneous same-direction signals. Conflicting directions skip that evaluation; the bot waits for a new candle.</p>
    <h3>Optional higher timeframe filter</h3><div className="bot-fields"><label>Trend timeframe<select aria-label="Trend timeframe" value={config.trendTimeframe ?? "off"} onChange={e => update(c => ({ ...c, trendTimeframe: e.target.value as BotConfig["trendTimeframe"], trendPeriod: c.trendPeriod ?? 21 }))}><option value="off">Off · use entry rule only</option>{(Object.keys(BOT_FRAMES) as BotFrame[]).filter(f => BOT_FRAMES[f] > Math.max(...frames.map(frame => BOT_FRAMES[frame]))).map(f => <option key={f}>{f}</option>)}</select></label>{config.trendTimeframe && config.trendTimeframe !== "off" && field("trendPeriod", "Trend EMA period", 2, 100)}</div>
    <p className="bot-rule">Long only above the higher timeframe’s completed-candle EMA; short only below it. Missing or stale filter data blocks entries.</p>
    <h3>Trade size & protection</h3><div className="bot-fields">
      <label>Trade sizing<select aria-label="Trade sizing" value={config.sizing ?? "notional"} onChange={e => update(c => ({ ...c, sizing: e.target.value as BotConfig["sizing"], riskUsd: c.riskUsd ?? 5 }))}><option value="notional">Fixed USD notional</option><option value="risk">USD stop-risk budget</option></select></label>
      {field("notional", config.sizing === "risk" ? "Maximum notional per trade (USD)" : "Notional per trade (USD)", 1, 100000, .01)}
      {config.sizing === "risk" && field("riskUsd", "Planned stop risk per trade (USD)", .1, 10000, .1)}
      {field("leverage", "Leverage (×)", 1, 20)}
      <label>Exit plan<select aria-label="Exit plan" value={config.exitMode ?? "percent"} onChange={e => update(c => ({ ...c, exitMode: e.target.value as BotConfig["exitMode"], riskReward: c.riskReward ?? 2, stopBufferTicks: c.stopBufferTicks ?? 1 }))}><option value="percent">Percentage stop & target</option><option value="signal">Signal candle stop + reward multiple</option></select></label>
      {config.exitMode === "signal" ? <>{field("stopBufferTicks", "Stop buffer (price ticks)", 0, 100)}{field("riskReward", "Reward / risk multiple", .5, 10, .1)}</> : <>{field("stopPercent", "Stop loss (%)", .1, 25, .1)}{field("targetPercent", "Take profit (%)", .1, 50, .1)}</>}
      {field("maxEntries", "Maximum entries per day", 1, 100)}{field("maxDailyLoss", "Daily realised loss limit (USD)", 1, 10000, .01)}{field("cooldown", "Cooldown (smallest selected timeframe candles)", 0, 100)}
    </div>
    <p className="bot-rule">Signal stops use the trigger candle’s low for longs or high for shorts, plus the tick buffer. USD stop risk excludes fees, funding and gaps; actual losses can exceed it. Lots round down, and the notional cap always applies.</p>
    </fieldset>
    <button type="button" className="bot-preview-button" disabled={checking || trading.busy} onClick={handleCheckSetup}>{checking ? "Checking candles…" : "Check latest setup"}</button>
    <p className="bot-rule">Preview only · never places an order. A current signal does not bypass the next-close requirement when you start.</p>
    {!!preview.length && <ul className="bot-preview" aria-label="Latest setup preview">{preview.map((line, i) => <li key={i}>{line}</li>)}</ul>}
    {error && <p role="alert" className="negative">{error}</p>}
    <button className="bot-start" disabled={!trading.account || trading.busy || checking} type="submit"><Play size={16} /> {bot.enabled ? "Save & restart strategy" : "Save & start bot"}</button>
    <small>Starts on each timeframe’s next candle close. EMA setups wait five seconds after close. Changes apply to future entries; existing position protection stays as placed.</small>
  </form>;
}
