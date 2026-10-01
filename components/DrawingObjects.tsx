"use client";
import { useEffect, useRef } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Settings2, Trash2, X } from 'lucide-react';
import { ChartDialogPortal } from './ChartDialogPortal';
import { useTransientBack } from './useTransientBack';
export type DrawingObject = {id:string;study:boolean;title:string;text?:string;color:string;locked:boolean;hidden:boolean};
type Props={items:DrawingObject[];disabled:boolean;onAction:(item:DrawingObject,action:'select'|'settings'|'lock'|'hide'|'delete')=>void;onClose:()=>void};
export function DrawingObjects(props:Props){return <ChartDialogPortal><ObjectsDialog {...props}/></ChartDialogPortal>;}
function ObjectsDialog({items,disabled,onAction,onClose}:Props){
 const ref=useRef<HTMLDialogElement>(null);useTransientBack(true,onClose);
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';node.setAttribute('autofocus','');node.showModal();node.focus({preventScroll:true});
  const viewport=window.visualViewport;
  const fit=()=>{const height=viewport?.height??window.innerHeight;node.style.top=`${(viewport?.offsetTop??0)+height/2}px`;node.style.maxHeight=`${Math.max(80,height-24)}px`;};
  fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
  return()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);node.close();document.body.style.overflow=overflow;if(previous?.isConnected&&!previous.matches('input,textarea,[contenteditable]'))previous.focus({preventScroll:true});};
 },[]);
 return <dialog ref={ref} tabIndex={-1} className="drawing-objects" aria-label="Chart drawings" onCancel={e=>{e.preventDefault();onClose();}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <header><div><h3>Drawings</h3><small>{items.length} on this symbol</small></div><button aria-label="Close drawing list" onClick={onClose}><X size={20}/></button></header>
  <div className="drawing-object-rows">{items.length?items.map(item=><div className={`drawing-object-row${item.hidden?' is-hidden':''}`} key={`${item.study}:${item.id}`}>
   <button className="drawing-object-name" aria-label={`Select ${item.title}${item.text?' '+item.text:''}`} onClick={()=>onAction(item,'select')}><i style={{background:item.color}}/><span><b>{item.title}</b><small>{item.text || (item.study?'Indicator pane':'Price chart')}</small></span></button>
   <div className="drawing-object-actions"><button aria-label={`${item.hidden?'Show':'Hide'} ${item.title}`} aria-pressed={item.hidden} disabled={disabled} onClick={()=>onAction(item,'hide')}>{item.hidden?<EyeOff size={18}/>:<Eye size={18}/>}</button><button aria-label={`${item.locked?'Unlock':'Lock'} ${item.title}`} aria-pressed={item.locked} disabled={disabled} onClick={()=>onAction(item,'lock')}>{item.locked?<Lock size={18}/>:<LockOpen size={18}/>}</button><button aria-label={`Settings for ${item.title}`} disabled={disabled||item.locked} onClick={()=>onAction(item,'settings')}><Settings2 size={18}/></button><button aria-label={`Delete ${item.title}`} disabled={disabled||item.locked} onClick={()=>onAction(item,'delete')}><Trash2 size={18}/></button></div>
  </div>):<p className="drawing-objects-empty">Your saved drawings will appear here.</p>}</div>
 </dialog>;
}
