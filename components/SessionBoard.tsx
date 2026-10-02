"use client";
import { Bell, BellOff, Clock3, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTransientBack } from "./useTransientBack";
import { sessionBoard } from "@/lib/market-sessions";
import { NOTIFICATION_SETTINGS_EVENT, readNotificationPreferences, saveNotificationPreferences } from "@/lib/notification-preferences";

export function SessionBoard({ variant = "home", hiddenShades = [], onToggleShade }: { variant?: "home" | "chip"; hiddenShades?: string[]; onToggleShade?: (id: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [alerts, setAlerts] = useState(true);
  const [timesOpen, setTimesOpen] = useState(false);
  const timesRef = useRef<HTMLDetailsElement>(null);
  useTransientBack(timesOpen, () => setTimesOpen(false));
  useEffect(() => {
    if (!timesOpen) return;
    const close = (event: PointerEvent) => { if (!timesRef.current?.contains(event.target as Node)) setTimesOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [timesOpen]);
  useEffect(() => {
    const read = () => setAlerts(readNotificationPreferences().sessions);
    read();
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const refresh = () => setNow(Date.now());
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, read);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, read);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (variant === "chip") {
    const board = sessionBoard(now);
    const shortName: Record<string, string> = { sydney: "SYD", tokyo: "TYO", india: "IND", london: "LON", newyork: "NY" };
    return (
      <div className="chart-session-row" role="group" aria-label="Session shading">
        {board.map((item) => {
          const shown = !hiddenShades.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`chart-session-chip${item.open ? " is-open" : ""}${shown ? "" : " shades-off"}`}
              aria-pressed={shown}
              aria-label={`${shown ? "Hide" : "Show"} ${item.name} session shade, ${item.period} IST${item.open ? ", live" : ""}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onToggleShade?.(item.id); }}
            >
              {shortName[item.id] ?? item.name}
            </button>
          );
        })}
      </div>
    );
  }
  const board = sessionBoard(now);
  const shortName: Record<string, string> = { sydney: "Sydney", tokyo: "Tokyo", india: "India", london: "London", newyork: "NY" };
  return (
    <section className="home-session-board" aria-label="Market sessions">
      <div>
        {board.map((item) => (
          <span key={item.id} className={item.open ? "is-open" : ""} aria-label={`${item.name}, ${item.period} IST, ${item.open ? "open" : "closed"}`} title={`${item.name} · ${item.period} IST${item.open ? " · live" : ""}`}>
            <b>{shortName[item.id] ?? item.name}</b>
          </span>
        ))}
      </div>
      <details ref={timesRef} className="home-session-times" open={timesOpen}>
        <summary aria-label="Market session times and alerts" aria-expanded={timesOpen} onClick={event => { event.preventDefault(); setTimesOpen(value => !value); }}><Clock3 size={16} aria-hidden="true" /></summary>
        {timesOpen && <div className="home-session-details" role="region" aria-label="Session times">
          <header><b>Session times · IST</b><button type="button" aria-label="Close session times" onClick={() => setTimesOpen(false)}><X size={16} /></button></header>
          <ul>{board.map(item => <li key={item.id}><b>{item.name}</b><small>{item.period}</small><em>{item.open ? "Open" : "Closed"}</em></li>)}</ul>
          <button
            type="button"
            aria-pressed={alerts}
            aria-label={alerts ? "Session open alerts on" : "Session open alerts off"}
            title={alerts ? "Session alerts on" : "Session alerts off"}
            onClick={() => {
              const next = { ...readNotificationPreferences(), sessions: !alerts };
              saveNotificationPreferences(next);
              setAlerts(next.sessions);
            }}
          >
            {alerts ? <Bell size={15} /> : <BellOff size={15} />}
            Session alerts {alerts ? "on" : "off"}
          </button>
        </div>}
      </details>
    </section>
  );
}
