"use client";

import { Activity, Bell, BellRing, BriefcaseBusiness, CheckCheck, ExternalLink, Rocket, ShieldCheck, Trash2, X } from "lucide-react";
import { allotmentLink } from "@/lib/ipo-allotment";
import { useEffect, useMemo, useState } from "react";
import {
  clearPaperTradeNotifications,
  markPaperTradeNotificationsRead,
  NOTIFICATION_CENTER_EVENT,
  readPaperTradeNotifications,
  type PaperTradeNotification,
} from "@/lib/notification-center";

function formatNotificationTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(timestamp));
}

function NotificationIcon({ item }: { item: PaperTradeNotification }) {
  if (item.kind === "ipo") return <Rocket size={17} />;
  if (item.kind === "portfolio") return <BriefcaseBusiness size={17} />;
  if (item.kind === "trade") return <ShieldCheck size={17} />;
  return <Activity size={17} />;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PaperTradeNotification[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readPaperTradeNotifications());
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener(NOTIFICATION_CENTER_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(NOTIFICATION_CENTER_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const unread = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      markPaperTradeNotificationsRead();
      setItems(readPaperTradeNotifications());
    }
  };

  return (
    <div className="notification-center-wrap">
      <button className={`icon-button notification-center-trigger ${unread ? "has-unread" : ""}`} onClick={toggle} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} title="Notification centre">
        {unread ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <small>{unread > 9 ? "9+" : unread}</small>}
      </button>
      {open && <>
        <button className="notification-center-scrim" aria-label="Close notifications" onClick={() => setOpen(false)} />
        <section className="notification-center-panel" aria-label="PaperTrade notification centre">
          <header>
            <div><span>ALERTS</span><b>Notification centre</b></div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={19} /></button>
          </header>
          <div className="notification-center-actions">
            <span><CheckCheck size={15} /> All caught up</span>
            {items.length > 0 && <button onClick={() => { clearPaperTradeNotifications(); setItems([]); }}><Trash2 size={14} /> Clear</button>}
          </div>
          <div className="notification-center-list">
            {items.map((item) => <article key={item.id} className={`notification-item kind-${item.kind}`}>
              <span className="notification-item-icon"><NotificationIcon item={item} /></span>
              <div><b>{item.title}</b><p>{item.body}</p><small>{formatNotificationTime(item.createdAt)} IST</small>
                {item.kind === "ipo" && allotmentLink(item.allotmentRegistrar) && <a className="allotment-result-link notification-result-link" href={allotmentLink(item.allotmentRegistrar)!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Check allotment <ExternalLink size={14} /></a>}
              </div>
            </article>)}
            {!items.length && <div className="notification-empty"><Bell size={28} /><b>No alerts yet</b><span>Stop-loss, target, portfolio and IPO alerts will appear here.</span></div>}
          </div>
        </section>
      </>}
    </div>
  );
}
