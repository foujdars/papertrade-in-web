"use client";
import { MARKET_GREEN, MARKET_RED } from "@/lib/market-colours";

import { useEffect, useRef, useState } from 'react';
import { type DrawingPresentation } from '@/lib/study-pane-drawings';
import { CHART_INTERVAL_SECONDS } from '@/lib/chart-history';
import { DEFAULT_FIB_LEVELS, nextFibonacciLevel, sanitizeAdvancedDrawingPresentation, type AdvancedDrawingPresentation } from '@/lib/drawing-editing';
const TIMEFRAMES=Object.keys(CHART_INTERVAL_SECONDS);
import { useTransientBack } from './useTransientBack';
import { ModernSelect } from "./ModernSelect";
import { ChartDialogPortal } from './ChartDialogPortal';
export type DrawingCoordinate = { time: number; value: number };
type Props = { advanced?:boolean; coordinates?: DrawingCoordinate[]; bars?: number[]; coordinateOffset?: number; tool?: string; study?: boolean; value: DrawingPresentation; onApply: (value: DrawingPresentation, coordinates?: DrawingCoordinate[]) => void; onClose: () => void };
const DRAWING_COLORS = ['#000000', '#6657ee', '#2563eb', MARKET_RED, MARKET_GREEN, '#f59e0b', '#ffffff'];
export function DrawingSettings(props: Props) {
  return <ChartDialogPortal><DrawingSettingsDialog {...props}/></ChartDialogPortal>;
}
function DrawingSettingsDialog({ tool = "trend-line", study = false, value, coordinates, bars, coordinateOffset = 0, advanced=false, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(()=>sanitizeAdvancedDrawingPresentation({...value} as AdvancedDrawingPresentation));
  const [tab, setTab] = useState<'style'|'text'|'coordinates'|'visibility'|'levels'>('style');
  const [points, setPoints] = useState(() => coordinates?.map(point => ({time:new Date((point.time+coordinateOffset)*1000).toISOString().slice(0,16),value:String(point.value)})) ?? []);
  const changedPoints = points.some((point,index)=>point.time!==new Date(((coordinates?.[index].time??0)+coordinateOffset)*1000).toISOString().slice(0,16)||Number(point.value)!==coordinates?.[index].value);
  const validPoints = points.every(point => Number.isFinite(Date.parse(point.time+'Z')) && point.value.trim() !== '' && Number.isFinite(Number(point.value)) && (study || Number(point.value)>0));
  const extensible = tool === 'trend-line' || tool === 'rectangle' || advanced&&tool==='regression-trend';
  const fibLevels=draft.levels??DEFAULT_FIB_LEVELS;
  const validLevels=!advanced||tool!=='fib-retracement'||fibLevels.length<=24&&fibLevels.every(level=>Number.isFinite(level)&&level>=-10&&level<=10);
  const hasPrice = !study && ['horizontal-line','horizontal-ray','trend-line','ray','extended-line','arrow','rectangle'].includes(tool);
  const validRegression=!advanced||tool!=='regression-trend'||draft.regressionDeviation===undefined||Number.isFinite(draft.regressionDeviation)&&draft.regressionDeviation>=0&&draft.regressionDeviation<=10;
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
  return <dialog ref={panel} tabIndex={-1} aria-label="Drawing settings" className="drawing-settings" data-desktop-advanced={advanced} onCancel={e=>{e.preventDefault();onClose();}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
      <h3>{title} settings</h3>
      <div className="drawing-settings-tabs" role="tablist" aria-label="Drawing settings sections">{(['style',...(advanced&&tool==='fib-retracement'?['levels']:[]),'text',...(points.length?['coordinates']:[]),'visibility'] as const).map(id=><button key={id} type="button" role="tab" aria-selected={tab===id} aria-controls={`drawing-panel-${id}`} id={`drawing-tab-${id}`} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=Array.from(e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role=tab]'));const index=buttons.indexOf(e.currentTarget);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.click();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length]?.focus();}} onClick={()=>setTab(id as typeof tab)}>{id[0].toUpperCase()+id.slice(1)}</button>)}</div>
      <div className="drawing-settings-fields" role="tabpanel" id={`drawing-panel-${tab}`} aria-labelledby={`drawing-tab-${tab}`}>
      {tab === 'style' && <>
      <div className="drawing-settings-color"><span>Line colour</span><div className="drawing-settings-swatches" role="group" aria-label="Line colour presets">{DRAWING_COLORS.map(color=><button key={color} type="button" className={draft.color?.toLowerCase()===color?'active':''} style={{backgroundColor:color}} aria-label={`${color === '#000000' ? 'Black' : color === '#ffffff' ? 'White' : color} line colour`} aria-pressed={draft.color?.toLowerCase()===color} onClick={()=>setDraft({...draft,color})}/>)}</div><label className="drawing-settings-custom-color">Custom colour<input type="color" aria-label="Custom line colour" value={/^#[0-9a-f]{6}$/i.test(draft.color??'') ? draft.color : '#6657ee'} onChange={e=>setDraft({...draft,color:e.target.value})}/></label></div>
      <label>Line opacity <span>{draft.opacity??100}%</span><input aria-label="Line opacity" type="range" min="0" max="100" value={draft.opacity??100} onChange={e=>setDraft({...draft,opacity:Number(e.target.value)})}/></label>
      <label>Line width<ModernSelect hideLabel label="Line width" value={String(draft.lineWidth ?? 2)} choices={[1,2,3,4].map(width => ({value:String(width),label:`${width} px`}))} onChange={value=>setDraft({...draft,lineWidth:Number(value)})}/></label>
      <label>Line style<ModernSelect hideLabel label="Line style" value={draft.lineDash?.length ? draft.lineDash[0] <= 2 ? "dotted" : "dashed" : "solid"} choices={[{value:"solid",label:"Solid"},{value:"dashed",label:"Dashed"},{value:"dotted",label:"Dotted"}]} onChange={value=>setDraft({...draft,lineDash:value==="dotted"?[2,4]:value==="dashed"?[8,5]:[]})}/></label>
      {tool === 'horizontal-ray' && <label>Direction<ModernSelect hideLabel label="Ray direction" value={draft.direction??"right"} choices={[{value:"right",label:"Right"},{value:"left",label:"Left"}]} onChange={value=>setDraft({...draft,direction:value})}/></label>}
      {hasPrice && <label>Price on scale<input type="checkbox" checked={draft.showPriceLabel ?? true} onChange={e=>setDraft({...draft,showPriceLabel:e.target.checked})}/></label>}
      {advanced&&tool==='regression-trend'&&<>
        <label>Standard deviations<input aria-label="Regression standard deviations" type="number" min="0" max="10" step="0.1" value={draft.regressionDeviation??2} onChange={event=>setDraft({...draft,regressionDeviation:Number(event.target.value)})}/></label>
        <label>Show correlation and sample size<input type="checkbox" checked={draft.regressionShowStats!==false} onChange={event=>setDraft({...draft,regressionShowStats:event.target.checked})}/></label>
        <p>The fit uses candle closes within the selected time range. Zero deviations shows the fitted centre line only.</p>{!validRegression&&<p role="alert">Enter a standard deviation multiplier from 0 to 10.</p>}
      </>}
      {extensible && <><label>Extend left<input type="checkbox" checked={!!draft.extendLeft} onChange={e=>setDraft({...draft,extendLeft:e.target.checked})}/></label><label>Extend right<input type="checkbox" checked={!!draft.extendRight} onChange={e=>setDraft({...draft,extendRight:e.target.checked})}/></label></>}
      </>}
      {advanced&&tool==='fib-retracement'&&tab==='levels'&&<>
        <label>Reverse levels<input aria-label="Reverse Fibonacci levels" type="checkbox" checked={!!draft.reverseDirection} onChange={event=>setDraft({...draft,reverseDirection:event.target.checked})}/></label>
        <label>Level labels<ModernSelect hideLabel label="Fibonacci label format" value={draft.fibLabels??'ratio'} choices={[{value:'ratio',label:'Ratios'},{value:'percent',label:'Percentages'},{value:'none',label:'Hidden'}]} onChange={value=>setDraft({...draft,fibLabels:value as AdvancedDrawingPresentation['fibLabels']})}/></label>
        <label>Show level prices<input aria-label="Show Fibonacci prices" type="checkbox" checked={!!draft.fibShowPrices} onChange={event=>setDraft({...draft,fibShowPrices:event.target.checked})}/></label>
        <label>Extend left<input type="checkbox" checked={draft.extendLeft??draft.extendLines??false} onChange={event=>setDraft({...draft,extendLeft:event.target.checked})}/></label>
        <label>Extend right<input type="checkbox" checked={draft.extendRight??draft.extendLines??false} onChange={event=>setDraft({...draft,extendRight:event.target.checked})}/></label>
        <fieldset className="drawing-fib-levels"><legend>Retracement and extension levels</legend>
          {fibLevels.map((level,index)=><label key={index}>Level {index+1}<input aria-label={`Fibonacci level ${index+1}`} type="number" step="0.001" min="-10" max="10" value={Number.isFinite(level)?level:''} onChange={event=>setDraft({...draft,levels:fibLevels.map((value,at)=>at===index?(event.target.value===''?NaN:Number(event.target.value)):value)})}/><button type="button" aria-label={`Remove Fibonacci level ${index+1}`} onClick={()=>setDraft({...draft,levels:fibLevels.filter((_,at)=>at!==index)})}>Remove</button></label>)}
        </fieldset>
        <div><button type="button" disabled={fibLevels.length>=24} onClick={()=>setDraft({...draft,levels:[...fibLevels,nextFibonacciLevel(fibLevels)]})}>Add level</button><button type="button" onClick={()=>setDraft({...draft,levels:[...DEFAULT_FIB_LEVELS]})}>Reset standard levels</button></div>
        <p>Ratios between −10 and 10; up to 24 levels. A level of 0.618 is 61.8% between your two anchors. Reverse swaps their price direction.</p>
        {!validLevels&&<p role="alert">Enter a finite ratio between −10 and 10 for every level.</p>}
      </>}
      {tab === 'text' && <>
      <label>Show text<input type="checkbox" checked={draft.textEnabled!==false} onChange={e=>setDraft({...draft,textEnabled:e.target.checked})}/></label>
      <div className="drawing-text-format"><label>Text colour<input type="color" aria-label="Text colour" value={draft.textColor??draft.color??'#6657ee'} onChange={e=>setDraft({...draft,textColor:e.target.value})}/></label><ModernSelect label="Font size" value={String(draft.fontSize??12)} choices={[10,12,14,16,18,20,24,28,32].map(n=>({value:String(n),label:`${n} px`}))} onChange={value=>setDraft({...draft,fontSize:Number(value)})}/><button type="button" aria-label="Bold text" aria-pressed={!!draft.bold} onClick={()=>setDraft({...draft,bold:!draft.bold})}><b>B</b></button><button type="button" aria-label="Italic text" aria-pressed={!!draft.italic} onClick={()=>setDraft({...draft,italic:!draft.italic})}><i>I</i></button></div>
      <label>Text opacity <span>{draft.textOpacity??100}%</span><input aria-label="Text opacity" type="range" min="0" max="100" value={draft.textOpacity??100} onChange={e=>setDraft({...draft,textOpacity:Number(e.target.value)})}/></label>
      <label>Text<input aria-label="Drawing text" autoComplete="off" maxLength={160} value={draft.text??''} onChange={e=>setDraft({...draft,text:e.target.value})}/></label>
      <label>Text position<ModernSelect hideLabel label="Text position" value={draft.textVertical??"above"} choices={[{value:"above",label:"Above"},{value:"middle",label:"Middle"},{value:"below",label:"Below"}]} onChange={value=>setDraft({...draft,textVertical:value})}/></label>
      <label>Text alignment<ModernSelect hideLabel label="Text alignment" value={draft.textHorizontal??"center"} choices={[{value:"left",label:"Left"},{value:"center",label:"Centre"},{value:"right",label:"Right"}]} onChange={value=>setDraft({...draft,textHorizontal:value})}/></label>
      </>}
      {tab === 'visibility' && <div className="drawing-visibility"><label>All timeframes<input aria-label="All timeframes" type="checkbox" checked={draft.visibilityMode!=='selected'&&!draft.timeframes?.length} onChange={e=>setDraft({...draft,visibilityMode:e.target.checked?'all':'selected',timeframes:e.target.checked?[]:[...TIMEFRAMES]})}/></label><p>Choose where this drawing appears. Your saved drawing stays available in the drawing list.</p>{[['Minutes',TIMEFRAMES.filter(t=>t.endsWith('m'))],['Hours',TIMEFRAMES.filter(t=>t.endsWith('H'))],['Days and higher',TIMEFRAMES.filter(t=>['1D','1W','1M','1Y'].includes(t))]].map(([name,frames])=><fieldset key={name as string}><legend>{name}</legend><div>{(frames as string[]).map(frame=><label key={frame}>{frame}<input aria-label={`Visible on ${frame}`} type="checkbox" checked={draft.visibilityMode!=='selected'&&!draft.timeframes?.length||!!draft.timeframes?.includes(frame)} onChange={e=>{const previous=draft.visibilityMode!=='selected'&&!draft.timeframes?.length?[...TIMEFRAMES]:draft.timeframes??[];setDraft({...draft,visibilityMode:'selected',timeframes:e.target.checked?[...new Set([...previous,frame])]:previous.filter(t=>t!==frame)});}}/></label>)}</div></fieldset>)}</div>}
      {tab === 'coordinates' && <div className="drawing-coordinate-fields">{points.map((point,index)=><fieldset key={index}><legend>Point {index+1}</legend><label>{study?'Value':'Price'}<input aria-label={`${study?'Value':'Price'} for point ${index+1}`} type="number" step="any" inputMode="decimal" value={point.value} onChange={e=>setPoints(current=>current.map((p,i)=>i===index?{...p,value:e.target.value}:p))}/></label><label>Date & time<input aria-label={`Date and time for point ${index+1}`} type="datetime-local" value={point.time} onChange={e=>setPoints(current=>current.map((p,i)=>i===index?{...p,time:e.target.value}:p))}/></label>{bars?.length&&<label>Candle number<input aria-label={`Candle number for point ${index+1}`} type="number" min="0" max={bars.length-1} step="1" value={(()=>{const time=Date.parse(point.time+'Z')/1000-coordinateOffset;const found=bars.findIndex(t=>Math.abs(t-time)<60);return found<0?'':found;})()} onChange={e=>{const indexValue=Number(e.target.value);if(e.target.value!==''&&Number.isInteger(indexValue)&&bars[indexValue]!=null)setPoints(current=>current.map((p,i)=>i===index?{...p,time:new Date((bars[indexValue]+coordinateOffset)*1000).toISOString().slice(0,16)}:p));}}/></label>}</fieldset>)}<small>Times shown in IST.</small>{!validPoints&&<p role="alert">Enter a valid date and {study?'value':'positive price'} for each point.</p>}</div>}
      </div>
      <footer><button onClick={onClose}>Cancel</button><button disabled={!validPoints||!validLevels||!validRegression} onClick={()=>{onApply(sanitizeAdvancedDrawingPresentation(draft),changedPoints?points.map((point,index)=>({time:point.time===new Date(((coordinates?.[index].time??0)+coordinateOffset)*1000).toISOString().slice(0,16)?coordinates![index].time:Date.parse(point.time+'Z')/1000-coordinateOffset,value:Number(point.value)})):undefined);onClose();}}>Apply</button></footer>
  </dialog>;
}
