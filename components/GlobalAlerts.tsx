"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModernSelect } from "./ModernSelect";
import { Bell, X } from "lucide-react";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { readPaperTradeNotifications } from "@/lib/notification-center";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { connectPush } from "@/lib/push-client";
import { getNativeTradeAlert } from "@/lib/native-alert";
import { playPaperTradeTone } from "@/lib/papertrade-tone";
import { Capacitor } from "@capacitor/core";
import { useIndicatorSettings } from "@/lib/indicator-settings";
import { studyDefaults } from "@/lib/indicator-catalog";
import {
  GLOBAL_ALERT_KINDS,
  GLOBAL_DIVERGENCE_SYMBOLS,
  GLOBAL_DIVERGENCE_FRAMES,
  GLOBAL_EMA21_FRAMES,
  isEma21EntryKind,
  ema21EntrySignal,
  globalAlertError,
  evaluateGlobalAlert,
  type GlobalAlert,
} from "@/lib/global-alerts";
import type { PerpSymbol } from "@/lib/global-markets";
import type { CloudGlobalRule } from "@/lib/global-alerts-server";
import { divergenceTitle, emaTitle, levelHitTitle } from "@/lib/notification-policy";
const labels: Record<GlobalAlert["kind"], string> = {
  "price-above": "Price reaches / above",
  "price-below": "Price reaches / below",
  "ema-cross-up": "Price crosses above EMA",
  "ema-cross-down": "Price crosses below EMA",
  "rsi-cross-up": "RSI crosses above",
  "rsi-cross-down": "RSI crosses below",
  "volume-spike": "Volume exceeds average ×",
  "psbb-divergence": "PSBB divergence confirmed",
  "ema21-entry-either": "21 EMA entry · bullish or bearish",
  "ema21-entry-bullish": "21 EMA entry · bullish",
  "ema21-entry-bearish": "21 EMA entry · bearish",
};
const GLOBAL_ALERT_CHANGE_EVENT = "papertrade:global-alerts-change";
export function GlobalAlerts({
  owner,
  visible,
  symbol,
  host,
  embedded = false,
  monitor = true,
  defaultTimeframe,
  onActiveCount,
}: {
  owner: string;
  visible: boolean;
  symbol: PerpSymbol;
  host: HTMLElement | null;
  embedded?: boolean;
  monitor?: boolean;
  defaultTimeframe?: string;
  onActiveCount?: (count: number) => void;
}) {
  const { settings } = useIndicatorSettings();
  const key = `papertrade-global-alerts-v1:${owner}`,
    [rules, setRules] = useState<GlobalAlert[]>([]),
    [message, setMessage] = useState(""),
    [expanded, setExpanded] = useState(false),
    [kind, setKind] = useState<GlobalAlert["kind"]>("price-above"),
    [value, setValue] = useState(""),
    [length, setLength] = useState("14"),
    [timeframe, setTimeframe] = useState<keyof typeof GLOBAL_DIVERGENCE_FRAMES>("5m");
  const [, setCloudReady] = useState(false);
  const [cloudRules, setCloudRules] = useState<CloudGlobalRule[]>([]);
  const [, setCloudMessage] = useState("Checking server monitoring…");
  const alive = useRef(true);
  useEffect(() => {
    if (embedded && visible) {
      setKind("psbb-divergence");
      if (defaultTimeframe && Object.hasOwn(GLOBAL_DIVERGENCE_FRAMES, defaultTimeframe)) setTimeframe(defaultTimeframe as keyof typeof GLOBAL_DIVERGENCE_FRAMES);
    }
  }, [embedded, visible, defaultTimeframe]);
  const cloudRequest = useCallback(async (body?: unknown) => {
    const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
    if (!session || session.user.id !== owner) throw new Error("Sign in to use closed-app alerts.");
    const response = await fetch("/api/global-alerts", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Closed-app alert service unavailable.");
    return payload;
  }, [owner]);
  const refreshCloud = useCallback(async () => {
    try {
      const payload = await cloudRequest();
      setCloudReady(payload.ready === true); setCloudMessage(payload.message);
      const next = payload.rules as CloudGlobalRule[];
      const known = new Set(readPaperTradeNotifications().map(n => n.id));
      for (const rule of next) if (rule.triggeredAt && Date.now() - rule.triggeredAt < 86400000) {
        const id = `global:${owner}:${rule.id}`;
        if (!known.has(id)) try { addPaperTradeNotification({ id, kind: "market", title: isEma21EntryKind(rule.kind) ? emaTitle(rule.symbol, rule.timeframe) : divergenceTitle(rule.symbol, rule.timeframe), body: "", url: `/?symbol=${rule.symbol}&timeframe=${rule.timeframe}` }); } catch { /* The server retains status. */ }
      }
      setCloudRules(next);
    } catch (error) { setCloudReady(false); setCloudMessage(error instanceof Error ? error.message : "Server monitoring unavailable."); }
  }, [cloudRequest, owner]);
  useEffect(() => {
    if (!monitor) return;
    const start = window.setTimeout(() => void refreshCloud(), 0);
    const timer = setInterval(() => { if (!document.hidden) void refreshCloud(); }, 60000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [monitor, refreshCloud]);
  function draftRule(): GlobalAlert {
    const at = Date.now();
    const rule: GlobalAlert = {
      id: crypto.randomUUID(), symbol, kind,
      value: kind === "psbb-divergence" || kind.startsWith("ema") ? 0 : Number(value),
      length: kind === "psbb-divergence" ? 14 : isEma21EntryKind(kind) ? 21 : Number(length),
      ...(isEma21EntryKind(kind) ? { timeframe: Object.hasOwn(GLOBAL_EMA21_FRAMES, timeframe) ? timeframe : "5m" } : {}),
      ...(kind === "psbb-divergence" ? { timeframe, psbbInputs: {
        length: settings.psbb?.inputs.length ?? studyDefaults("psbb").inputs.length,
        left: settings.psbb?.inputs.left ?? studyDefaults("psbb").inputs.left,
        oversold: settings.psbb?.inputs.oversold ?? studyDefaults("psbb").inputs.oversold,
        overbought: settings.psbb?.inputs.overbought ?? studyDefaults("psbb").inputs.overbought,
      } } : {}), createdAt: at, expiresAt: at + 7 * 86400000,
    };
    const invalid = globalAlertError(rule);
    if (invalid || (!value && !kind.startsWith("ema") && kind !== "psbb-divergence")) throw new Error(invalid ?? "Enter a threshold.");
    return rule;
  }
  async function createAlert() {
    try {
      const rule = draftRule();
      const closedApp = kind === "psbb-divergence" || isEma21EntryKind(kind);
      if (closedApp) {
        try {
          await connectPush(true);
          const result = await cloudRequest({ action: "create", rule });
          setCloudRules(result.rules);
          setMessage(`📈 ${symbol} is watched — it rings even when the app is closed`);
          return;
        } catch { /* Keep a local watch if closed-app setup is not available. */ }
      }
      await change(current => {
        if (current.filter(r => !r.cancelled && !r.triggeredAt && r.expiresAt > Date.now()).length >= 20) throw new Error("Maximum 20 active global alerts.");
        setMessage(closedApp ? `📈 ${symbol} is watched here — sign in so it also pings when the app is closed` : `💰 ${symbol} alert is on`);
        return [...current, rule];
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create alert."); }
  }
  function read() {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (
      !Array.isArray(raw) ||
      raw.some(
        (r) =>
          globalAlertError(r) ||
          !Number.isFinite(r.createdAt) ||
          !Number.isFinite(r.expiresAt),
      )
    )
      throw new Error(
        "Saved global alerts could not be read; nothing was reset.",
      );
    return raw as GlobalAlert[];
  }
  async function change(fn: (a: GlobalAlert[]) => GlobalAlert[]) {
    try {
      if (!navigator.locks)
        throw new Error("Safe storage locking unavailable.");
      await navigator.locks.request(key, () => {
        if (!alive.current) return;
        const next = fn(read());
        localStorage.setItem(key, JSON.stringify(next));
        setRules(next);
        window.dispatchEvent(new CustomEvent(GLOBAL_ALERT_CHANGE_EVENT, { detail: key }));
      });
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save alert.");
      return false;
    }
  }
  useEffect(() => {
    alive.current = true;
    try {
      setRules(read());
    } catch (e) {
      setMessage((e as Error).message);
    }
    const storage = (e: StorageEvent) => {
      if (e.key === key)
        try {
          setRules(read());
        } catch {
          setMessage("Alert data unavailable.");
        }
    };
    window.addEventListener("storage", storage);
    const changed = (event: Event) => { if ((event as CustomEvent).detail === key) {
      try { setRules(read()); } catch { setMessage("Alert data unavailable."); }
    } };
    window.addEventListener(GLOBAL_ALERT_CHANGE_EVENT, changed);
    return () => {
      alive.current = false;
      window.removeEventListener("storage", storage);
      window.removeEventListener(GLOBAL_ALERT_CHANGE_EVENT, changed);
    };
  }, [key]);
  const active = rules.some(
    (r) => !r.cancelled && !r.triggeredAt && r.expiresAt > Date.now(),
  );
  useEffect(() => { onActiveCount?.(rules.filter(r => !r.cancelled && !r.triggeredAt && r.expiresAt > Date.now()).length); }, [rules, onActiveCount]);
  useEffect(() => {
    if (!active || !monitor) return;
    let stopped = false,
      busy = false;
    const controller = new AbortController();
    const poll = async () => {
      if (stopped || busy || document.hidden) return;
      busy = true;
      try {
        const pending = read().filter(
          (r) => !r.cancelled && !r.triggeredAt && r.expiresAt > Date.now(),
        );
        for (const s of [...new Set(pending.map((r) => r.symbol))]) {
          const get = async (url: string) => {
            const r = await fetch(url, { signal: controller.signal });
            const p = await r.json();
            if (!r.ok || !p.ok)
              throw new Error(
                "Global alert feed unavailable; monitoring waits for fresh data.",
              );
            return p;
          };
          const forSymbol = pending.filter(r => r.symbol === s);
          const frames = [...new Set(forSymbol.filter(r => !r.kind.startsWith("price")).map(r => r.kind === "psbb-divergence" || isEma21EntryKind(r.kind) ? r.timeframe! : "5m"))];
          const [snapshot, ...histories] = await Promise.all([
            get(`/api/global-markets?symbol=${s}`),
            ...frames.map(frame => get(`/api/global-markets?symbol=${s}&mode=candles&timeframe=${frame}`)),
          ]);
          const candlesByFrame = new Map(frames.map((frame, index) => [frame, histories[index].candles]));
          if (stopped) return;
          const triggered: GlobalAlert[] = [];
          const saved = await change((current) =>
            current.map((rule) => {
              if (
                rule.symbol !== s ||
                !evaluateGlobalAlert(
                  rule,
                  snapshot.quote,
                  candlesByFrame.get(rule.kind === "psbb-divergence" || isEma21EntryKind(rule.kind) ? rule.timeframe! : "5m") ?? [],
                  Date.now(),
                )
              )
                return rule;
              const triggerSide = isEma21EntryKind(rule.kind)
                ? ema21EntrySignal(candlesByFrame.get(rule.timeframe!) ?? [], snapshot.quote, rule.timeframe as keyof typeof GLOBAL_EMA21_FRAMES, Date.now())
                : null;
              const fired = { ...rule, triggeredAt: Date.now(), ...(triggerSide ? { triggerSide } : {}) };
              triggered.push(fired);
              return fired;
            }),
          );
          if (!saved) continue;
          for (const rule of triggered) {
            const title = rule.kind === "psbb-divergence"
              ? divergenceTitle(s, rule.timeframe)
              : isEma21EntryKind(rule.kind)
              ? emaTitle(s, rule.timeframe)
              : levelHitTitle(s);
            const url = rule.kind === "psbb-divergence" || isEma21EntryKind(rule.kind) ? `/?symbol=${s}&timeframe=${rule.timeframe}` : "/";
            try {
              addPaperTradeNotification({
                id: `global:${owner}:${rule.id}`,
                kind: "market",
                title,
                body: "",
                url,
              });
            } catch {
              /* Durable triggered status remains. */
            }
            if (rule.kind === "psbb-divergence" || isEma21EntryKind(rule.kind)) {
              try {
                if (Capacitor.getPlatform() !== "android") void playPaperTradeTone();
                if (Capacitor.getPlatform() === "android") await getNativeTradeAlert().show({ title, body: "", notificationId: `global:${owner}:${rule.id}`, kind: "trade", url });
                else if ("Notification" in window && Notification.permission === "granted") {
                  if ("serviceWorker" in navigator) {
                    const registration = await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/notifications/" });
                    await registration.showNotification(title, { tag: `global:${owner}:${rule.id}`, data: { url } });
                  } else new Notification(title, { tag: `global:${owner}:${rule.id}` });
                }
              } catch { /* The in-app notification remains available. */ }
            }
            setMessage(title);
          }
        }
      } catch (e) {
        if (!stopped)
          setMessage(
            e instanceof Error ? e.message : "Monitoring unavailable.",
          );
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 30000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [active, key, monitor]);
  if (!visible || !host) return null;
  return createPortal(
    <section className="global-alerts">
      {!embedded && <button
        className="global-entry"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Bell size={17} />
        Price & technical alerts{" "}
        <span>
          {
            rules.filter(
              (r) => !r.cancelled && !r.triggeredAt && r.expiresAt > Date.now(),
            ).length
          }{" "}
          active
        </span>
      </button>}
      {(expanded || embedded) && (
        <div className="global-ticket">
          <h3>{symbol} alert</h3>
          <p className="global-disclosure">Once only · expires in 7 days. Setup alerts ping you even when the app is closed 😊</p>
          <div className="global-input-grid">
            <ModernSelect
              label="Condition"
              ariaLabel="Global alert condition"
              value={kind}
              onChange={setKind}
              choices={GLOBAL_ALERT_KINDS.filter(value => (value !== "psbb-divergence" && !isEma21EntryKind(value)) || GLOBAL_DIVERGENCE_SYMBOLS.some(eligible => eligible === symbol)).map((value) => ({
                value,
                label: labels[value],
              }))}
            />
            {kind !== "psbb-divergence" && !kind.startsWith("ema") && (
              <label>
                Threshold / multiplier
                <input
                  aria-label="Global alert threshold"
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
            )}
            {kind !== "psbb-divergence" && !isEma21EntryKind(kind) && !kind.startsWith("price") && (
              <label>
                Indicator / average length
                <input
                  type="number"
                  min="2"
                  max="200"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </label>
            )}
            {kind === "psbb-divergence" && <ModernSelect label="Timeframe" ariaLabel="PSBB alert timeframe" value={timeframe} onChange={value => setTimeframe(value as keyof typeof GLOBAL_DIVERGENCE_FRAMES)} choices={Object.keys(GLOBAL_DIVERGENCE_FRAMES).map(value => ({ value, label: value }))} />}
            {isEma21EntryKind(kind) && <ModernSelect label="Timeframe" ariaLabel="21 EMA alert timeframe" value={Object.hasOwn(GLOBAL_EMA21_FRAMES, timeframe) ? timeframe : "5m"} onChange={value => setTimeframe(value as keyof typeof GLOBAL_DIVERGENCE_FRAMES)} choices={Object.keys(GLOBAL_EMA21_FRAMES).map(value => ({ value, label: value }))} />}
          </div>
          {isEma21EntryKind(kind) && <p className="global-disclosure">A 5m or 15m candle closes across EMA 21; within two candles an opposite-colour candle closes on the new side. Entry alerts when a matching-colour candle breaks that candle’s high or low within the next three candles.</p>}
          {(kind === "psbb-divergence" || isEma21EntryKind(kind)) && <p className="global-disclosure">We'll ping you even when the app is closed 😊</p>}
          <button onClick={() => void createAlert()}>
            Create global alert
          </button>
          {cloudRules.filter(r => r.symbol === symbol).map(r => <article className="global-alert-row" key={r.id}><span><b>{r.symbol} · {labels[r.kind]}</b><small>{r.timeframe} · Server · {r.cancelled ? "Cancelled" : r.triggeredAt ? "Triggered" : r.expiresAt <= Date.now() ? "Expired" : "Monitoring while app closed"}</small></span>{!r.cancelled && !r.triggeredAt && <button aria-label={`Cancel server alert ${r.symbol}`} onClick={() => void cloudRequest({ action: "cancel", id: r.id }).then(result => { setCloudRules(result.rules); setMessage("Alert cancelled."); }).catch(error => setMessage(error instanceof Error ? error.message : "Could not cancel alert."))}><X size={16} /></button>}</article>)}
          {rules
            .slice()
            .reverse()
            .map((r) => (
              <article className="global-alert-row" key={r.id}>
                <span>
                  <b>
                    {r.symbol} · {labels[r.kind]}
                  </b>
                  <small>
                    {r.kind === "psbb-divergence" ? `${r.timeframe} · divergence only` : isEma21EntryKind(r.kind) ? `${r.timeframe} · EMA 21` : r.kind.startsWith("ema") ? `EMA ${r.length}` : r.value} ·{" "}
                    {r.cancelled
                      ? "Cancelled"
                      : r.triggeredAt
                        ? "Triggered"
                        : r.expiresAt <= Date.now()
                          ? "Expired"
                          : "Monitoring"}
                  </small>
                </span>
                {!r.cancelled && !r.triggeredAt && (
                  <button
                    aria-label={`Cancel alert ${r.symbol}`}
                    onClick={() =>
                      void change((current) =>
                        current.map((v) =>
                          v.id === r.id ? { ...v, cancelled: true } : v,
                        ),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                )}
              </article>
            ))}
        </div>
      )}
      {message && (
        <p role="status" className="global-disclosure">
          {message}
        </p>
      )}
    </section>,
    host,
  );
}
