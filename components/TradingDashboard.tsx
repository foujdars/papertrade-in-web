"use client";

import {
  Activity, BarChart3, Bell, Bot, BoxSelect, Cable, ChevronDown, ChevronRight,
  Eye, EyeOff, FlipHorizontal2, Layers3, LineChart, ListFilter, LockKeyhole,
  Magnet, Menu, Minus, MousePointer2, PanelLeftClose, Plus, Radio, Ruler,
  Search, Settings, SlidersHorizontal, Sparkles, Star, Target, Trash2,
  TrendingDown, TrendingUp, UserRound, WalletCards, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketChart, type DrawingTool } from "@/components/MarketChart";
import { formatInr, instruments, type Instrument } from "@/lib/market";

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
  const [broker, setBroker] = useState("Dhan");
  const [saved, setSaved] = useState(false);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    localStorage.setItem("papertrade-broker-settings", JSON.stringify(Object.fromEntries(form.entries())));
    setSaved(true);
    window.setTimeout(onClose, 800);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="api-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div><span className="eyebrow">Market data connection</span><h2 id="api-title">Broker API settings</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        </div>
        <div className="security-note"><LockKeyhole size={17} /> Saved only in this browser. This demo never sends your credentials anywhere.</div>
        <form onSubmit={save}>
          <label>Broker
            <select name="broker" value={broker} onChange={(event) => setBroker(event.target.value)}>
              <option>Dhan</option><option>Zerodha Kite</option><option>Upstox</option><option>Angel One</option><option>Fyers</option><option>Custom REST API</option>
            </select>
          </label>
          <label>Client ID<input name="clientId" placeholder="Enter broker client ID" autoComplete="off" /></label>
          <label>API key<input name="apiKey" type="password" placeholder="Enter API key" autoComplete="new-password" /></label>
          <label>Access token<input name="accessToken" type="password" placeholder="Paste daily access token" autoComplete="new-password" /></label>
          <p className="field-help">A server-side adapter is required before live broker orders or historical broker candles can be enabled. Paper orders work now with simulated prices.</p>
          <button className="primary-button" type="submit">{saved ? "Saved locally ✓" : `Save ${broker} settings`}</button>
        </form>
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

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setOrders(JSON.parse(localStorage.getItem("papertrade-orders") ?? "[]") as Order[]);
        setBalance(Number(localStorage.getItem("papertrade-balance") ?? "1000000"));
      } catch { /* Ignore malformed local demo data. */ }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const filtered = useMemo(() => instruments.filter((item) => {
    const matchesList = watchlist === "ALL NSE" || item.category === watchlist;
    const term = search.trim().toLowerCase();
    return matchesList && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  }), [search, watchlist]);
  const handlePrice = useCallback((value: number) => setLivePrice(value), []);
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
          <div className="market-status"><span /> NSE open</div>
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
            {filtered.map((item) => (
              <button key={item.symbol} className={`instrument-row ${selected.symbol === item.symbol ? "selected" : ""}`} onClick={() => { setSelected(item); setLivePrice(item.price); setSidebarOpen(false); }}>
                <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
                <span className="instrument-name"><b>{item.symbol}</b><small>{item.name}</small></span>
                <span className="instrument-price"><b>{item.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</b><small className={item.change >= 0 ? "positive" : "negative"}>{item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%</small></span>
                <Star size={15} />
              </button>
            ))}
            {!filtered.length && <div className="empty-list">No matching symbols in this demo list.</div>}
          </div>
          <div className="demo-list-note"><Sparkles size={15} /> Demo universe included. Connect a broker API to search the full NSE instrument master.</div>
        </aside>

        <section className="chart-area">
          <div className="instrument-header">
            <div className="instrument-title">
              <button className="star-button" aria-label="Add to favorites"><Star size={17} /></button>
              <div><div className="title-line"><h1>{selected.symbol}</h1><span>NSE</span><ChevronDown size={16} /></div><p>{selected.name}</p></div>
            </div>
            <div className="quote-block"><strong>{livePrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span className={selected.change >= 0 ? "positive" : "negative"}>{selected.change >= 0 ? "+" : ""}{(livePrice * selected.change / 100).toFixed(2)} ({selected.change >= 0 ? "+" : ""}{selected.change.toFixed(2)}%)</span></div>
            <div className="ohlc-strip"><span>O <b>{(livePrice * 0.995).toFixed(2)}</b></span><span>H <b>{(livePrice * 1.008).toFixed(2)}</b></span><span>L <b>{(livePrice * 0.988).toFixed(2)}</b></span><span>C <b>{livePrice.toFixed(2)}</b></span></div>
            <div className="header-order-buttons"><button className="compact-sell" onClick={() => setSide("SELL")}>Sell <b>{livePrice.toFixed(2)}</b></button><button className="compact-buy" onClick={() => setSide("BUY")}>Buy <b>{livePrice.toFixed(2)}</b></button></div>
          </div>

          <div className="chart-controls">
            <div className="period-tabs">{periods.map((period) => <button key={period} className={timeframe === period ? "active" : ""} onClick={() => setTimeframe(period)}>{period}</button>)}</div>
            <span className="control-divider" />
            <button className="control-button"><Activity size={16} /> Indicators <span className="pill-count">3</span></button>
            <button className="control-button"><BarChart3 size={16} /> Candles</button>
            <div className="chart-right-controls"><button className="control-button" onClick={() => setShowApi(true)}><Cable size={16} /> Data source</button><button className="icon-button" aria-label="Chart settings"><Settings size={17} /></button></div>
          </div>

          <div className="chart-body">
            <div className="drawing-toolbar" aria-label="Drawing tools">
              {drawingTools.map(({ id, label, icon: Icon }) => <button key={id} className={activeTool === id ? "active" : ""} onClick={() => setActiveTool(id)} aria-label={label} title={label}><Icon size={18} /></button>)}
              <span />
              <button className={magnet ? "active" : ""} onClick={() => setMagnet((value) => !value)} aria-label="Magnet" title="Magnet"><Magnet size={18} /></button>
              <button className={hiddenDrawings ? "active" : ""} onClick={() => setHiddenDrawings((value) => !value)} aria-label="Hide drawings" title="Hide drawings">{hiddenDrawings ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              <button className="danger-tool" onClick={() => setClearSignal((value) => value + 1)} aria-label="Delete drawings" title="Delete drawings"><Trash2 size={18} /></button>
            </div>
            <MarketChart key={`${selected.symbol}-${timeframe}-${clearSignal}`} instrument={selected} timeframe={timeframe} activeTool={activeTool} magnet={magnet} hiddenDrawings={hiddenDrawings} onPrice={handlePrice} />
          </div>
          <div className="chart-statusbar"><div><Radio size={14} /> Simulated live feed</div><div>Click + drag to pan · Scroll/pinch to zoom</div><div>India · {new Date().toLocaleDateString("en-IN")} · {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST</div></div>
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
