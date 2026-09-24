"use client";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { sessionBoard, sessionChipLabel } from "@/lib/market-sessions";
import { NOTIFICATION_SETTINGS_EVENT, readNotificationPreferences, saveNotificationPreferences } from "@/lib/notification-preferences";

export function SessionBoard({ variant = "home", shadesOn = true, onToggleShades }: { variant?: "home" | "chip"; shadesOn?: boolean; onToggleShades?: () => void }) {
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
    const label = sessionChipLabel(now);
    const open = sessionBoard(now).some((item) => item.open);
    return (
      <button
        type="button"
        className={`chart-session-chip${open ? " is-open" : ""}${shadesOn ? "" : " shades-off"}`}
        aria-pressed={shadesOn}
        aria-label={`${label}. ${shadesOn ? "Hide session shading" : "Show session shading"}`}
        title={shadesOn ? "Hide session shading" : "Show session shading"}
        onClick={onToggleShades}
      >
        {label}
      </button>
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
