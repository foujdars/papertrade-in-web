"use client";
import { CalendarDays, X } from "lucide-react";
import { useState } from "react";
import type { ChartHistoryRequest } from "@/lib/chart-history";
import { useTransientBack } from "./useTransientBack";
import { ChartDialogPortal } from "./ChartDialogPortal";

export function ChartHistoryControls({ request, onChange }: {
  request?: ChartHistoryRequest;
  onChange: (request?: ChartHistoryRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:15");
  useTransientBack(open, () => setOpen(false));
  return <>
    <div className="chart-history-controls" aria-label="Chart history">
      {[3, 5, 10].map(years => <button key={years} className={request?.years === years ? "active" : ""} onClick={() => onChange({ years, token: Date.now() })}>{years}Y</button>)}
      <button onClick={() => setOpen(true)} aria-label="Go to date"><CalendarDays size={13} /><span>Go to date</span></button>
      {request && <button onClick={() => onChange()}>Latest</button>}
    </div>
    {open && <ChartDialogPortal><div className="chart-history-backdrop" onClick={() => setOpen(false)}>
      <form className="chart-history-dialog" role="dialog" aria-modal="true" aria-label="Go to date" onClick={e => e.stopPropagation()} onSubmit={e => {
        e.preventDefault();
        const fields = new FormData(e.currentTarget);
        const chosenDate = String(fields.get("date") ?? "");
        const chosenTime = String(fields.get("time") ?? "09:15");
        if (!chosenDate) return;
        setDate(chosenDate); setTime(chosenTime);
        onChange({ date: new Date(`${chosenDate}T${chosenTime || "00:00"}:00+05:30`).toISOString(), token: Date.now() });
        setOpen(false);
      }}>
        <header><b>Go to date</b><button type="button" aria-label="Close date picker" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <p>Find a candle on the current timeframe. Time is in IST.</p>
        <label>Date<input name="date" type="date" required max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })} defaultValue={date} /></label>
        <label>Time<input name="time" type="time" defaultValue={time} /></label>
        <button type="submit">Go to candle</button>
      </form>
    </div></ChartDialogPortal>}
  </>;
}
