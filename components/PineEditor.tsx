"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Candle } from '@/lib/market';
import { runPineScript, type PineScriptRun } from '@/lib/pine-script';
import type { AdvancedPineRun } from '@/lib/pine-runtime-types';
import { PINE_TEMPLATES, PINE_ADVANCED_TEMPLATES, loadPineScripts, savePineScripts, loadPineRevisions, savePineRevision, type AppliedPineScript, type SavedPineScript, type PineRevision } from '@/lib/pine-workspace';
import { PineCodeEditor } from './PineCodeEditor';
import { useTransientBack } from './useTransientBack';

type RunResult = PineScriptRun | AdvancedPineRun;
type Tab = 'code' | 'inputs' | 'conditions' | 'help' | 'tester' | 'logs' | 'history';
type Props = {
 candles:Candle[];
 applied:AppliedPineScript|null;
 onApply:(script:AppliedPineScript|null)=>void;
 onClose:()=>void;
 symbol?:string;
 timeframe?:string;
 theme?:string;
 advanced?:boolean;
 onRun?:(source:string,inputs:AppliedPineScript['inputs'])=>Promise<RunResult>;
 onCancelRun?:()=>void;
};
export function PineEditor({candles,applied,onApply,onClose,symbol,timeframe,theme,advanced=false,onRun,onCancelRun}:Props){
 const [source,setSource]=useState(applied?.source??PINE_TEMPLATES[0].source as string);
 const [name,setName]=useState(applied?.name??'EMA crossover');
 const [inputs,setInputs]=useState<AppliedPineScript['inputs']>(applied?.inputs??{});
 const [scripts,setScripts]=useState<SavedPineScript[]>(loadPineScripts);
 const [selected,setSelected]=useState('');
 const [tab,setTab]=useState<Tab>('code');
 const [result,setResult]=useState<RunResult|null>(null);
 const [notice,setNotice]=useState('');
 const [validated,setValidated]=useState('');
 const [busy,setBusy]=useState(false);
 const [history,setHistory]=useState<PineRevision[]>([]);
 const code=useRef<HTMLTextAreaElement>(null);
 const close=useRef<HTMLButtonElement>(null);
 const dialog=useRef<HTMLElement>(null);
 const runSequence=useRef(0);
 const importSequence=useRef(0);
 const lifecycle=useRef({mounted:true});
 const dirty=validated!==JSON.stringify([source,inputs]);
 const advancedResult=result&&'runtime' in result?result:null;
 useTransientBack(true,onClose);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  close.current?.focus();
  const state=lifecycle.current;state.mounted=true;
  return()=>{state.mounted=false;previous?.focus();};
 },[]);
 const preview=useMemo(()=>result?.alerts.map(alert=>({
  ...alert,count:alert.values.slice(0,-1).filter(Boolean).length,
  last:alert.values[Math.max(0,candles.length-2)]===true,
 }))??[],[result,candles.length]);
 function invalidate(){
  runSequence.current++;
  if(advanced)onCancelRun?.();
  importSequence.current++;
  setBusy(false);
  setValidated('');
 }
 function changeSource(value:string){invalidate();setSource(value);if(advanced)setInputs({});}
 function changeInputs(value:AppliedPineScript['inputs']){invalidate();setInputs(value);}
 async function run(apply=false){
  const token=++runSequence.current;
  const snapshot={source,inputs:{...inputs},name:name.trim()};
  setBusy(true);setNotice('Running on the loaded chart history…');
  try{
   const next=advanced&&onRun?await onRun(snapshot.source,snapshot.inputs):runPineScript(snapshot.source,candles,snapshot.inputs);
   if(!lifecycle.current.mounted||token!==runSequence.current)return;
   setResult(next);setValidated(JSON.stringify([snapshot.source,snapshot.inputs]));
   if(next.error){setNotice('');setTab('code');return;}
   if(apply){
    onApply({source:snapshot.source,inputs:snapshot.inputs,name:snapshot.name||next.title});
    setNotice('Added to chart. Updates with this chart’s candles.');
   }else setNotice('Compiled successfully. Select Add to chart to apply.');
  }catch(error){
   if(!lifecycle.current.mounted||token!==runSequence.current)return;
   setResult(null);setNotice(error instanceof Error?error.message:'The runtime could not complete this script.');
  }finally{if(lifecycle.current.mounted&&token===runSequence.current)setBusy(false);}
 }
 function replace(next:{name:string;source:string;inputs?:AppliedPineScript['inputs'];id?:string}){
  invalidate();setSource(next.source);setName(next.name);setInputs(next.inputs??{});
  setSelected(next.id??'');setHistory(next.id?loadPineRevisions(next.id):[]);setResult(null);setNotice('');setTab('code');
 }
 function save(asNew=false){
  if(advanced&&(!selected||asNew)&&scripts.length>=30){setNotice('Your library holds 30 scripts. Delete one or update an existing script before saving a new copy.');return;}
  const script:SavedPineScript={id:!asNew&&selected?selected:crypto.randomUUID(),name:name.trim()||'Untitled indicator',source,inputs,updatedAt:Date.now()};
  const next=[script,...scripts.filter(item=>item.id!==script.id)].slice(0,30);
  if(savePineScripts(next)){
   setScripts(next);setSelected(script.id);
   const recorded=!advanced||savePineRevision(script);
   setHistory(loadPineRevisions(script.id));
   setNotice(recorded?'Saved on this device.':'Script saved, but revision history could not be stored. Export a copy.');
  }else setNotice('Could not save. Browser storage may be full or disabled. Export a copy.');
 }
 function exportScript(){
  const url=URL.createObjectURL(new Blob([source],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;
  anchor.download=`${name.replace(/[^a-zA-Z0-9_-]/g,'_')||'indicator'}.pine`;
  anchor.click();URL.revokeObjectURL(url);
 }
 async function importScript(file:File|undefined){
  if(!file)return;
  if(file.size>(advanced?50_000:32_000)){setNotice(`Import must be under ${advanced?50:32} KB.`);return;}
  const token=++importSequence.current;
  try{
   const text=await file.text();
   if(!lifecycle.current.mounted||token!==importSequence.current)return;
   replace({name:file.name.replace(/\.(pine|txt)$/i,''),source:text});
  }catch{if(lifecycle.current.mounted&&token===importSequence.current)setNotice('This file could not be read.');}
 }
 const tabs:Tab[]=advanced?['code','inputs','conditions','tester','logs','history','help']:['code','inputs','conditions','help'];
 return createPortal(<div className="pine-backdrop" data-advanced={advanced} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section ref={dialog} className="pine-editor" data-theme={theme} data-advanced={advanced} role="dialog" aria-modal="true" aria-label="Pine Editor" onKeyDown={event=>{
   if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();onClose();}
   if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!event.defaultPrevented){event.preventDefault();void run(true);}
   if((event.ctrlKey||event.metaKey)&&event.key==='s'&&!event.defaultPrevented){event.preventDefault();save();}
   if(event.key==='Tab'&&!event.defaultPrevented){
    const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]')??[]).filter(element=>element.getClientRects().length);
    const first=elements[0],last=elements[elements.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  }}>
   <header className="pine-heading"><div><span className="pine-eyebrow">PAPERTRADE / {advanced?'SCRIPT WORKSPACE':'INDICATORS'}</span><h2>Pine Editor <small>{advanced?'Local execution':'Compatible subset'}</small></h2></div><button ref={close} type="button" onClick={onClose} aria-label="Close Pine Editor">✕</button></header>
   <div className="pine-workspace">
    <aside className="pine-library">
     <h3>Start from a template</h3>
     {[...PINE_TEMPLATES,...(advanced?PINE_ADVANCED_TEMPLATES:[])].map(template=><button type="button" key={template.name} aria-label={template.name} onClick={()=>replace(template)}>{template.name}<span>↗</span></button>)}
     <h3>My scripts <small>{scripts.length}/30</small></h3>
     {!scripts.length&&<p>Your saved indicators appear here.</p>}
     {scripts.map(script=><div className="pine-saved-row" key={script.id}><button type="button" aria-pressed={selected===script.id} onClick={()=>replace(script)}>{script.name}</button><button type="button" aria-label={`Delete ${script.name}`} onClick={()=>{
      const next=scripts.filter(item=>item.id!==script.id);
      if(savePineScripts(next)){setScripts(next);if(selected===script.id){setSelected('');setHistory([]);}}
      else setNotice('Could not update browser storage.');
     }}>×</button></div>)}
     <label className="pine-import">Import .pine<input type="file" accept=".pine,.txt" onChange={event=>void importScript(event.target.files?.[0])}/></label>
     <button type="button" onClick={exportScript}>Export .pine <span>↓</span></button>
    </aside>
    <div className="pine-main">
     <div className="pine-document"><label>Script name<input aria-label="Script name" maxLength={100} value={name} onChange={event=>{invalidate();setName(event.target.value);}}/></label><button type="button" onClick={()=>save()}>Save script</button>{advanced&&<button type="button" onClick={()=>save(true)}>Save as new</button>}</div>
     <div role="tablist" aria-label="Script editor tabs" className="pine-tabs">{tabs.map(value=><button type="button" role="tab" aria-selected={tab===value} aria-controls={`pine-${value}`} id={`pine-tab-${value}`} key={value} onClick={()=>{setTab(value);if((value==='inputs'||value==='conditions')&&dirty&&!busy)void run();}}>{value==='code'?'Editor':value==='tester'?'Strategy Tester':value==='history'?'Version history':value[0].toUpperCase()+value.slice(1)}</button>)}</div>
     <div className="pine-content" role="tabpanel" id={`pine-${tab}`} aria-labelledby={`pine-tab-${tab}`}>
      {tab==='code'&&(advanced?<PineCodeEditor value={source} onChange={changeSource} error={dirty?null:result?.error} theme={theme} onSave={()=>save()} onRun={()=>void run(true)}/>:<div className="pine-code"><div aria-hidden="true" className="pine-lines">{source.split('\n').map((_,index)=><span key={index}>{index+1}</span>)}</div><textarea ref={code} aria-label="Pine source code" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={source} maxLength={32_000} onChange={event=>changeSource(event.target.value)} onScroll={event=>{const sibling=event.currentTarget.previousElementSibling;if(sibling)sibling.scrollTop=event.currentTarget.scrollTop;}} onKeyDown={event=>{if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();const element=event.currentTarget,start=element.selectionStart,end=element.selectionEnd;changeSource(source.slice(0,start)+'    '+source.slice(end));requestAnimationFrame(()=>{element.selectionStart=element.selectionEnd=start+4;});}}}/></div>)}
      {tab==='inputs'&&<div className="pine-fields"><h3>Indicator inputs</h3>{result?.error&&<p role="alert">{result.error}</p>}{!result?.inputs.length&&<p>Declare parameters with input functions in your script.</p>}{result?.inputs.map(input=><label key={input.id} title={'tooltip' in input?input.tooltip:undefined}>{input.title}{input.type==='bool'?<input aria-label={input.title} type="checkbox" checked={Boolean(inputs[input.id]??input.value)} onChange={event=>changeInputs({...inputs,[input.id]:event.target.checked})}/>:input.type==='source'?<select aria-label={input.title} value={String(inputs[input.id]??input.value)} onChange={event=>changeInputs({...inputs,[input.id]:event.target.value})}>{['open','high','low','close','hl2','hlc3','ohlc4','volume'].map(value=><option key={value}>{value}</option>)}</select>:'options' in input&&input.options?.length?<select aria-label={input.title} value={String(inputs[input.id]??input.value)} onChange={event=>changeInputs({...inputs,[input.id]:typeof input.defaultValue==='number'?Number(event.target.value):typeof input.defaultValue==='boolean'?event.target.value==='true':event.target.value})}>{input.options.map(value=><option key={value}>{value}</option>)}</select>:<input aria-label={input.title} type={['int','float','price','time'].includes(input.type)?'number':'text'} min={input.min} max={input.max} step={input.type==='int'?1:input.step??'any'} value={String(inputs[input.id]??input.value)} onChange={event=>changeInputs({...inputs,[input.id]:['int','float','price','time'].includes(input.type)?event.target.value===''?'':Number(event.target.value):event.target.value})}/>}</label>)}<button type="button" onClick={()=>{changeInputs({});setNotice('Defaults restored. Add to chart to apply.');}}>Reset inputs</button></div>}
      {tab==='conditions'&&<div className="pine-fields"><h3>Script conditions</h3><p>Preview on loaded candles. These conditions do not create background alerts or push notifications.</p>{result?.error&&<p role="alert">{result.error}</p>}{!preview.length&&<p>Add alertcondition(condition, title=&quot;…&quot;, message=&quot;…&quot;) to your script.</p>}{preview.map((condition,index)=><article className="pine-condition" key={index}><strong>{condition.title}</strong><p>{condition.message}</p><small>{condition.count} matching closed candles · Latest closed candle: {condition.last?'matched':'no match'}</small></article>)}</div>}
      {tab==='tester'&&<div className="pine-fields pine-tester"><h3>Strategy Tester</h3>{advancedResult?.strategy?<><p>Historical simulation on {candles.length} loaded candles. Orders are simulated; no broker or paper order is placed.</p><div className="pine-test-stats">{[['Net profit',advancedResult.strategy.netProfit],['Return %',advancedResult.strategy.netProfitPercent],['Max drawdown %',advancedResult.strategy.maxDrawdownPercent],['Win rate %',advancedResult.strategy.winRate],['Profit factor',advancedResult.strategy.profitFactor]].map(([label,value])=><div key={label}><span>{label}</span><b>{value==null?'—':Number(value).toFixed(2)}</b></div>)}</div><EquityCurve points={advancedResult.strategy.equity}/><h4>Closed trades · {advancedResult.strategy.trades.length}</h4><div className="pine-trades-scroll"><table><thead><tr><th>Side</th><th>Entry</th><th>Exit</th><th>Quantity</th><th>Profit</th><th>Commission</th></tr></thead><tbody>{advancedResult.strategy.trades.map((trade,index)=><tr key={`${trade.id}-${index}`}><td>{trade.direction}</td><td>{trade.entryPrice.toFixed(2)}<small>{tradeDate(trade.entryTime)}</small></td><td>{trade.exitPrice.toFixed(2)}<small>{tradeDate(trade.exitTime)}</small></td><td>{trade.quantity}</td><td>{trade.profit.toFixed(2)}</td><td>{trade.commission.toFixed(2)}</td></tr>)}</tbody></table></div><p>Loaded-window results depend on initial capital, execution assumptions and available history. They do not predict future performance.</p></>:<p>Run a supported strategy() script to inspect its simulated results. Indicator scripts have no strategy trades.</p>}</div>}
      {tab==='logs'&&<div className="pine-fields"><h3>Runtime logs</h3>{!advancedResult?.logs.length&&!advancedResult?.warnings.length&&<p>No runtime messages. Compile a script to see execution diagnostics.</p>}{advancedResult?.warnings.map((warning,index)=><p className="pine-log-warning" key={`warning-${index}`}>{warning}</p>)}{advancedResult?.logs.map((log,index)=><article className={`pine-log pine-log-${log.level}`} key={index}><b>{log.level.toUpperCase()}{log.line?` · Line ${log.line}`:''}</b><p>{log.message}</p></article>)}</div>}
      {tab==='history'&&<div className="pine-fields"><h3>Version history</h3><p>Saved on this device, up to 20 revisions per script. Restoring a revision changes your editor draft; add it to the chart when ready.</p>{!history.length&&<p>Save this script to start its version history.</p>}{history.map(revision=><article className="pine-revision" key={revision.revisionId}><div><b>{revision.name}</b><small>{new Date(revision.updatedAt).toLocaleString()} · {revision.source.split('\n').length} lines</small></div><button type="button" onClick={()=>replace(revision)}>Restore revision</button></article>)}</div>}
      {tab==='help'&&<div className="pine-fields pine-help"><h3>Write {advanced?'a script':'an indicator'}</h3><p>Compile a script, review its diagnostics, then add it to the chart. Inputs change parameters without editing code. Scripts and the active selection are stored on this device.</p>{advanced?<><p>The desktop editor provides syntax highlighting, completion, hover reference, folding, bracket matching, undo and find/replace. Press Ctrl/Cmd+F to find, Ctrl/Cmd+H to replace, Ctrl/Cmd+S to save and Ctrl/Cmd+Enter to add to chart.</p><p>This local runtime is independent of TradingView. Pine v5/v6 compatibility is experimental. Check runtime diagnostics before using results; this is not full TradingView compatibility. Use templates to start with supported indicator and strategy examples.</p><p>Script conditions are chart previews. Strategy trades are local simulations, not orders. Requests can use the current chart symbol at supported timeframes with lookahead off. Extra timeframe data is disabled in replay. Imported libraries, cloud alerts, and TradingView publishing are unavailable.</p><p>Desktop runtime: PineTS · AGPL-3.0. <a href="https://github.com/foujdars/papertrade-in-web" target="_blank" rel="noreferrer">Source &amp; license ↗</a></p></>:<><p><b>Supported:</b> indicator(), input.int/float/bool/source, assignments, OHLCV and derived sources, history references, arithmetic, comparisons, and/or/not, ternary expressions, ta.sma/ema/rma/rsi/atr/stdev/highest/lowest/crossover/crossunder, math functions, plot(), hline(), and alertcondition().</p><p><b>Limits:</b> this is a compatible subset, with no TradingView compiler connection. Strategies, orders, request.security, loops, user functions, arrays, libraries, drawing objects, and full Pine language compatibility are unavailable. Unsupported syntax produces an error.</p></>}<p>Results use the loaded chart history. The newest candle may change while forming.</p><a href="https://www.tradingview.com/pine-script-docs/" target="_blank" rel="noreferrer">Pine language documentation ↗</a></div>}
     </div>
     <div className="pine-diagnostics">{result?.error&&!dirty?<p role="alert">{result.error}</p>:<p role="status">{notice||(dirty?'Changes pending · Compile to check your script.':`${result?.plots.length??0} plots · ${candles.length} loaded candles`)}{notice&&dirty&&!busy?' Changes pending.':''}</p>}</div>
     <footer className="pine-footer"><span>{symbol??'Chart'} {timeframe} · {candles.length} candles{advanced&&<> · <a href="https://github.com/foujdars/papertrade-in-web" target="_blank" rel="noreferrer">Source · AGPL</a></>}</span><div>{busy&&<button type="button" onClick={()=>{invalidate();setNotice('Run cancelled. The current chart is unchanged.');}}>Cancel run</button>}{applied&&<button type="button" onClick={()=>{invalidate();onApply(null);setNotice('Removed from chart. Saved scripts are kept.');}}>Remove from chart</button>}<button type="button" disabled={busy} onClick={()=>void run()}>Compile</button><button type="button" disabled={busy} className="pine-primary" onClick={()=>void run(true)}>{busy?'Running…':'Add to chart'}</button></div></footer>
    </div>
   </div>
  </section>
 </div>,document.body);
}

function tradeDate(time:number){
 return Number.isFinite(time)?new Date(time<1e12?time*1000:time).toLocaleString():'';
}
function EquityCurve({points}:{points:{time:number;value:number}[]}){
 const valid=points.filter(point=>Number.isFinite(point.value));
 if(valid.length<2)return null;
 const width=800,height=150,padding=12;
 const low=Math.min(...valid.map(point=>point.value)),high=Math.max(...valid.map(point=>point.value));
 const span=high-low||1;
 const path=valid.map((point,index)=>`${index?'L':'M'}${(padding+index/(valid.length-1)*(width-padding*2)).toFixed(2)},${(padding+(high-point.value)/span*(height-padding*2)).toFixed(2)}`).join(' ');
 return <figure className="pine-equity"><figcaption>Simulated equity · {valid[0].value.toFixed(2)} → {valid.at(-1)!.value.toFixed(2)}</figcaption><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Simulated strategy equity from ${valid[0].value.toFixed(2)} to ${valid.at(-1)!.value.toFixed(2)} over ${valid.length} bars`}><path d={path} fill="none" stroke="#2962ff" strokeWidth={2}/></svg></figure>;
}
