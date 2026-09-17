"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { priceTaskError, priceTaskMatches, freshTaskQuote, type PriceRequest, type PriceTask } from "@/lib/price-actions";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { useTransientBack } from "@/components/useTransientBack";
import { AlarmClock, ArrowDown, ArrowUp, Check, CircleSlash, Clock3, Search, X } from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
const KEY = "papertrade-price-tasks-v1";
const money = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function PriceActions({ request, onClose, onFill, onValidate, marketOpen, intradayOpen, onNotice, visible, triggerHost, onCreateAlert, onTasksChange, ownerId = "local" }: {
  request: PriceRequest | null; onClose: () => void; onFill: (task: PriceTask, price: number) => string | null;
  onValidate?: (task: PriceTask) => string | null;
  marketOpen: boolean; intradayOpen: boolean; onNotice: (message: string) => void; visible: boolean; ownerId?: string;
  triggerHost?: HTMLElement | null;
  onCreateAlert?: () => void;
  onTasksChange?: (tasks: PriceTask[]) => void;
}) {
  const storageKey = `${KEY}:${ownerId}`;
  const [tasks, setTasks] = useState<PriceTask[]>([]);
  const tasksRef = useRef(tasks);
  const callbacks = useRef({ onFill, marketOpen, intradayOpen, onNotice });
  callbacks.current = { onFill, marketOpen, intradayOpen, onNotice };
  const [manage, setManage] = useState(false);
  const [tab, setTab] = useState<"list" | "log">("list");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "alert" | "order">("all");
  const sheetRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState("alert");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"Limit" | "SL">("Limit");
  const [product, setProduct] = useState<"DELIVERY" | "INTRADAY">("DELIVERY");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  function save(next: PriceTask[]) { localStorage.setItem(storageKey, JSON.stringify(next.slice(0, 100))); tasksRef.current = next; setTasks(next); }
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]"); if (Array.isArray(saved)) { tasksRef.current = saved.filter(t => t?.id && t?.instrument?.instrumentKey && t.expiresAt && !priceTaskError(t)).slice(0, 100); setTasks(tasksRef.current); } } catch {} }, [storageKey]);
  useEffect(() => { onTasksChange?.(tasks); }, [tasks, onTasksChange]);
  useEffect(() => { if (request) { setMode(request.mode ?? "alert"); setPrice(request.price.toFixed(2)); setQuantity(String(request.instrument.lotSize || 1)); setSide(request.side ?? "BUY"); setOrderType(request.orderType ?? "Limit"); setProduct("DELIVERY"); setCondition(request.price >= request.instrument.price ? "above" : "below"); setError(""); } }, [request]);
  function dismiss() { if (request) onClose(); else setManage(false); }
  useTransientBack(Boolean(request || manage), dismiss);
  useEffect(() => {
    if (!request && !manage) return;
    const previous = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    sheet?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !sheet) return;
      const items = [...sheet.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [Boolean(request), manage]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    async function poll() {
      const now = Date.now();
      let current = tasksRef.current;
      if (current.some(t => t.status === "pending" && t.expiresAt <= now)) { current = current.map(t => t.status === "pending" && t.expiresAt <= now ? { ...t, status: "expired" as const, completedAt: now } : t); save(current); }
      const pending = current.filter(t => t.status === "pending");
      if (pending.length && callbacks.current.marketOpen) {
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 9000);
        try {
          const keys = [...new Set(pending.map(t => t.instrument.instrumentKey))].join(",");
          const response = await fetch(`/api/upstox/quotes?keys=${encodeURIComponent(keys)}`, { signal: controller.signal });
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error("Price monitoring paused: quotes unavailable. Retrying automatically.");
          if (disposed) return;
          setFeedError("");
          const trigger = () => {
          const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
          if (Array.isArray(stored)) { tasksRef.current = stored; setTasks(stored); }
          for (const t of tasksRef.current.filter(t => t.status === "pending" && t.expiresAt > Date.now())) {
            const q = payload.quotes?.[t.instrument.instrumentKey];
            if (!callbacks.current.marketOpen || !freshTaskQuote(q, Date.now()) || !priceTaskMatches(t, q.lastPrice)) continue;
            if (t.product === "INTRADAY" && t.kind === "order" && !callbacks.current.intradayOpen) continue;
            const failure = t.kind === "order" ? callbacks.current.onFill(t, q.lastPrice) : null;
            const status = failure ? "rejected" : t.kind === "alert" ? "triggered" : "filled";
            const message = failure ?? `${t.instrument.symbol} ${t.kind === "alert" ? "price alert" : "paper order filled"} at ₹${q.lastPrice.toFixed(2)}`;
            save(tasksRef.current.map(item => item.id === t.id ? { ...item, status, message, completedAt: Date.now(), triggeredPrice: q.lastPrice } : item));
            addPaperTradeNotification({ id: t.id, kind: "trade", title: t.kind === "alert" ? "Price alert" : "Price order", body: message, symbol: t.instrument.symbol, instrumentKey: t.instrument.instrumentKey });
            callbacks.current.onNotice(message);
            // One fill per cycle: let the portfolio update before testing another order's funds.
            if (t.kind === "order") break;
          }
          };
          if (navigator.locks) await navigator.locks.request(storageKey, { ifAvailable: true }, lock => { if (lock && !disposed) trigger(); });
          else trigger();
        } catch (e) { if (!disposed) setFeedError(e instanceof Error ? e.message : "Quotes unavailable; retrying."); }
        finally { clearTimeout(timeout); }
      }
      if (!disposed) timer = setTimeout(poll, 10000);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, []);
  function submit() {
    if (!request) return;
    const now = Date.now();
    const dayEnd = new Date(now + 19800000); dayEnd.setUTCHours(15, 30, 0, 0);
    const task: PriceTask = { id: crypto.randomUUID(), instrument: request.instrument, kind: mode as "alert" | "order", price: Number(price), quantity: Number(quantity), side, orderType, product, condition, status: "pending", createdAt: now, expiresAt: product === "INTRADAY" && mode === "order" ? dayEnd.getTime() - 19800000 : now + 7 * 86400000 };
    const invalid = priceTaskError(task) || (task.kind === "order" ? onValidate?.(task) : null);
    if (invalid) { setError(invalid); return; }
    if (mode === "order" && product === "INTRADAY" && (!intradayOpen || !marketOpen)) { setError("Intraday orders can only be queued during the trading session."); return; }
    if (tasksRef.current.filter(t => t.status === "pending").length >= 30) { setError("Cancel an active item before adding more (maximum 30)."); return; }
    try { save([task, ...tasksRef.current].slice(0, 100)); } catch { setError("Device storage is unavailable. Nothing was queued."); return; }
    onNotice(mode === "alert" ? "Price alert saved" : "Paper price order queued"); onClose();
  }
  const activeCount = tasks.filter(t => t.status === "pending").length;
  const matching = tasks.filter(t => (tab === "list" ? t.status === "pending" : t.status !== "pending") && (filter === "all" || t.kind === filter) && `${t.instrument.symbol} ${t.instrument.name} ${t.price} ${money(t.price)} ${t.condition} ${t.status} ${t.message ?? ""}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
  return <>
    {visible && triggerHost && createPortal(<button className="price-tasks-button" aria-label={`Open alerts${activeCount ? `, ${activeCount} active` : ""}`} title="Alerts and paper orders" onClick={() => setManage(true)}><AlarmClock size={20} strokeWidth={1.8} aria-hidden="true" />{activeCount > 0 && <span className="price-tasks-count">{activeCount}</span>}</button>, triggerHost)}
    {(request || manage) && <div className="price-action-backdrop" onClick={dismiss}><section ref={sheetRef} tabIndex={-1} className={`price-action-sheet ${!request ? "price-alert-manager" : "price-alert-form"}`} role="dialog" aria-modal="true" aria-label={request ? "Price action" : "Alerts"} onClick={e => e.stopPropagation()}>
      <div className="price-sheet-handle" aria-hidden="true" />
      <header><div className="price-sheet-title"><AlarmClock size={23} /><div><h2>{request?.instrument.symbol ?? "Alerts"}</h2><small>{request ? request.instrument.name : "Your levels. Your attention."}</small></div></div><button className="price-icon-button" onClick={dismiss} aria-label="Close price actions"><X size={21} /></button></header>
      {request ? <><h3>{mode === "alert" ? "Create price alert" : "Add paper order"}</h3>
        <label>{mode === "alert" ? "Alert price" : orderType === "SL" ? "Stop trigger price" : "Limit price"} (₹)<input autoFocus type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>
        {mode === "alert" ? <fieldset className="price-condition"><legend>Notify when</legend><div role="radiogroup" aria-label="Alert condition">{(["above", "below"] as const).map(value => <button type="button" role="radio" aria-checked={condition === value} key={value} onClick={() => setCondition(value)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); setCondition(value === "above" ? "below" : "above"); (e.currentTarget.parentElement?.querySelector(`[data-condition="${value === "above" ? "below" : "above"}"]`) as HTMLElement)?.focus(); } }} data-condition={value}>{value === "above" ? <ArrowUp size={20} /> : <ArrowDown size={20} />}<span><b>{value === "above" ? "At or above" : "At or below"}</b><small>{value === "above" ? "Price rises to your level" : "Price falls to your level"}</small></span>{condition === value && <Check size={16} />}</button>)}</div></fieldset> : <>
          <div className="price-form-grid"><label>Side<select value={side} onChange={e => setSide(e.target.value as typeof side)}><option>BUY</option><option>SELL</option></select></label><label>Order type<select value={orderType} onChange={e => setOrderType(e.target.value as typeof orderType)}><option value="Limit">Limit</option><option value="SL">Stop market</option></select></label></div>
          <div className="price-form-grid"><label>Quantity<input type="number" min={request.instrument.lotSize || 1} step={request.instrument.lotSize || 1} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Product<select value={product} onChange={e => setProduct(e.target.value as typeof product)}><option value="DELIVERY">{["OPTION", "FUTURE"].includes(request.instrument.assetType ?? "") ? "Carry forward" : "Delivery"}</option><option value="INTRADAY">Intraday · today</option></select></label></div>
          <p>Order value at selected price: ₹{(Math.max(0, Number(price) || 0) * Math.max(0, Number(quantity) || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}. {orderType === "Limit" ? "Fills only at your limit or better." : "Triggers a market fill; the actual fill may differ from your stop price."} Funds, holdings, lot size and trading limits are checked again before filling. Cash is not reserved until a fill.</p>
        </>}
        <p>Monitored every 10 seconds while this app is open, during market hours. No background/offline guarantee. {product === "INTRADAY" && mode === "order" ? "Expires at today's close." : "Expires in 7 days."}</p>
        {error && <p role="alert">{error}</p>}<button className="price-action-primary" onClick={submit}>{mode === "alert" ? "Create alert" : "Confirm paper order"}</button>
      </> : <>
        <label className="price-alert-search"><Search size={18} /><input aria-label={tab === "list" ? "Search alerts" : "Search alert log"} placeholder={tab === "list" ? "Search alerts or symbols" : "Search alert history"} value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="price-icon-button" aria-label="Clear alert search" onClick={() => setSearch("")}><X size={16} /></button>}</label>
        <div className="price-alert-tabs" role="tablist" aria-label="Alert views">{(["list", "log"] as const).map(value => <button role="tab" id={`alerts-tab-${value}`} aria-controls="alerts-panel" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{value === "list" ? "List" : "Log"}<span>{tasks.filter(t => value === "list" ? t.status === "pending" : t.status !== "pending").length}</span></button>)}</div>
        <div className="price-alert-filters" aria-label="Item type">{(["all", "alert", "order"] as const).map(value => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "alert" ? "Alerts" : "Paper orders"}</button>)}</div>
        {feedError && <p role="status">{feedError}</p>}
        <div className="price-alert-results" id="alerts-panel" role="tabpanel" aria-labelledby={`alerts-tab-${tab}`}>
          {!matching.length && <div className="price-alert-empty"><div>{tab === "log" ? <Clock3 size={38} strokeWidth={1.3} /> : <AlarmClock size={38} strokeWidth={1.3} />}</div><h3>{search ? "No matching items" : tab === "log" ? "No alert activity yet" : "No active alerts"}</h3><p>{search ? "Try another symbol or price." : tab === "log" ? "Triggered alerts and completed or cancelled items will appear here." : "Set a price level and we’ll watch it while the app is open."}</p></div>}
          {matching.map(t => <article key={t.id} className="price-alert-item"><StockLogo {...t.instrument} size={34} /><div className="price-alert-item-copy"><b>{t.instrument.symbol}</b><span>{t.kind === "alert" ? t.condition === "above" ? "At or above" : "At or below" : `${t.side} ${t.quantity} · ${t.orderType}`} <strong>₹{money(t.price)}</strong></span><small><i className={`price-alert-status ${t.status}`}>{t.status === "pending" ? "Active" : t.status.charAt(0).toUpperCase() + t.status.slice(1)}</i> · {t.kind === "alert" ? "Price alert" : "Paper order"}{t.completedAt ? ` · ${new Date(t.completedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</small>{t.message && <p>{t.message}</p>}</div>{t.status === "pending" && <button className="price-icon-button" aria-label={`Cancel ${t.kind} for ${t.instrument.symbol} at ${t.price}`} title="Cancel" onClick={() => { try { save(tasksRef.current.map(item => item.id === t.id ? { ...item, status: "cancelled", completedAt: Date.now() } : item)); onNotice(t.kind === "alert" ? "Alert cancelled" : "Paper order cancelled"); } catch { onNotice("Could not save the change. Please try again."); } }}><CircleSlash size={19} /></button>}</article>)}
        </div>
        <footer className="price-alert-footer"><p>Monitored in-app during market hours. Keep the app open.</p>{onCreateAlert && <button className="price-action-primary" onClick={onCreateAlert}><AlarmClock size={18} />Create alert</button>}</footer>
      </>}
    </section></div>}
  </>;
}
