"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CandlestickChart, GitCompareArrows, PencilRuler, RefreshCw, Star, X } from "lucide-react";
import {
  MarketChart,
  DEFAULT_CHART_INDICATORS,
  type ChartActionRequest,
  type ChartIndicators,
  type DrawingTool,
} from "./MarketChart";
import { ChartFunctionMenu } from "./ChartFunctionMenu";
import { ChartStyleMenu } from "./ChartStyleMenu";
import { CompareSymbolPicker } from "./CompareSymbolPicker";
import { DrawingToolLibrary } from "./DrawingToolLibrary";
import { GlobalAlerts } from "./GlobalAlerts";
import { ModernSelect } from "./ModernSelect";
import { useTransientBack } from "./useTransientBack";
import { STUDIES } from "@/lib/indicator-catalog";
import { formatInr, type Candle, type Instrument } from "@/lib/market";
import {
  advancePerps,
  availablePerpCash,
  cancelPerpOrder,
  closePerp,
  freshPerpQuote,
  GLOBAL_CHART_INSTRUMENTS,
  GLOBAL_INSTRUMENTS,
  liquidationPrice,
  marginRate,
  openPerp,
  PERP_SEED_INR,
  positionPnl,
  readPerpAccount,
  tradingFee,
  USD_INR,
  type GlobalSymbol,
  type PerpAccount,
  type PerpQuote,
  type PerpSpec,
  type PerpSymbol,
} from "@/lib/global-markets";

const dollars = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n)
    ? "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
const blankCandles: Candle[] = [];
type Snapshot = { quote: PerpQuote; spec: PerpSpec };
export type GlobalMarketRequest = {
  symbol: GlobalSymbol;
  view?: "chart" | "portfolio" | "history";
  key: number;
};
function BrentChart({ dark }: { dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    setFailed(false);
    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    container.style.height = "100%";
    node.appendChild(container);
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: "TVC:UKOIL",
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: dark ? "dark" : "light",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_side_toolbar: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    script.onerror = () => setFailed(true);
    node.appendChild(script);
    return () => {
      node.replaceChildren();
    };
  }, [dark]);
  return (
    <>
      <div className="global-brent-frame">
        <div className="global-brent-chart tradingview-widget-container" ref={host}/>
      </div>
      {failed && (
        <p role="status">
          Brent chart could not load. Use the source link below.
        </p>
      )}
      <a
        href="https://www.tradingview.com/symbols/UKOIL/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Brent CFD reference chart by TradingView ↗
      </a>
    </>
  );
}

export function GlobalMarketsWorkspace({
  owner,
  request,
  onClose,
  dark,
  onFavourites,
}: {
  owner: string;
  request: GlobalMarketRequest | null;
  onClose: () => void;
  dark: boolean;
  onFavourites?: (symbols: string[]) => void;
}) {
  const [account, setAccount] = useState<PerpAccount | null>(null),
    accountRef = useRef<PerpAccount | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [snapshots, setSnapshots] = useState<Partial<Record<PerpSymbol, Snapshot>>>(
      {},
    );
  const [symbol, setSymbol] = useState<GlobalSymbol>("BTCUSD"),
    [view, setView] = useState<"chart" | "portfolio" | "orders" | "history">(
      "chart",
    );
  const [timeframe, setTimeframe] = useState("5m"),
    [candles, setCandles] = useState<Candle[]>([]),
    [candleError, setCandleError] = useState("");
  const [functions, setFunctions] = useState(false),
    [drawings, setDrawings] = useState(false),
    [styleMenu, setStyleMenu] = useState(false),
    [compareMenu, setCompareMenu] = useState(false),
    [tool, setTool] = useState<DrawingTool>("cursor"),
    [indicators, setIndicators] = useState<ChartIndicators>({
      ...DEFAULT_CHART_INDICATORS,
    }),
    [action, setAction] = useState<ChartActionRequest>();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY"),
    [quantity, setQuantity] = useState("1"),
    [leverage, setLeverage] = useState("5"),
    [orderType, setOrderType] = useState<"Market" | "Limit">("Market"),
    [limit, setLimit] = useState(""),
    [stop, setStop] = useState(""),
    [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [closeQty, setCloseQty] = useState<Record<string, string>>({}),
    [clock, setClock] = useState(Date.now()),
    [retry, setRetry] = useState(0);
  const [favourites, setFavourites] = useState<string[]>([]),
    [accepted, setAccepted] = useState(false);
  const [alertHost, setAlertHost] = useState<HTMLDivElement | null>(null);
  const key = `papertrade-perpetual-wallet-v1:${owner}`,
    prefKey = `papertrade-global-preferences-v1:${owner}`,
    snapRef = useRef(snapshots);
  snapRef.current = snapshots;
  const alive = useRef(true),
    open = !!request;
  useTransientBack(open, onClose);
  useTransientBack(confirm, () => setConfirm(false));
  useEffect(() => {
    alive.current = true;
    try {
      const a = readPerpAccount(localStorage.getItem(key));
      accountRef.current = a;
      setAccount(a);
      const prefs = JSON.parse(localStorage.getItem(prefKey) ?? "{}");
      setAccepted(prefs.accepted === true);
      const saved = Array.isArray(prefs.favourites)
        ? prefs.favourites.filter((s: string) =>
            GLOBAL_INSTRUMENTS.some((i) => i.symbol === s),
          )
        : [];
      setFavourites(saved);
      onFavourites?.(saved);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Practice storage unavailable.",
      );
    }
    const storage = (e: StorageEvent) => {
      if (e.key === key)
        try {
          const a = readPerpAccount(e.newValue);
          accountRef.current = a;
          setAccount(a);
        } catch {
          setError(
            "Practice wallet changed to unreadable data. Trading disabled.",
          );
          setAccount(null);
          accountRef.current = null;
        }
    };
    window.addEventListener("storage", storage);
    const timer = window.setInterval(() => setClock(Date.now()), 3000);
    return () => {
      alive.current = false;
      window.removeEventListener("storage", storage);
      window.clearInterval(timer);
    };
  }, [key]);
  useEffect(() => {
    if (request) {
      setSymbol(request.symbol);
      setView(request.view ?? "chart");
      setConfirm(false);
    }
  }, [request?.key]);
  const savePrefs = (saved: string[], consent = accepted) => {
    try {
      localStorage.setItem(
        prefKey,
        JSON.stringify({ favourites: saved, accepted: consent }),
      );
      setAccepted(consent);
      setFavourites(saved);
      onFavourites?.(saved);
    } catch {
      setNotice("Could not save preferences on this device.");
    }
  };
  async function transaction(
    fn: (a: PerpAccount) => PerpAccount,
    quiet = false,
  ) {
    if (!navigator.locks) {
      setError(
        "Safe browser storage locking is unavailable. Trading is disabled.",
      );
      return;
    }
    if (!quiet) setBusy(true);
    try {
      await navigator.locks.request(key, () => {
        if (!alive.current) return;
        const a = readPerpAccount(localStorage.getItem(key)),
          next = fn(a);
        localStorage.setItem(key, JSON.stringify(next));
        accountRef.current = next;
        setAccount(next);
      });
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Action could not be saved. Nothing was committed.",
      );
    } finally {
      if (!quiet && alive.current) setBusy(false);
    }
  }
  const hasExposure =
    !!account && (account.positions.length > 0 || account.orders.length > 0);
  useEffect(() => {
    if (!open && !hasExposure) return;
    let stopped = false,
      running = false;
    const controller = new AbortController();
    const poll = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      const results = await Promise.allSettled(
        (["BTCUSD", "XAUTUSD"] as const).map(async (s) => {
          const r = await fetch(`/api/global-markets?symbol=${s}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const p = await r.json();
          if (!r.ok || !p.ok)
            throw new Error(p.error ?? "Market data unavailable.");
          return [s, { spec: p.spec, quote: p.quote }] as const;
        }),
      );
      if (!stopped) {
        const next = { ...snapRef.current };
        for (const r of results)
          if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
        setSnapshots(next);
        snapRef.current = next;
        if (results.every((r) => r.status === "rejected"))
          setNotice("Delta is unavailable. Orders wait for fresh data.");
        if (
          accountRef.current &&
          (accountRef.current.positions.length ||
            accountRef.current.orders.length)
        )
          await transaction(
            (a) =>
              advancePerps(
                a,
                { BTCUSD: next.BTCUSD?.quote, XAUTUSD: next.XAUTUSD?.quote },
                { BTCUSD: next.BTCUSD?.spec, XAUTUSD: next.XAUTUSD?.spec },
                Date.now(),
              ),
            true,
          );
      }
      running = false;
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [open, hasExposure, key, retry]);
  useEffect(() => {
    setCandles([]);
    setCandleError("");
    if (!open || symbol === "BRENT") return;
    const controller = new AbortController();
    let busy = false;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const r = await fetch(
          `/api/global-markets?symbol=${symbol}&mode=candles&timeframe=${timeframe}`,
          { signal: controller.signal },
        );
        const p = await r.json();
        if (!r.ok || !p.ok) throw new Error(p.error ?? "History unavailable.");
        if (!controller.signal.aborted) {
          setCandles(p.candles);
          setCandleError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setCandleError(e instanceof Error ? e.message : "Chart unavailable.");
      } finally {
        busy = false;
      }
    };
    void load();
    const timer = window.setInterval(load, 10000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open, symbol, timeframe, retry]);
  const spec = symbol === "BRENT" ? undefined : snapshots[symbol]?.spec,
    quote = symbol === "BRENT" ? undefined : snapshots[symbol]?.quote;
  const isFresh = freshPerpQuote(quote, clock),
    contracts = Number(quantity),
    lev = Number(leverage),
    price =
      orderType === "Limit"
        ? Number(limit)
        : side === "BUY"
          ? quote?.ask
          : quote?.bid;
  const notional = spec && price ? contracts * spec.lot * price : 0,
    margin = lev > 0 ? (notional / lev) * USD_INR : 0,
    fee = spec ? tradingFee(spec, notional) : 0;
  const maximum = spec
    ? Math.min(1 / spec.initial, 1 / marginRate(spec, notional))
    : 1;
  const instrument = useMemo<Instrument>(
    () => ({
      symbol,
      name:
        symbol === "BTCUSD"
          ? "Bitcoin"
          : symbol === "XAUTUSD"
            ? "Tether Gold"
            : "Brent",
      exchange: "NSE",
      price: 0,
      change: 0,
      instrumentKey: `DELTA|${symbol}`,
      categories: [],
    }),
    [symbol],
  );
  const previewPosition =
    spec && price && contracts > 0 && lev > 0
      ? {
          symbol: spec.symbol,
          side,
          contracts,
          entry: price,
          margin,
          leverage: lev,
          openedAt: clock,
          nextFunding: clock,
          spec,
        }
      : null;
  const liq = previewPosition ? liquidationPrice(previewPosition) : null;
  const badStop =
    !!stop &&
    liq !== null &&
    (side === "BUY" ? Number(stop) <= liq : Number(stop) >= liq);
  const excluded = STUDIES.filter(
    (s) => s.comparison || ["smc", "pivots", "vwap"].includes(s.id),
  ).map((s) => s.id);
  function submit() {
    if (!spec || !quote) return;
    void transaction((a) =>
      openPerp(
        a,
        spec,
        quote,
        side,
        contracts,
        lev,
        Date.now(),
        stop ? Number(stop) : undefined,
        target ? Number(target) : undefined,
        orderType === "Limit" ? Number(limit) : undefined,
      ),
    ).then(() => setConfirm(false));
  }
  return (
    <>
      <GlobalAlerts
        owner={owner}
        visible={open && symbol !== "BRENT"}
        host={alertHost}
        symbol={symbol === "BRENT" ? "BTCUSD" : symbol}
      />
      {open && (
        <section
          className="global-markets"
          role="dialog"
          aria-modal="true"
          aria-label="Global markets"
        >
          <header className="global-header">
            <button onClick={onClose} aria-label="Close global markets">
              <ArrowLeft size={20} />
            </button>
            <div>
              <small>GLOBAL MARKETS</small>
              <h1>Crypto, gold & oil</h1>
            </div>
            <button
              onClick={() => setRetry((n) => n + 1)}
              aria-label="Refresh global markets"
            >
              <RefreshCw size={18} />
            </button>
          </header>
          <nav className="global-instruments" aria-label="Global instruments">
            {GLOBAL_INSTRUMENTS.map((i) => (
              <button
                key={i.symbol}
                aria-pressed={symbol === i.symbol}
                onClick={() => {
                  setSymbol(i.symbol);
                  setView("chart");
                  setConfirm(false);
                  setLimit("");
                  setStop("");
                  setTarget("");
                }}
              >
                <b>
                  {i.symbol === "BTCUSD"
                    ? "Bitcoin"
                    : i.symbol === "XAUTUSD"
                      ? "Gold"
                      : "Brent"}
                </b>
                <small>
                  {i.symbol === "BRENT" ? "Watch only" : "Perpetual"}
                </small>
              </button>
            ))}
          </nav>
          <div className="global-title">
            <div>
              <h2>
                {GLOBAL_INSTRUMENTS.find((i) => i.symbol === symbol)?.name}
              </h2>
              <small>
                {GLOBAL_INSTRUMENTS.find((i) => i.symbol === symbol)?.subtitle}
              </small>
            </div>
            <button
              aria-label={
                favourites.includes(symbol)
                  ? "Unsave instrument"
                  : "Save instrument"
              }
              aria-pressed={favourites.includes(symbol)}
              onClick={() =>
                savePrefs(
                  favourites.includes(symbol)
                    ? favourites.filter((s) => s !== symbol)
                    : [...favourites, symbol],
                )
              }
            >
              <Star
                size={20}
                fill={favourites.includes(symbol) ? "currentColor" : "none"}
              />
            </button>
          </div>
          {symbol === "BRENT" ? (
            <div className="global-brent">
              <p className="global-disclosure">
                Watch only · USD/barrel · TVC:UKOIL Brent CFD reference, not the
                ICE futures execution feed or spot oil. TradingView supplies
                this chart; follow its market-status label for delays. No
                leverage, paper orders or app alerts.
              </p>
              <BrentChart dark={dark} />
            </div>
          ) : (
            <>
              <div className="global-quote">
                <strong>{dollars(quote?.last)}</strong>
                <span className={isFresh ? "positive" : ""}>
                  {isFresh ? "Fresh quote" : "Waiting / stale"}
                  {quote &&
                    ` · ${new Date(quote.at).toLocaleTimeString("en-IN")}`}
                </span>
                <small>
                  Mark {dollars(quote?.mark)} · Bid {dollars(quote?.bid)} · Ask{" "}
                  {dollars(quote?.ask)}
                </small>
                <small>
                  Funding {quote ? (quote.funding * 100).toFixed(4) + "%" : "—"}{" "}
                  / {spec ? spec.fundingSeconds / 3600 : "—"}h · next{" "}
                  {spec
                    ? new Date(
                        (Math.floor(clock / (spec.fundingSeconds * 1000)) + 1) *
                          spec.fundingSeconds *
                          1000,
                      ).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </small>
              </div>
              <nav className="global-tabs" aria-label="Global workspace">
                {(["chart", "portfolio", "orders", "history"] as const).map(
                  (t) => (
                    <button
                      key={t}
                      aria-pressed={view === t}
                      onClick={() => setView(t)}
                    >
                      {t === "portfolio"
                        ? "Positions"
                        : t === "history"
                          ? "P&L"
                          : t === "orders"
                            ? `Orders (${account?.orders.length ?? 0})`
                            : "Chart"}
                    </button>
                  ),
                )}
              </nav>
              {view === "chart" && (
                <>
                  <div className="global-chart-controls">
                    <ModernSelect
                      label="Timeframe"
                      ariaLabel="Global chart timeframe"
                      hideLabel
                      value={timeframe}
                      onChange={setTimeframe}
                      choices={[
                        "1m",
                        "3m",
                        "5m",
                        "15m",
                        "30m",
                        "1H",
                        "4H",
                        "1D",
                      ].map((value) => ({ value, label: value }))}
                    />
                    <button onClick={() => setStyleMenu(true)}>
                      <CandlestickChart size={17} />
                      Type
                    </button>
                    <button onClick={() => setCompareMenu(true)}>
                      <GitCompareArrows size={17} />
                      Compare
                    </button>
                    <button onClick={() => setDrawings(true)}>
                      <PencilRuler size={17} />
                      Tools
                    </button>
                    <button onClick={() => setFunctions(true)}>
                      Indicators
                    </button>
                    {tool !== "cursor" && (
                      <button onClick={() => setTool("cursor")}>
                        Done drawing
                      </button>
                    )}
                  </div>
                  <div className="global-chart">
                    <MarketChart
                      key={`${symbol}:${timeframe}`}
                      instrument={instrument}
                      timeframe={timeframe}
                      activeTool={tool}
                      magnet={false}
                      hiddenDrawings={false}
                      indicators={indicators}
                      externalCandles={candles ?? blankCandles}
                      exchangeLabel="DELTA · USD"
                      chartTheme={dark ? "neon" : "light"}
                      chartAction={action}
                      onFeedStatus={() => {}}
                      onDrawingComplete={() => setTool("cursor")}
                      onRemoveIndicator={(id) =>
                        setIndicators((v) => ({ ...v, [id]: false }))
                      }
                      preservePageScroll
                    />
                  </div>
                  {candleError && (
                    <p role="status">
                      {candleError}{" "}
                      <button onClick={() => setRetry((n) => n + 1)}>
                        Retry chart
                      </button>
                    </p>
                  )}
                  {!accepted ? (
                    <div className="global-consent">
                      <h3>Start a separate practice wallet</h3>
                      <p>
                        {formatInr(PERP_SEED_INR)} virtual funds. Your stock
                        cash and trades stay untouched. Saved on this device for
                        your account; not cloud-synced.
                      </p>
                      <p>
                        This is a foreground simulation: no execution while the
                        app is closed. Funding is estimated at observed
                        boundaries; missed funding is flagged. Fills and
                        liquidation can differ from Delta.
                      </p>
                      <button
                        className="primary-button"
                        onClick={() => savePrefs(favourites, true)}
                      >
                        Start practice
                      </button>
                    </div>
                  ) : (
                    <div className="global-ticket">
                      <header>
                        <h3>Paper order</h3>
                        <span>Isolated margin</span>
                      </header>
                      <div className="global-side">
                        <button
                          aria-pressed={side === "BUY"}
                          onClick={() => setSide("BUY")}
                        >
                          Buy / Long
                        </button>
                        <button
                          aria-pressed={side === "SELL"}
                          onClick={() => setSide("SELL")}
                        >
                          Sell / Short
                        </button>
                      </div>
                      <div className="global-input-grid">
                        <ModernSelect
                          label="Order type"
                          value={orderType}
                          onChange={setOrderType}
                          choices={[
                            {
                              value: "Market",
                              label: "Market",
                              description: "Use the current bid or ask",
                            },
                            {
                              value: "Limit",
                              label: "Limit",
                              description:
                                "Wait for a marketable quote at your price or better",
                            },
                          ]}
                        />
                        <label>
                          Leverage · max {maximum.toFixed(0)}×
                          <input
                            aria-label="Leverage"
                            type="number"
                            min="1"
                            max={maximum}
                            step="1"
                            value={leverage}
                            onChange={(e) => setLeverage(e.target.value)}
                          />
                        </label>
                        <label>
                          Quantity · contracts
                          <input
                            aria-label="Contracts"
                            type="number"
                            min="1"
                            step="1"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                          />
                        </label>
                        {orderType === "Limit" && (
                          <label>
                            Limit · USD
                            <input
                              aria-label="Limit price"
                              type="number"
                              step={spec?.tick ?? 0.01}
                              value={limit}
                              onChange={(e) => setLimit(e.target.value)}
                            />
                          </label>
                        )}
                        <label>
                          Stop-loss · USD
                          <input
                            aria-label="Stop loss"
                            placeholder="Optional"
                            type="number"
                            step={spec?.tick ?? 0.01}
                            value={stop}
                            onChange={(e) => setStop(e.target.value)}
                          />
                        </label>
                        <label>
                          Take-profit · USD
                          <input
                            aria-label="Take profit"
                            placeholder="Optional"
                            type="number"
                            step={spec?.tick ?? 0.01}
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                          />
                        </label>
                      </div>
                      <small>
                        {spec
                          ? `1 contract = ${spec.lot} ${symbol === "BTCUSD" ? "BTC" : "XAUT"} · tick $${spec.tick}`
                          : "Loading contract rules"}
                      </small>
                      <dl className="global-metrics">
                        <div>
                          <dt>Position value</dt>
                          <dd>{dollars(notional)}</dd>
                        </div>
                        <div>
                          <dt>Initial margin estimate</dt>
                          <dd>{formatInr(margin)}</dd>
                        </div>
                        <div>
                          <dt>Fee incl. GST</dt>
                          <dd>{formatInr(fee)}</dd>
                        </div>
                        <div>
                          <dt>Liquidation estimate*</dt>
                          <dd>{liq === null ? "—" : dollars(liq)}</dd>
                        </div>
                        <div>
                          <dt>Available practice cash</dt>
                          <dd>
                            {account
                              ? formatInr(availablePerpCash(account))
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                      <small>
                        *New standalone position estimate; existing exposure and
                        funding change the result.
                      </small>
                      {badStop && (
                        <p className="global-warning">
                          Your stop-loss is beyond the estimated liquidation
                          level.
                        </p>
                      )}
                      <button
                        className="primary-button"
                        disabled={
                          !isFresh || !account || !!error || busy || !spec
                        }
                        onClick={() => setConfirm(true)}
                      >
                        Review {side === "BUY" ? "long" : "short"} order
                      </button>
                      <p className="global-disclosure">
                        Fees use Delta’s base rates + GST; promotions excluded.
                        Resting limits execute only against a marketable quote
                        and are conservatively charged taker fees. $1 = ₹85.
                      </p>
                    </div>
                  )}
                </>
              )}
              {view === "portfolio" && (
                <div className="global-positions">
                  <h3>Isolated positions</h3>
                  {!account?.positions.length && (
                    <p>No open BTC or gold positions.</p>
                  )}
                  {account?.positions.map((p) => {
                    const q = snapshots[p.symbol]?.quote;
                    return (
                      <article key={p.symbol}>
                        <header>
                          <b>
                            {p.symbol} · {p.side === "BUY" ? "Long" : "Short"}
                          </b>
                          <span>{p.contracts} contracts</span>
                        </header>
                        <dl className="global-metrics">
                          <div>
                            <dt>Entry</dt>
                            <dd>{dollars(p.entry)}</dd>
                          </div>
                          <div>
                            <dt>Unrealised · mark</dt>
                            <dd>
                              {freshPerpQuote(q, clock)
                                ? formatInr(positionPnl(p, q.mark))
                                : "Quote unavailable"}
                            </dd>
                          </div>
                          <div>
                            <dt>Allocated margin</dt>
                            <dd>{formatInr(p.margin)}</dd>
                          </div>
                          <div>
                            <dt>Liquidation estimate</dt>
                            <dd>{dollars(liquidationPrice(p))}</dd>
                          </div>
                          <div>
                            <dt>Stop / target</dt>
                            <dd>
                              {dollars(p.stop)} / {dollars(p.target)}
                            </dd>
                          </div>
                        </dl>
                        <label>
                          Close contracts
                          <input
                            aria-label={`Close quantity ${p.symbol}`}
                            type="number"
                            min="1"
                            max={p.contracts}
                            value={closeQty[p.symbol] ?? p.contracts}
                            onChange={(e) =>
                              setCloseQty((v) => ({
                                ...v,
                                [p.symbol]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          disabled={busy || !freshPerpQuote(q, clock)}
                          onClick={() =>
                            q &&
                            void transaction((a) =>
                              closePerp(
                                a,
                                p.symbol,
                                q,
                                Number(closeQty[p.symbol] ?? p.contracts),
                                Date.now(),
                              ),
                            )
                          }
                        >
                          Close position · reduce only
                        </button>
                        <small>
                          Closes at observed bid/ask and cancels this
                          instrument’s pending entries.
                        </small>
                      </article>
                    );
                  })}
                </div>
              )}
              {view === "orders" && (
                <div className="global-orders">
                  <h3>Pending limit orders</h3>
                  {!account?.orders.length && <p>No pending orders.</p>}
                  {account?.orders.map((o) => (
                    <article key={o.id}>
                      <b>
                        {o.symbol} · {o.side} {o.contracts}
                      </b>
                      <p>
                        Limit {dollars(o.limit)} · reserved{" "}
                        {formatInr(o.reserve)}
                      </p>
                      <button
                        onClick={() =>
                          void transaction((a) =>
                            cancelPerpOrder(a, o.id, Date.now()),
                          )
                        }
                      >
                        Cancel order
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {view === "history" && (
                <div className="global-history">
                  <h3>BTC & gold · practice P&L</h3>
                  <p>
                    Separate from your NSE portfolio. All amounts below are INR.
                  </p>
                  <dl className="global-metrics">
                    <div>
                      <dt>Net realised incl. funding</dt>
                      <dd>
                        {account
                          ? formatInr(account.wallet - PERP_SEED_INR)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Trading / liquidation fees</dt>
                      <dd>
                        {formatInr(
                          account?.events.reduce((n, e) => n + e.fee, 0) ?? 0,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Estimated funding net</dt>
                      <dd>
                        {formatInr(
                          account?.events
                            .filter((e) => e.kind === "FUNDING")
                            .reduce((n, e) => n + e.pnl, 0) ?? 0,
                        )}
                      </dd>
                    </div>
                  </dl>
                  {account?.events
                    .slice()
                    .reverse()
                    .map((e) => (
                      <article key={e.id}>
                        <header>
                          <b>
                            {e.symbol} · {e.kind}
                          </b>
                          <time>{new Date(e.at).toLocaleString("en-IN")}</time>
                        </header>
                        <p>
                          {e.contracts} contracts · {dollars(e.price)} · net{" "}
                          {formatInr(e.pnl - e.fee)}
                        </p>
                        <small>{e.detail}</small>
                      </article>
                    ))}
                  {!account?.events.length && <p>No activity yet.</p>}
                </div>
              )}
              <p className="global-disclosure">
                Monitoring runs only while the app is open and visible. Quote
                snapshots refresh every 5 seconds; candles every 10 seconds.
                High-leverage fills and liquidation are simulations, not
                exchange guarantees.
              </p>
              {account?.fundingGap && (
                <p className="global-warning">
                  Funding occurred during an unmonitored interval. It has not
                  been invented or silently charged. New entries are blocked;
                  you can reduce or close existing positions. Reported P&L
                  excludes missed funding.
                </p>
              )}
            </>
          )}
          {symbol !== "BRENT" && <div ref={setAlertHost} />}
          {error && (
            <p role="alert" className="global-warning">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="global-notice">
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss global notice"
              >
                <X size={16} />
              </button>
            </p>
          )}
          {confirm && (
            <div className="global-confirm-backdrop">
              <section
                role="dialog"
                aria-modal="true"
                aria-label="Confirm paper order"
              >
                <h3>
                  {side === "BUY" ? "Long" : "Short"} {symbol}
                </h3>
                <p>
                  {quantity} contracts · {leverage}× · {orderType}
                </p>
                <p>Estimated margin + entry fee: {formatInr(margin + fee)}</p>
                <p>
                  Quotes are checked again at confirmation. Isolated margin can
                  be lost; the estimate can change.
                </p>
                <button onClick={() => setConfirm(false)}>Back</button>
                <button
                  className="primary-button"
                  disabled={busy || !isFresh}
                  onClick={submit}
                >
                  Confirm paper order
                </button>
              </section>
            </div>
          )}
          {functions && (
            <ChartFunctionMenu
              indicators={indicators}
              excluded={excluded}
              onToggleIndicator={(id) =>
                setIndicators((v) => ({ ...v, [id]: !v[id] }))
              }
              onAction={(type) => setAction({ type, token: Date.now() })}
              onClose={() => setFunctions(false)}
              onDrawing={(id) => {
                setTool(id);
                setFunctions(false);
              }}
            />
          )}
          {styleMenu && <ChartStyleMenu onClose={() => setStyleMenu(false)} />}
          {compareMenu && <CompareSymbolPicker instruments={GLOBAL_CHART_INSTRUMENTS} currentKey={instrument.instrumentKey} onClose={() => setCompareMenu(false)} />}
          {drawings && (
            <DrawingToolLibrary
              activeTool={tool}
              onSelect={setTool}
              onClose={() => setDrawings(false)}
            />
          )}
        </section>
      )}
    </>
  );
}
