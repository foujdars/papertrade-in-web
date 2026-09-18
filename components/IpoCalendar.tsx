"use client";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { IpoSummary } from "@/lib/ipo";
import { ipoEvents } from "@/lib/ipo-explorer";
import { ipoDate } from "./IpoLifecycleCard";

export function IpoCalendar({ ipos, today, time, onOpen }: { ipos: IpoSummary[]; today: string; time: string; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(today.slice(0,7)), [selected, setSelected] = useState<string | null>(null);
  const events = useMemo(() => ipoEvents(ipos, today, time), [ipos, today, time]);
  const monthly = events.filter(event => event.date.startsWith(month));
  const [year, number] = month.split("-").map(Number), date = new Date(Date.UTC(year,number-1,1));
  const count = new Date(Date.UTC(year,number,0)).getUTCDate(), offset = (date.getUTCDay()+6)%7;
  const move = (delta: number) => { setMonth(new Date(Date.UTC(year,number-1+delta,1)).toISOString().slice(0,7)); setSelected(null); };
  const shown = monthly.filter(event => !selected || event.date === selected);
  return <section className="ipo-calendar" aria-label="IPO event calendar">
    <header><div><span className="ipo-eyebrow">DATES THAT MATTER</span><h3>{date.toLocaleDateString("en-IN",{month:"long",year:"numeric",timeZone:"UTC"})}</h3></div><div><button aria-label="Previous IPO month" onClick={() => move(-1)}><ChevronLeft size={18}/></button><button onClick={() => { setMonth(today.slice(0,7)); setSelected(today); }}>Today</button><button aria-label="Next IPO month" onClick={() => move(1)}><ChevronRight size={18}/></button></div></header>
    <div className="ipo-calendar-weekdays">{["M","T","W","T","F","S","S"].map((day,index)=><span key={index}>{day}</span>)}</div>
    <div className="ipo-calendar-grid">{Array.from({length:offset},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:count},(_,i)=>{
      const day = `${month}-${String(i+1).padStart(2,"0")}`, items=monthly.filter(e=>e.date===day);
      return <button key={day} className={day===today?"is-today":""} aria-pressed={selected===day} aria-label={`${day}: ${items.length} IPO events`} onClick={()=>setSelected(selected===day?null:day)}><b>{i+1}</b><span>{[...new Set(items.map(e=>e.kind))].map(kind=><i key={kind} className={kind}/>)}</span></button>;
    })}</div>
    <div className="ipo-calendar-legend"><span><i className="opens"/>Opens</span><span><i className="closes"/>Closes</span><span><i className="allotment"/>Allotment</span><span><i className="listing"/>Listing</span></div>
    <div className="ipo-agenda-heading"><b>{selected ? ipoDate(selected) : "This month"} · {shown.length} events</b>{selected&&<button onClick={()=>setSelected(null)}>Show full month</button>}</div>
    <div className="ipo-agenda">{shown.map(event=><button key={event.id} onClick={()=>onOpen(event.ipo.id)}><span className={`ipo-event-icon ${event.kind}`}><CalendarDays size={18}/></span><span><b>{event.ipo.name.replace(/\s+IPO$/i,"")}</b><small>{event.label}{event.expected && ["opens","closes"].includes(event.kind) ? " · scheduled" : ""}{event.date<today ? " · past date" : ""}</small></span><time dateTime={event.date}>{ipoDate(event.date)}</time><ChevronRight size={15}/></button>)}</div>
    {!shown.length&&<p className="ipo-context-note">No published dates match this selection. Undated events are not guessed.</p>}
    <p className="ipo-context-note">Scheduled dates can change. An expected allotment or listing date is not confirmation that the event has happened.</p>
  </section>;
}
