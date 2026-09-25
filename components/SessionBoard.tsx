"use client";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { sessionBoard } from "@/lib/market-sessions";
import { NOTIFICATION_SETTINGS_EVENT, readNotificationPreferences, saveNotificationPreferences } from "@/lib/notification-preferences";

export function SessionBoard({ variant = "home", hiddenShades = [], onToggleShade }: { variant?: "home" | "chip"; hiddenShades?: string[]; onToggleShade?: (id: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [alerts, setAlerts] = useState(true);
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
    const shortName: Record<string, string> = { sydney: "Sydney", tokyo: "Tokyo", india: "India", london: "London", newyork: "NY" };
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
              {shortName[item.id] ?? item.name} {item.period}
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
          <span key={item.id} className={item.open ? "is-open" : ""} title={`${item.name} · ${item.period} IST${item.open ? " · live" : ""}`}>
            <i style={{ background: item.open ? "#12b886" : item.color }} />
            <b>{shortName[item.id] ?? item.name}</b>
            <small>{item.period}</small>
          </span>
        ))}
      </div>
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
      </button>
    </section>
  );
}
