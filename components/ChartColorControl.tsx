"use client";
import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { ChartDialogPortal } from './ChartDialogPortal';
import { MARKET_GREEN, MARKET_RED } from '@/lib/market-colours';

const COLORS = ['#000000','#ffffff','#64748b','#2962ff','#0ea5e9','#00bcd4',MARKET_GREEN,'#84cc16','#f5c446','#ff8a00','#f97316',MARKET_RED,'#e91e63','#d946ef','#8b5cf6','#753bce','#8291aa','#c69759','#6b7280','#1e293b'];
function hexColor(value:string) {
  const hex=value.trim().replace(/^#/,'');
  return /^[\da-f]{6}$/i.test(hex)?`#${hex.toLowerCase()}`:/^[\da-f]{3}$/i.test(hex)?`#${[...hex].map(c=>c+c).join('').toLowerCase()}`:null;
}
/** App-owned picker: works without a browser/Android native colour dialog. */
export function ChartColorControl({label,value,onChange}:{label:string;value:string;onChange:(color:string)=>void}) {
  const [open,setOpen]=useState(false),[hex,setHex]=useState(value),[error,setError]=useState('');
  const trigger=useRef<HTMLButtonElement>(null);
  function choose(color:string){onChange(color);setOpen(false);}
  return <>
    <button ref={trigger} type="button" className="chart-color-trigger" aria-label={label} title={`${label}: ${value}`} aria-haspopup="dialog" aria-expanded={open} style={{backgroundColor:value}} onClick={()=>{setHex(value);setError('');setOpen(true);}}/>
    {open&&<ChartDialogPortal><AppDialog containEscape className="chart-color-dialog" label={`${label} palette`} onClose={()=>setOpen(false)} returnFocus={trigger} initialFocus="button">
      <header><h3>{label}</h3><button type="button" aria-label="Close colour palette" onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <div className="chart-color-presets" role="group" aria-label="Colour presets">{COLORS.map(color=><button key={color} type="button" aria-label={`Choose ${color}`} aria-pressed={value.toLowerCase()===color} title={color.toUpperCase()} style={{backgroundColor:color}} onClick={()=>choose(color)}>{value.toLowerCase()===color&&<Check size={18} style={{color:['#ffffff','#f5c446','#84cc16'].includes(color)?'#111827':'#ffffff'}}/>}</button>)}</div>
      <form onSubmit={event=>{event.preventDefault();const color=hexColor(hex);if(color)choose(color);else setError('Enter a valid hex colour, for example #2962FF.');}}>
        <label>Hex colour<input aria-label="Hex colour" value={hex} onChange={event=>{setHex(event.target.value);setError('');}} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={7} aria-invalid={!!error}/></label>
        {error&&<p role="alert">{error}</p>}
        <footer><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="submit">Use colour</button></footer>
      </form>
    </AppDialog></ChartDialogPortal>}
  </>;
}
