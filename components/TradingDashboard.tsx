"use client";

import {
  Activity, BarChart3, Bell, Bot, BoxSelect, Cable, ChevronDown, ChevronRight,
  Eye, EyeOff, FlipHorizontal2, Layers3, LineChart, ListFilter, LockKeyhole,
  Magnet, Maximize2, Menu, Minus, MousePointer2, PanelLeftClose, Plus, Radio, Ruler,
  Search, Settings, SlidersHorizontal, Sparkles, Star, Target, Trash2,
  TrendingDown, TrendingUp, UserRound, WalletCards, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketChart, type DrawingTool, type FeedStatus } from "@/components/MarketChart";
import { formatInr, instruments, type Instrument } from "@/lib/market";
import type { NormalizedQuote } from "@/lib/upstox";

type Order = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "COMPLETE";
  time: string;
};

const watchlistTabs = ["NIFTY 50", "BANK NIFTY", "NIFTY 500", "ALL NSE"] as const;
const periods = ["1m", "5m", "15m", "1H", "3H", "4H", "1D"];
const drawingTools: { id: DrawingTool; label: string; icon: LucideIcon }[] = [
  { id: "cursor", label: "Cursor", icon: MousePointer2 },
  { id: "trend", label: "Trend line", icon: TrendingUp },
  { id: "horizontal", label: "Horizontal line", icon: Minus },
  { id: "ray", label: "Horizontal ray", icon: Radio },
  { id: "channel", label: "Parallel channel", icon: FlipHorizontal2 },
  { id: "rectangle", label: "Rectangle + mid", icon: BoxSelect },
  { id: "fib", label: "Fibonacci", icon: ListFilter },
  { id: "range", label: "Price range", icon: Ruler },
  { id: "long", label: "Long position", icon: TrendingUp },
  { id: "short", label: "Short position", icon: TrendingDown },
];

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><TrendingUp size={20} strokeWidth={3} /></span>
      <span>PaperTrade <b>IN</b></span>
    </div>
  );
}

function ApiSettings({ onClose }: { onClose: () => void }) {
  const [broker, setBroker] = useState("Upstox");
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/upstox/status", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => setConfigured(Boolean(payload.configured)))
      .catch(() => {
        if (!controller.signal.aborted) setConfigured(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="api-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">Market data connection</span><h2 id="api-title">Broker API settings</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        </div>
        <div className="security-note"><LockKeyhole size={17} /> Broker tokens are read only by secure server routes. They are never sent to the browser.</div>
        <div className="connection-settings">
          <label>Broker
            <select name="broker" value={broker} onChange={(event) => setBroker(event.target.value)}>
              <option>Upstox</option><option>Dhan</option><option>Zerodha Kite</option><option>Angel One</option><option>Fyers</option>
            </select>
          </label>
          {broker === "Upstox" ? (
            <div className={`connection-state ${configured ? "connected" : configured === false ? "missing" : "checking"}`}>
              <span />
              <div>
                <b>{configured === null ? "Checking Vercel…" : configured ? "Upstox token configured" : "Upstox token not found"}</b>
                <small>
                  {configured
                    ? "Charts and quotes will use authenticated Upstox market data when available."
                    : "Add UPSTOX_ACCESS_TOKEN in Vercel Production environment variables, then redeploy."}
                </small>
              </div>
            </div>
          ) : (
            <p className="field-help">This broker adapter is not implemented yet. Upstox is the active market-data provider.</p>
          )}
          <p className="field-help">Paper orders remain local simulations and never reach Upstox or an exchange.</p>
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

export function TradingDashboard() {
  const [selected, setSelected] = useState<Instrument>(instruments[0]);
  const [watchlist, setWatchlist] = useState<(typeof watchlistTabs)[number]>("NIFTY 50");
  const [search, setSearch] = useState("");
  const [timeframe, setTimeframe] = useState("5m");
  const [livePrice, setLivePrice] = useState(selected.price);
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [toolSignal, setToolSignal] = useState(0);
  const [magnet, setMagnet] = useState(true);
  const [hiddenDrawings, setHiddenDrawings] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState("Market");
  const [orders, setOrders] = useState<Order[]>([]);
  const [balance, setBalance] = useState(1000000);
  const [showApi, setShowApi] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState<Date | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>({
    mode: "loading",
    message: "Connecting to Upstox…",
  });
  const [marketQuotes, setMarketQuotes] = useState<Record<string, NormalizedQuote>>({});

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setOrders(JSON.parse(localStorage.getItem("papertrade-orders") ?? "[]") as Order[]);
        setBalance(Number(localStorage.getItem("papertrade-balance") ?? "1000000"));
      } catch { /* Ignore malformed local demo data. */ }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(new Date()), 0);
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const keys = instruments.map((item) => item.instrumentKey).join(",");

    async function loadWatchlistQuotes() {
      try {
        const response = await fetch(`/api/upstox/quotes?keys=${encodeURIComponent(keys)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok?: boolean;
          quotes?: Record<string, NormalizedQuote>;
        };
        if (response.ok && payload.ok && payload.quotes) {
          setMarketQuotes(payload.quotes);
        }
      } catch {
        // The chart reports the connection error; static watchlist values remain usable.
      }
    }

    void loadWatchlistQuotes();
    const interval = window.setInterval(() => void loadWatchlistQuotes(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const filtered = useMemo(() => instruments.filter((item) => {
    const matchesList = watchlist === "ALL NSE" || item.category === watchlist;
    const term = search.trim().toLowerCase();
    return matchesList && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  }), [search, watchlist]);
  const handlePrice = useCallback((value: number) => setLivePrice(value), []);
  const handleFeedStatus = useCallback((status: FeedStatus) => setFeedStatus(status), []);
  const selectedQuote = marketQuotes[selected.symbol];
  const selectedChange = selectedQuote?.changePercent ?? selected.change;
  const selectedNetChange = selectedQuote?.netChange ?? livePrice * selected.change / 100;
  const orderValue = livePrice * quantity;
  const margin = orderValue * 0.2;

  function placeOrder() {
    if (!Number.isFinite(quantity) || quantity < 1) return;
    const order: Order = {
      id: `${Date.now()}`, symbol: selected.symbol, side, quantity, price: livePrice,
      status: "COMPLETE", time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
    const nextOrders = [order, ...orders];
    const nextBalance = side === "BUY" ? balance - margin : balance + margin;
    setOrders(nextOrders);
    setBalance(nextBalance);
    localStorage.setItem("papertrade-orders", JSON.stringify(nextOrders));
    localStorage.setItem("papertrade-balance", String(nextBalance));
    setToast(`${side === "BUY" ? "Bought" : "Sold"} ${quantity} ${selected.symbol} at ${formatInr(livePrice)}`);
    window.setTimeout(() => setToast(""), 3200);
  }

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open watchlist"><Menu size={21} /></button>
        <Brand />
        <nav className="main-nav" aria-label="Main navigation">
          <button className="nav-active">Trade</button><button onClick={() => setOrdersOpen(true)}>Orders</button><button>Positions</button><button>Analytics</button>
        </nav>
        <div className="top-actions">
          <div className={`market-status ${feedStatus.mode}`} title={feedStatus.message}>
            <span /> {feedStatus.mode === "live" ? "Upstox data" : feedStatus.mode === "loading" ? "Connecting" : "Fallback data"}
          </div>
          <button className="funds-button"><WalletCards size={16} /> {formatInr(balance)}</button>
          <button className="api-button" onClick={() => setShowApi(true)}><Cable size={16} /> Broker API</button>
          <button className="icon-button" aria-label="Notifications"><Bell size={19} /></button>
          <button className="profile-button" aria-label="Profile"><UserRound size={18} /></button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`watchlist-panel ${sidebarOpen ? "mobile-open" : ""}`}>
          <div className="mobile-panel-head"><Brand /><button className="icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close watchlist"><PanelLeftClose size={20} /></button></div>
          <div className="watchlist-heading">
            <div><span className="eyebrow">Watchlist</span><h2>Indian markets</h2></div>
            <button className="icon-button" aria-label="Watchlist options"><SlidersHorizontal size={17} /></button>
          </div>
          <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search NSE stocks" /><kbd>/</kbd></div>
          <div className="watchlist-tabs">
            {watchlistTabs.map((tab) => <button key={tab} onClick={() => setWatchlist(tab)} className={watchlist === tab ? "active" : ""}>{tab}</button>)}
          </div>
          <div className="instrument-list">
            {filtered.map((item) => {
              const quote = marketQuotes[item.symbol];
              const price = quote?.lastPrice ?? item.price;
              const change = quote?.changePercent ?? item.change;
              return (
                <button key={item.symbol} className={`instrument-row ${selected.symbol === item.symbol ? "selected" : ""}`} onClick={() => { setSelected(item); setLivePrice(price); setSidebarOpen(false); }}>
                  <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
                  <span className="instrument-name"><b>{item.symbol}</b><small>{item.name}</small></span>
                  <span className="instrument-price"><b>{price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</b><small className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small></span>
                  <Star size={15} />
                </button>
              );
            })}
            {!filtered.length && <div className="empty-list">No matching symbols in this demo list.</div>}
          </div>
          <div className="demo-list-note"><Sparkles size={15} /> Supported NSE watchlist quotes refresh from Upstox every 10 seconds when the server token is valid.</div>
        </aside>

        <section className="chart-area">
          <div className="instrument-header">
            <div className="instrument-title">
              <button className="star-button" aria-label="Add to favorites"><Star size={17} /></button>
              <div><div className="title-line"><h1>{selected.symbol}</h1><span>NSE</span><ChevronDown size={16} /></div><p>{selected.name}</p></div>
            </div>
            <div className="quote-block"><strong>{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span className={selectedChange >= 0 ? "positive" : "negative"}>{selectedNetChange >= 0 ? "+" : ""}{selectedNetChange.toFixed(2)} ({selectedChange >= 0 ? "+" : ""}{selectedChange.toFixed(2)}%)</span></div>
            <div className="ohlc-strip"><span>O <b>{(selectedQuote?.open ?? livePrice * 0.995).toFixed(2)}</b></span><span>H <b>{(selectedQuote?.high ?? livePrice * 1.008).toFixed(2)}</b></span><span>L <b>{(selectedQuote?.low ?? livePrice * 0.988).toFixed(2)}</b></span><span>C <b>{(selectedQuote?.previousClose ?? livePrice).toFixed(2)}</b></span></div>
            <div className="header-order-buttons"><button className="compact-sell" onClick={() => setSide("SELL")}>Sell <b>{livePrice.toFixed(2)}</b></button><button className="compact-buy" onClick={() => setSide("BUY")}>Buy <b>{livePrice.toFixed(2)}</b></button></div>
          </div>

          <div className="chart-controls">
            <div className="period-tabs">{periods.map((period) => <button key={period} className={timeframe === period ? "active" : ""} onClick={() => setTimeframe(period)}>{period}</button>)}</div>
            <span className="control-divider" />
            <button className="control-button"><Activity size={16} /> Indicators <span className="pill-count">3</span></button>
            <button className="control-button"><BarChart3 size={16} /> Candles</button>
            <div className="chart-right-controls">
              <a className="control-button advanced-chart-link" href={`/chart?symbol=${selected.symbol}&timeframe=${timeframe}`} target="_blank" rel="noreferrer"><Maximize2 size={16} /> Advanced chart</a>
              <button className="control-button" onClick={() => setShowApi(true)}><Cable size={16} /> Data source</button>
              <button className="icon-button" aria-label="Chart settings"><Settings size={17} /></button>
            </div>
          </div>

          <div className="chart-body">
            <div className="drawing-toolbar" aria-label="Drawing tools">
              {drawingTools.map(({ id, label, icon: Icon }) => <button key={id} className={activeTool === id ? "active" : ""} onClick={() => { setActiveTool(id); setToolSignal((value) => value + 1); }} aria-label={label} title={label}><Icon size={18} /></button>)}
              <span />
              <button className={magnet ? "active" : ""} onClick={() => setMagnet((value) => !value)} aria-label="Magnet" title="Magnet"><Magnet size={18} /></button>
              <button className={hiddenDrawings ? "active" : ""} onClick={() => setHiddenDrawings((value) => !value)} aria-label="Hide drawings" title="Hide drawings">{hiddenDrawings ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              <button className="danger-tool" onClick={() => setClearSignal((value) => value + 1)} aria-label="Delete drawings" title="Delete drawings"><Trash2 size={18} /></button>
            </div>
            <MarketChart key={`${selected.symbol}-${timeframe}`} instrument={selected} timeframe={timeframe} activeTool={activeTool} toolSignal={toolSignal} magnet={magnet} hiddenDrawings={hiddenDrawings} clearSignal={clearSignal} onPrice={handlePrice} onFeedStatus={handleFeedStatus} />
          </div>
          <div className={`chart-statusbar feed-${feedStatus.mode}`} title={feedStatus.message}>
            <div><Radio size={14} /> {feedStatus.message}</div>
            <div>Click + drag to pan · Scroll/pinch to zoom</div>
            <div>{clock ? `India · ${clock.toLocaleDateString("en-IN")} · ${clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST` : "India · IST"}</div>
          </div>
        </section>

        <aside className="order-ticket">
          <div className="ticket-heading"><div><span className="eyebrow">Paper order</span><h2>{selected.symbol}</h2></div><span className="paper-badge">No real money</span></div>
          <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => setSide("BUY")}>Buy</button><button className={side === "SELL" ? "sell-active" : ""} onClick={() => setSide("SELL")}>Sell</button></div>
          <div className="order-type-tabs">{["Market", "Limit", "SL"].map((type) => <button key={type} className={orderType === type ? "active" : ""} onClick={() => setOrderType(type)}>{type}</button>)}</div>
          <div className="input-grid">
            <label>Quantity<div className="stepper"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={15} /></button><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /><button onClick={() => setQuantity(quantity + 1)}><Plus size={15} /></button></div></label>
            {orderType !== "Market" && <label>Price (₹)<input className="text-input" type="number" value={livePrice.toFixed(2)} readOnly /></label>}
          </div>
          <div className="product-select"><label><input type="radio" name="product" defaultChecked /><span><b>Intraday</b><small>MIS · 5x leverage</small></span></label><label><input type="radio" name="product" /><span><b>Delivery</b><small>CNC · no leverage</small></span></label></div>
          <div className="margin-card"><div><span>Order value</span><b>{formatInr(orderValue)}</b></div><div><span>Est. margin</span><b>{formatInr(margin)}</b></div><div><span>Available cash</span><b>{formatInr(balance)}</b></div></div>
          <button className={`place-order ${side.toLowerCase()}`} onClick={placeOrder}>{side} {quantity} {selected.symbol}<ChevronRight size={18} /></button>
          <p className="disclaimer"><Bot size={15} /> Simulation only. Orders are saved on this device and never reach an exchange.</p>
          <div className="recent-orders-mini">
            <div className="section-line"><b>Recent orders</b><button onClick={() => setOrdersOpen(true)}>View all</button></div>
            {orders.slice(0, 3).map((order) => <div className="mini-order" key={order.id}><span className={order.side === "BUY" ? "buy-tag" : "sell-tag"}>{order.side}</span><span><b>{order.symbol}</b><small>{order.quantity} × {order.price.toFixed(2)}</small></span><small>{order.time}</small></div>)}
            {!orders.length && <div className="no-orders">Your first simulated trade will appear here.</div>}
          </div>
        </aside>
      </div>

      <nav className="mobile-bottom-nav"><button className="active"><LineChart size={20} /><span>Trade</span></button><button onClick={() => setSidebarOpen(true)}><Layers3 size={20} /><span>Watchlist</span></button><button onClick={() => setOrdersOpen(true)}><WalletCards size={20} /><span>Orders</span></button><button onClick={() => setShowApi(true)}><Settings size={20} /><span>Settings</span></button></nav>

      {showApi && <ApiSettings onClose={() => setShowApi(false)} />}
      {ordersOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOrdersOpen(false)}>
          <section className="modal orders-modal" role="dialog" aria-modal="true" aria-label="Paper orders" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">Local account</span><h2>Paper order book</h2></div><button className="icon-button" onClick={() => setOrdersOpen(false)}><X size={20} /></button></div>
            <div className="order-table">
              <div className="order-row table-head"><span>Time</span><span>Symbol</span><span>Side</span><span>Qty</span><span>Price</span><span>Status</span></div>
              {orders.map((order) => <div className="order-row" key={order.id}><span>{order.time}</span><b>{order.symbol}</b><span className={order.side === "BUY" ? "positive" : "negative"}>{order.side}</span><span>{order.quantity}</span><span>{formatInr(order.price)}</span><span className="complete-tag">Complete</span></div>)}
              {!orders.length && <div className="order-empty"><WalletCards size={28} /><b>No paper orders yet</b><span>Place a buy or sell simulation from the order ticket.</span></div>}
            </div>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Target size={18} /> {toast}</div>}
    </main>
  );
}
