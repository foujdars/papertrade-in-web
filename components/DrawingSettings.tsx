"use client";
import { MARKET_GREEN, MARKET_RED } from "@/lib/market-colours";

import { useEffect, useRef, useState } from 'react';
import type { DrawingPresentation } from '@/lib/study-pane-drawings';
import { useTransientBack } from './useTransientBack';
import { ModernSelect } from "./ModernSelect";
import { ChartDialogPortal } from './ChartDialogPortal';
export type DrawingCoordinate = { time: number; value: number };
type Props = { coordinates?: DrawingCoordinate[]; coordinateOffset?: number; tool?: string; study?: boolean; value: DrawingPresentation; onApply: (value: DrawingPresentation, coordinates?: DrawingCoordinate[]) => void; onClose: () => void };
const DRAWING_COLORS = ['#000000', '#6657ee', '#2563eb', MARKET_RED, MARKET_GREEN, '#f59e0b', '#ffffff'];
export function DrawingSettings(props: Props) {
  return <ChartDialogPortal><DrawingSettingsDialog {...props}/></ChartDialogPortal>;
}
function DrawingSettingsDialog({ tool = "trend-line", study = false, value, coordinates, coordinateOffset = 0, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<'style'|'text'|'coordinates'>('style');
  const [points, setPoints] = useState(() => coordinates?.map(point => ({time:new Date((point.time+coordinateOffset)*1000).toISOString().slice(0,16),value:String(point.value)})) ?? []);
  const changedPoints = points.some((point,index)=>point.time!==new Date(((coordinates?.[index].time??0)+coordinateOffset)*1000).toISOString().slice(0,16)||Number(point.value)!==coordinates?.[index].value);
  const validPoints = points.every(point => Number.isFinite(Date.parse(point.time+'Z')) && point.value.trim() !== '' && Number.isFinite(Number(point.value)) && (study || Number(point.value)>0));
  const extensible = tool === 'trend-line' || tool === 'rectangle';
  const hasPrice = !study && ['horizontal-line','horizontal-ray','trend-line','ray','extended-line','arrow','rectangle'].includes(tool);
  const title = tool.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const panel = useRef<HTMLDialogElement>(null);
  useTransientBack(true, onClose);
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the dialog itself, never its first input (which opens Android IME).
    node.setAttribute('autofocus', '');
    node.showModal();
    node.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const fit = () => {
      const height = viewport?.height ?? window.innerHeight;
      node.style.top = `${(viewport?.offsetTop ?? 0) + height / 2}px`;
      node.style.maxHeight = `${Math.max(80, height - 24)}px`;
    };
    fit();
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => {
      viewport?.removeEventListener('resize', fit);
      viewport?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      node.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected && !previous.matches('input,textarea,[contenteditable]')) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={panel} tabIndex={-1} aria-label="Drawing settings" className="drawing-settings" onCancel={e=>{e.preventDefault();onClose();}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
      <h3>{title} settings</h3>
      <div className="drawing-settings-tabs" role="tablist" aria-label="Drawing settings sections">{(['style','text',...(points.length?['coordinates']:[])] as const).map(id=><button key={id} type="button" role="tab" aria-selected={tab===id} aria-controls={`drawing-panel-${id}`} id={`drawing-tab-${id}`} onClick={()=>setTab(id as typeof tab)}>{id[0].toUpperCase()+id.slice(1)}</button>)}</div>
      <div className="drawing-settings-fields" role="tabpanel" id={`drawing-panel-${tab}`} aria-labelledby={`drawing-tab-${tab}`}>
      {tab === 'style' && <>
      <div className="drawing-settings-color"><span>Line colour</span><div className="drawing-settings-swatches" role="group" aria-label="Line colour presets">{DRAWING_COLORS.map(color=><button key={color} type="button" className={draft.color?.toLowerCase()===color?'active':''} style={{backgroundColor:color}} aria-label={`${color === '#000000' ? 'Black' : color === '#ffffff' ? 'White' : color} line colour`} aria-pressed={draft.color?.toLowerCase()===color} onClick={()=>setDraft({...draft,color})}/>)}</div><label className="drawing-settings-custom-color">Custom colour<input type="color" aria-label="Custom line colour" value={/^#[0-9a-f]{6}$/i.test(draft.color??'') ? draft.color : '#6657ee'} onChange={e=>setDraft({...draft,color:e.target.value})}/></label></div>
      <label>Line width<ModernSelect hideLabel label="Line width" value={String(draft.lineWidth ?? 2)} choices={[1,2,3,4].map(width => ({value:String(width),label:`${width} px`}))} onChange={value=>setDraft({...draft,lineWidth:Number(value)})}/></label>
      <label>Line style<ModernSelect hideLabel label="Line style" value={draft.lineDash?.length ? draft.lineDash[0] <= 2 ? "dotted" : "dashed" : "solid"} choices={[{value:"solid",label:"Solid"},{value:"dashed",label:"Dashed"},{value:"dotted",label:"Dotted"}]} onChange={value=>setDraft({...draft,lineDash:value==="dotted"?[2,4]:value==="dashed"?[8,5]:[]})}/></label>
      {tool === 'horizontal-ray' && <label>Direction<ModernSelect hideLabel label="Ray direction" value={draft.direction??"right"} choices={[{value:"right",label:"Right"},{value:"left",label:"Left"}]} onChange={value=>setDraft({...draft,direction:value})}/></label>}
      {hasPrice && <label>Price on scale<input type="checkbox" checked={draft.showPriceLabel ?? true} onChange={e=>setDraft({...draft,showPriceLabel:e.target.checked})}/></label>}
      {extensible && <><label>Extend left<input type="checkbox" checked={!!draft.extendLeft} onChange={e=>setDraft({...draft,extendLeft:e.target.checked})}/></label><label>Extend right<input type="checkbox" checked={!!draft.extendRight} onChange={e=>setDraft({...draft,extendRight:e.target.checked})}/></label></>}
      </>}
      {tab === 'text' && <>
      <label>Text<input aria-label="Drawing text" autoComplete="off" maxLength={160} value={draft.text??''} onChange={e=>setDraft({...draft,text:e.target.value})}/></label>
      <label>Text position<ModernSelect hideLabel label="Text position" value={draft.textVertical??"above"} choices={[{value:"above",label:"Above"},{value:"middle",label:"Middle"},{value:"below",label:"Below"}]} onChange={value=>setDraft({...draft,textVertical:value})}/></label>
      <label>Text alignment<ModernSelect hideLabel label="Text alignment" value={draft.textHorizontal??"center"} choices={[{value:"left",label:"Left"},{value:"center",label:"Centre"},{value:"right",label:"Right"}]} onChange={value=>setDraft({...draft,textHorizontal:value})}/></label>
      </>}
      {tab === 'coordinates' && <div className="drawing-coordinate-fields">{points.map((point,index)=><fieldset key={index}><legend>Point {index+1}</legend><label>{study?'Value':'Price'}<input aria-label={`${study?'Value':'Price'} for point ${index+1}`} type="number" step="any" inputMode="decimal" value={point.value} onChange={e=>setPoints(current=>current.map((p,i)=>i===index?{...p,value:e.target.value}:p))}/></label><label>Date & time<input aria-label={`Date and time for point ${index+1}`} type="datetime-local" value={point.time} onChange={e=>setPoints(current=>current.map((p,i)=>i===index?{...p,time:e.target.value}:p))}/></label></fieldset>)}<small>Times shown in IST.</small>{!validPoints&&<p role="alert">Enter a valid date and {study?'value':'positive price'} for each point.</p>}</div>}
      </div>
      <footer><button onClick={onClose}>Cancel</button><button disabled={!validPoints} onClick={()=>{onApply(draft,changedPoints?points.map((point,index)=>({time:point.time===new Date(((coordinates?.[index].time??0)+coordinateOffset)*1000).toISOString().slice(0,16)?coordinates![index].time:Date.parse(point.time+'Z')/1000-coordinateOffset,value:Number(point.value)})):undefined);onClose();}}>Apply</button></footer>
  </dialog>;
}
