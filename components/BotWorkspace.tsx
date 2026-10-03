"use client";
import { useState } from "react";
import Link from "next/link";
import { WalletRiskSettings } from "./WalletRiskSettings";
import { PortfolioEquity } from "./PortfolioEquity";
import { BotBacktestPanel } from "./BotBacktestPanel";
import { Bot, Pause, Play, ShieldCheck, X } from "lucide-react";
import { BOT_ASSETS, BOT_FRAMES, BOT_STRATEGIES, configureBot, defaultBot, type BotConfig, type BotSymbol, type PaperBot } from "@/lib/paper-bot-state";
import { botDailyStats } from "@/lib/paper-bot-engine";
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
      <Link className="research-link" href="/research">NSE daily research · ranked stocks, fundamentals & dated news</Link>
      <WalletRiskSettings key={JSON.stringify(account?.riskLimits)} trading={trading} />
      {account && <PortfolioEquity account={account} quotes={Object.fromEntries(Object.entries(trading.snapshots).map(([key, value]) => [key, value?.quote]))} now={trading.clock} />}
      <div className="bot-layout">
        <BotSettings key={`${symbol}:${selected?.startedAt ?? 0}`} bot={selected ?? defaultBot(symbol)} trading={trading} onSaved={() => setNotice("Settings saved. Waiting for a new completed candle.")} />
        <aside className="bot-monitor">
          <div className="bot-card"><span className="eyebrow">Engine status</span><h3>{BOT_ASSETS[symbol]}</h3><p role="status">{selected?.status ?? "Choose your settings, then start the bot."}</p><dl><div><dt>Paper wallet</dt><dd>{account ? formatUsd(account.wallet) : "Loading…"}</dd></div><div><dt>Entries today (India)</dt><dd>{daily.entries} / {selected?.maxEntries ?? 5}</dd></div><div><dt>Realised net today + entry fees</dt><dd className={daily.net >= 0 ? "positive" : "negative"}>{formatUsd(daily.net)}</dd></div><div><dt>Last candle evaluated</dt><dd>{selected?.lastCandle ? new Date(selected.lastCandle * 1000).toLocaleString("en-IN") : "—"}</dd></div></dl><button onClick={() => void pause()} disabled={!selected?.enabled || trading.busy}><Pause size={15} /> Pause this bot</button></div>
          <div className="bot-card"><span className="eyebrow">Current position</span>{currentPosition ? <><h3>{currentPosition.side === "BUY" ? "Long" : "Short"} · {currentPosition.contracts} lots</h3><p>{currentPosition.botId ? "Bot paper trade" : "Existing paper position · bot will wait"}</p><dl><div><dt>Entry</dt><dd>{formatUsd(currentPosition.entry)}</dd></div><div><dt>Open P&L before exit fees</dt><dd>{snapshot ? formatUsd(positionPnl(currentPosition, snapshot.quote.mark)) : "—"}</dd></div><div><dt>Stop loss</dt><dd>{currentPosition.protection?.stopLoss?.trigger ? formatUsd(currentPosition.protection.stopLoss.trigger) : "—"}</dd></div><div><dt>Take profit</dt><dd>{currentPosition.protection?.takeProfit?.trigger ? formatUsd(currentPosition.protection.takeProfit.trigger) : "—"}</dd></div></dl>{currentPosition.botId === symbol && <button disabled={trading.busy || !freshPerpQuote(snapshot?.quote, trading.clock)} onClick={() => void close()}>Close position & pause</button>}</> : <p>No open position. The bot waits for a new entry signal.</p>}<button onClick={onPnl}>View Global P&L</button></div>
          <div className="bot-card bot-help"><h3>How entries work</h3><p>Signals use completed candles. Each candle is evaluated once across browser tabs. One position per asset; existing orders or positions block new entries.</p><p>Stops and targets use live observed prices. Daily loss limits block new entries after realised losses and fees reach the limit; they do not close positions or cap total losses.</p><p>Gold uses the XAUTUSD tokenised gold perpetual, rather than a spot-gold quote. Settings and trades are saved on this browser for this account.</p></div>
        </aside>
      </div>
      <div className="bot-card bot-activity"><h3>Bot activity</h3>{!account?.events.some(e => e.botId) ? <p>Automatic entries and exits will appear here and in Global P&L.</p> : <ul>{account.events.filter(e => e.botId).slice(-20).reverse().map(e => <li key={e.id}><div><b>{e.symbol} · {e.kind}</b><small>{new Date(e.at).toLocaleString("en-IN")} · {e.detail}</small></div><span>{e.contracts} lots @ {formatUsd(e.price)}<small>Net {formatUsd(e.pnl - e.fee)}</small></span></li>)}</ul>}</div>
    </section>
  </div>;
}

function BotSettings({ bot, trading, onSaved }: { bot: PaperBot; trading: GlobalTrading; onSaved: () => void }) {
  const [config, setConfig] = useState<BotConfig>({ sizingMode: "notional", riskPercent: 1, stopMode: "percent", atrPeriod: 14, atrMultiplier: 2, breakEvenR: 0, trailAtr: 0, firstExitPercent: 0, secondExitPercent: 0, firstExitR: 1.5, secondExitR: 3, regimeFilter: "any", ...bot });
  const [error, setError] = useState("");
  const field = (key: keyof BotConfig, label: string, min: number, max: number, step = 1) => <label>{label}<input type="number" required min={min} max={max} step={step} value={config[key]} onChange={e => setConfig(c => ({ ...c, [key]: e.target.value === "" ? "" : Number(e.target.value) }))} /></label>;
  return <div className="bot-config-stack"><form className="bot-card bot-settings" onSubmit={async e => {
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
    <div className="bot-fields"><label>Strategy<select aria-label="Strategy" value={config.strategy} onChange={e => setConfig(c => ({ ...c, strategy: e.target.value as BotConfig["strategy"] }))}>{Object.entries(BOT_STRATEGIES).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label><label>Candle timeframe<select aria-label="Candle timeframe" value={config.timeframe} onChange={e => setConfig(c => ({ ...c, timeframe: e.target.value as BotConfig["timeframe"] }))}>{Object.keys(BOT_FRAMES).map(f => <option key={f}>{f}</option>)}</select></label><label>Trade direction<select aria-label="Trade direction" value={config.direction} onChange={e => setConfig(c => ({ ...c, direction: e.target.value as BotConfig["direction"] }))}><option value="both">Long & short</option><option value="long">Long only</option><option value="short">Short only</option></select></label>
      {config.strategy === "ema" ? <>{field("fast", "Fast EMA period", 2, 99)}{field("slow", "Slow EMA period", 3, 100)}</> : <>{field("period", config.strategy === "rsi" ? "RSI period" : "Breakout lookback", 2, 100)}{config.strategy === "rsi" && <>{field("oversold", "Oversold threshold", 1, 49)}{field("overbought", "Overbought threshold", 51, 99)}</>}</>}
    </div>
    <p className="bot-rule">{config.strategy === "ema" ? "Long when the fast EMA crosses above the slow EMA; short on the opposite crossover." : config.strategy === "rsi" ? "Long when RSI crosses back above oversold; short when it crosses back below overbought." : "Long when the candle closes above prior range highs; short below prior range lows."}</p>
    <h3>Trade size & protection</h3><div className="bot-fields">{field("notional", "Notional per trade (USD)", 1, 100000, .01)}{field("leverage", "Leverage (×)", 1, 20)}{field("stopPercent", "Stop loss (%)", .1, 25, .1)}{field("targetPercent", "Take profit (%)", .1, 50, .1)}{field("maxEntries", "Maximum entries per day", 1, 100)}{field("maxDailyLoss", "Daily realised loss limit (USD)", 1, 10000, .01)}{field("cooldown", "Cooldown between entries (candles)", 0, 100)}</div>
    <p className="bot-rule">Notional is the total position value. Actual lots round down to the contract increment. Entries include spread, fees, margin and liquidity checks.</p>
    <details className="research-card"><summary>Risk sizing, market filters & automatic exits</summary><div className="bot-fields">
      <label>Size method<select aria-label="Size method" value={config.sizingMode} onChange={e => setConfig(c => ({ ...c, sizingMode: e.target.value as BotConfig["sizingMode"] }))}><option value="notional">Fixed notional</option><option value="risk">Risk percentage of equity</option></select></label>
      {field("riskPercent", "Equity risk per entry (%)", .01, 10, .01)}
      <label>Stop method<select aria-label="Stop method" value={config.stopMode} onChange={e => setConfig(c => ({ ...c, stopMode: e.target.value as BotConfig["stopMode"] }))}><option value="percent">Fixed percentage</option><option value="atr">ATR volatility stop</option></select></label>
      {field("atrPeriod", "ATR period", 2, 100)}{field("atrMultiplier", "Initial stop ATR multiple", .1, 10, .1)}
      <label>Market condition<select aria-label="Market condition" value={config.regimeFilter} onChange={e => setConfig(c => ({ ...c, regimeFilter: e.target.value as BotConfig["regimeFilter"] }))}><option value="any">Any condition</option><option value="trend">Trend only</option><option value="range">Range only</option></select></label>
      {field("breakEvenR", "Move to breakeven at R (0 off)", 0, 10, .1)}{field("trailAtr", "Trail ATR multiple (0 off)", 0, 10, .1)}
      {field("firstExitPercent", "First partial exit (%)", 0, 90, 1)}{field("firstExitR", "First target (R)", .1, 20, .1)}
      {field("secondExitPercent", "Second partial exit (%)", 0, 90, 1)}{field("secondExitR", "Second target (R)", .1, 30, .1)}
    </div><p className="research-help">R is the original entry-to-stop distance. Risk sizing includes estimated entry/exit fees and caps size at the notional above. Trend/range filters use this asset’s EMA and ATR; stress conditions block filtered entries. With partial targets enabled, the remaining lots use the stop and optional trail instead of the fixed percentage target. At least one lot remains as a runner.</p></details>
    {error && <p role="alert" className="negative">{error}</p>}
    <button className="bot-start" disabled={!trading.account || trading.busy} type="submit"><Play size={16} /> {bot.enabled ? "Save & restart strategy" : "Save & start bot"}</button>
    <small>Starts on the next candle close. Changes apply to future entries; existing position protection stays as placed.</small>
  </form><BotBacktestPanel config={config} trading={trading} /></div>;
}
