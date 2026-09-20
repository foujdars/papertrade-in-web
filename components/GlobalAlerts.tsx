"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModernSelect } from "./ModernSelect";
import { Bell, X } from "lucide-react";
import { addPaperTradeNotification } from "@/lib/notification-center";
import {
  GLOBAL_ALERT_KINDS,
  globalAlertError,
  evaluateGlobalAlert,
  type GlobalAlert,
} from "@/lib/global-alerts";
import type { PerpSymbol } from "@/lib/global-markets";
const labels: Record<GlobalAlert["kind"], string> = {
  "price-above": "Price reaches / above",
  "price-below": "Price reaches / below",
  "ema-cross-up": "Price crosses above EMA",
  "ema-cross-down": "Price crosses below EMA",
  "rsi-cross-up": "RSI crosses above",
  "rsi-cross-down": "RSI crosses below",
  "volume-spike": "Volume exceeds average ×",
};
export function GlobalAlerts({
  owner,
  visible,
  symbol,
  host,
}: {
  owner: string;
  visible: boolean;
  symbol: PerpSymbol;
  host: HTMLElement | null;
}) {
  const key = `papertrade-global-alerts-v1:${owner}`,
    [rules, setRules] = useState<GlobalAlert[]>([]),
    [message, setMessage] = useState(""),
    [expanded, setExpanded] = useState(false),
    [kind, setKind] = useState<GlobalAlert["kind"]>("price-above"),
    [value, setValue] = useState(""),
    [length, setLength] = useState("14");
  const alive = useRef(true);
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
    return () => {
      alive.current = false;
      window.removeEventListener("storage", storage);
    };
  }, [key]);
  const active = rules.some(
    (r) => !r.cancelled && !r.triggeredAt && r.expiresAt > Date.now(),
  );
  useEffect(() => {
    if (!active) return;
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
          const technical = pending.some(
            (r) => r.symbol === s && !r.kind.startsWith("price"),
          );
          const get = async (url: string) => {
            const r = await fetch(url, { signal: controller.signal });
            const p = await r.json();
            if (!r.ok || !p.ok)
              throw new Error(
                "Global alert feed unavailable; monitoring waits for fresh data.",
              );
            return p;
          };
          const [snapshot, history] = await Promise.all([
            get(`/api/global-markets?symbol=${s}`),
            technical
              ? get(`/api/global-markets?symbol=${s}&mode=candles&timeframe=5m`)
              : Promise.resolve({ candles: [] }),
          ]);
          if (stopped) return;
          const triggered: GlobalAlert[] = [];
          const saved = await change((current) =>
            current.map((rule) => {
              if (
                rule.symbol !== s ||
                !evaluateGlobalAlert(
                  rule,
                  snapshot.quote,
                  history.candles,
                  Date.now(),
                )
              )
                return rule;
              const fired = { ...rule, triggeredAt: Date.now() };
              triggered.push(fired);
              return fired;
            }),
          );
          if (!saved) continue;
          for (const rule of triggered) {
            const body = `${s} · ${labels[rule.kind]} ${rule.kind.startsWith("ema") ? rule.length : rule.value}${rule.kind.startsWith("price") ? " USD" : " · 5m confirmed candle"}`;
            try {
              addPaperTradeNotification({
                id: `global:${owner}:${rule.id}`,
                kind: "market",
                title: "Global market alert",
                body,
              });
            } catch {
              /* Durable triggered status remains. */
            }
            setMessage(body);
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
  }, [active, key]);
  if (!visible || !host) return null;
  return createPortal(
    <section className="global-alerts">
      <button
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
      </button>
      {expanded && (
        <div className="global-ticket">
          <h3>{symbol} alert</h3>
          <p className="global-disclosure">
            Once only · expires in 7 days · app open and visible only.
            Technicals use completed 5-minute candles. No SMC alerts or
            closed-app push.
          </p>
          <div className="global-input-grid">
            <ModernSelect
              label="Condition"
              ariaLabel="Global alert condition"
              value={kind}
              onChange={setKind}
              choices={GLOBAL_ALERT_KINDS.map((value) => ({
                value,
                label: labels[value],
              }))}
            />
            {!kind.startsWith("ema") && (
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
            {!kind.startsWith("price") && (
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
          </div>
          <button
            onClick={() =>
              void change((current) => {
                if (
                  current.filter(
                    (r) =>
                      !r.cancelled &&
                      !r.triggeredAt &&
                      r.expiresAt > Date.now(),
                  ).length >= 20
                )
                  throw new Error("Maximum 20 active global alerts.");
                const at = Date.now(),
                  rule: GlobalAlert = {
                    id: crypto.randomUUID(),
                    symbol,
                    kind,
                    value: kind.startsWith("ema") ? 0 : Number(value),
                    length: Number(length),
                    createdAt: at,
                    expiresAt: at + 7 * 86400000,
                  };
                const invalid = globalAlertError(rule);
                if (invalid || (!value && !kind.startsWith("ema")))
                  throw new Error(invalid ?? "Enter a threshold.");
                setMessage("Alert created.");
                return [...current, rule];
              })
            }
          >
            Create global alert
          </button>
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
                    {r.kind.startsWith("ema") ? `EMA ${r.length}` : r.value} ·{" "}
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
