"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { priceTaskError, priceTaskMatches, freshTaskQuote, type PriceRequest, type PriceTask } from "@/lib/price-actions";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { useTransientBack } from "@/components/useTransientBack";
const KEY = "papertrade-price-tasks-v1";
export function PriceActions({ request, onClose, onFill, onValidate, marketOpen, intradayOpen, onNotice, visible, triggerHost, ownerId = "local" }: {
  request: PriceRequest | null; onClose: () => void; onFill: (task: PriceTask, price: number) => string | null;
  onValidate?: (task: PriceTask) => string | null;
  marketOpen: boolean; intradayOpen: boolean; onNotice: (message: string) => void; visible: boolean; ownerId?: string;
  triggerHost?: HTMLElement | null;
}) {
  const storageKey = `${KEY}:${ownerId}`;
  const [tasks, setTasks] = useState<PriceTask[]>([]);
  const tasksRef = useRef(tasks);
  const callbacks = useRef({ onFill, marketOpen, intradayOpen, onNotice });
  callbacks.current = { onFill, marketOpen, intradayOpen, onNotice };
  const [manage, setManage] = useState(false);
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
  useEffect(() => { if (request) { setMode(request.mode ?? "alert"); setPrice(request.price.toFixed(2)); setQuantity(String(request.instrument.lotSize || 1)); setSide(request.side ?? "BUY"); setOrderType(request.orderType ?? "Limit"); setProduct("DELIVERY"); setCondition(request.price >= request.instrument.price ? "above" : "below"); setError(""); } }, [request]);
  useTransientBack(Boolean(request || manage), () => { onClose(); setManage(false); });
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    async function poll() {
      const now = Date.now();
      let current = tasksRef.current;
      if (current.some(t => t.status === "pending" && t.expiresAt <= now)) { current = current.map(t => t.status === "pending" && t.expiresAt <= now ? { ...t, status: "expired" as const } : t); save(current); }
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
            save(tasksRef.current.map(item => item.id === t.id ? { ...item, status, message } : item));
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
  return <>
    {visible && triggerHost && createPortal(<button className="price-tasks-button" onClick={() => setManage(true)}>Alerts &amp; price orders {tasks.filter(t => t.status === "pending").length || ""}</button>, triggerHost)}
    {(request || manage) && <div className="price-action-backdrop" onClick={() => { onClose(); setManage(false); }}><section className="price-action-sheet" role="dialog" aria-modal="true" aria-label={request ? "Price action" : "Alerts and price orders"} onClick={e => e.stopPropagation()}>
      <header><b>{request?.instrument.symbol ?? "Alerts & price orders"}</b><button onClick={() => { onClose(); setManage(false); }} aria-label="Close price actions">×</button></header>
      {request ? <><h3>{mode === "alert" ? "Create price alert" : "Add paper order"}</h3>
        <label>{mode === "alert" ? "Alert price" : orderType === "SL" ? "Stop trigger price" : "Limit price"} (₹)<input autoFocus type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></label>
        {mode === "alert" ? <label>Notify when<select value={condition} onChange={e => setCondition(e.target.value as typeof condition)}><option value="above">Price reaches or goes above</option><option value="below">Price reaches or goes below</option></select></label> : <>
          <div className="price-form-grid"><label>Side<select value={side} onChange={e => setSide(e.target.value as typeof side)}><option>BUY</option><option>SELL</option></select></label><label>Order type<select value={orderType} onChange={e => setOrderType(e.target.value as typeof orderType)}><option value="Limit">Limit</option><option value="SL">Stop market</option></select></label></div>
          <div className="price-form-grid"><label>Quantity<input type="number" min={request.instrument.lotSize || 1} step={request.instrument.lotSize || 1} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Product<select value={product} onChange={e => setProduct(e.target.value as typeof product)}><option value="DELIVERY">{["OPTION", "FUTURE"].includes(request.instrument.assetType ?? "") ? "Carry forward" : "Delivery"}</option><option value="INTRADAY">Intraday · today</option></select></label></div>
          <p>Order value at selected price: ₹{(Math.max(0, Number(price) || 0) * Math.max(0, Number(quantity) || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}. {orderType === "Limit" ? "Fills only at your limit or better." : "Triggers a market fill; the actual fill may differ from your stop price."} Funds, holdings, lot size and trading limits are checked again before filling. Cash is not reserved until a fill.</p>
        </>}
        <p>Monitored every 10 seconds while this app is open, during market hours. No background/offline guarantee. {product === "INTRADAY" && mode === "order" ? "Expires at today's close." : "Expires in 7 days."}</p>
        {error && <p role="alert">{error}</p>}<button className="price-action-primary" onClick={submit}>{mode === "alert" ? "Create alert" : "Confirm paper order"}</button>
      </> : <><p>In-app alerts and simulated orders. Keep the app open for monitoring.</p>{feedError && <p role="status">{feedError}</p>}{!tasks.length && <p>No alerts or price orders yet. Use the + beside the chart crosshair price.</p>}{tasks.map(t => <article key={t.id}><b>{t.instrument.symbol} · {t.kind === "alert" ? `Alert ${t.condition}` : `${t.side} ${t.quantity} · ${t.orderType}`} ₹{t.price.toFixed(2)}</b><small>{t.status} {t.message ? `· ${t.message}` : ""}</small>{t.status === "pending" && <button onClick={() => save(tasksRef.current.map(item => item.id === t.id ? { ...item, status: "cancelled" } : item))}>Cancel</button>}</article>)}</>}
    </section></div>}
  </>;
}
