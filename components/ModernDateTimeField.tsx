"use client";
import { useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { ModernSelect } from './ModernSelect';

/** App-themed calendar and clock; no browser/OS date or time popup. */
export function ModernDateTimeField({label,kind,value,min,max,onChange}:{label:string;kind:'date'|'time';value:string;min?:string;max?:string;onChange:(value:string)=>void}){
 const trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(value),[month,setMonth]=useState(()=>new Date());
 const show=()=>{setDraft(value || (kind==='time' ? min || '09:15' : ''));setMonth(new Date((kind==='date'&&value ? value : new Date().toLocaleDateString('en-CA'))+'T12:00:00'));setOpen(true);};
 const year=month.getFullYear(),m=month.getMonth(),days=new Date(year,m+1,0).getDate(),offset=new Date(year,m,1).getDay();
 const pad=(n:number)=>String(n).padStart(2,'0');
 const stamp=(d:number)=>`${year}-${pad(m+1)}-${pad(d)}`;
 const valid=Boolean(draft)&&(!min||draft>=min)&&(!max||draft<=max);
 const [hour,minute]=draft.split(':');
 return <><button ref={trigger} type="button" className="modern-datetime-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={show}>{kind==='date'?<CalendarDays size={16}/>:<Clock3 size={16}/>}<span>{value || 'Choose date'}</span></button>{open&&<AppDialog className="modern-datetime-dialog" label={label} returnFocus={trigger} onClose={()=>setOpen(false)}><header><h3>{label}</h3><button type="button" aria-label="Close picker" onClick={()=>setOpen(false)}><X size={18}/></button></header>{kind==='time'?<><div className="modern-clock-fields"><ModernSelect label="Hour" value={hour||'09'} choices={Array.from({length:24},(_,i)=>({value:pad(i),label:pad(i),disabled:Boolean(min&&pad(i)<min.slice(0,2)||max&&pad(i)>max.slice(0,2))}))} onChange={v=>setDraft(`${v}:${minute||'00'}`)}/><span>:</span><ModernSelect label="Minute" value={minute||'00'} choices={Array.from({length:60},(_,i)=>({value:pad(i),label:pad(i),disabled:Boolean(min&&`${hour}:${pad(i)}`<min||max&&`${hour}:${pad(i)}`>max)}))} onChange={v=>setDraft(`${hour||'09'}:${v}`)}/></div><small>{min}–{max} IST</small></>:<><nav><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(year,m-1,1))}><ChevronLeft size={18}/></button><b>{month.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</b><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(year,m+1,1))}><ChevronRight size={18}/></button></nav><div className="modern-calendar-grid">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(day=><small key={day}>{day}</small>)}{Array.from({length:offset},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>i+1).map(day=><button key={day} type="button" aria-label={stamp(day)} aria-pressed={draft===stamp(day)} onClick={()=>setDraft(stamp(day))}>{day}</button>)}</div></>}<footer>{kind==='date'&&<button type="button" onClick={()=>{onChange('');setOpen(false);}}>Clear</button>}<button type="button" disabled={!valid} onClick={()=>{onChange(draft);setOpen(false);}}>Apply</button></footer></AppDialog>}</>;
}
