"use client";
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Search, Settings2, Trash2, X } from 'lucide-react';
import { ChartDialogPortal } from './ChartDialogPortal';
import { useTransientBack } from './useTransientBack';
export type DrawingObject = {id:string;study:boolean;title:string;text?:string;color:string;locked:boolean;hidden:boolean};
export type DrawingObjectBatchAction='hide'|'show'|'lock'|'unlock';
type Props={items:DrawingObject[];disabled:boolean;onAction:(item:DrawingObject,action:'select'|'settings'|'lock'|'hide'|'delete')=>void;onClose:()=>void;advanced?:boolean;onBatchAction?:(items:DrawingObject[],action:DrawingObjectBatchAction)=>void};
export function DrawingObjects(props:Props){return <ChartDialogPortal><ObjectsDialog {...props}/></ChartDialogPortal>;}
function ObjectsDialog({items,disabled,onAction,onClose,advanced=false,onBatchAction}:Props){
 const ref=useRef<HTMLDialogElement>(null);useTransientBack(true,onClose);
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('all');
 const term=search.trim().toLocaleLowerCase();
 const visible=advanced?items.filter(item=>(!term||`${item.title} ${item.text??''}`.toLocaleLowerCase().includes(term))&&(filter==='all'||filter==='price'&&!item.study||filter==='study'&&item.study||filter==='hidden'&&item.hidden||filter==='locked'&&item.locked)):items;
 const canHide=visible.some(item=>!item.hidden),canLock=visible.some(item=>!item.locked);
 function bulk(action:DrawingObjectBatchAction){
  const matching=visible.filter(item=>action==='hide'?!item.hidden:action==='show'?item.hidden:action==='lock'?!item.locked:item.locked);
  if(disabled||!matching.length)return;
  if(onBatchAction)onBatchAction(matching,action);
  else matching.forEach(item=>onAction(item,action==='hide'||action==='show'?'hide':'lock'));
 }
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';node.setAttribute('autofocus','');node.showModal();node.focus({preventScroll:true});
  const viewport=window.visualViewport;
  const fit=()=>{const height=viewport?.height??window.innerHeight;node.style.top=`${(viewport?.offsetTop??0)+height/2}px`;node.style.maxHeight=`${Math.max(80,height-24)}px`;};
  fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
  return()=>{viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);node.close();document.body.style.overflow=overflow;if(previous?.isConnected&&!previous.matches('input,textarea,[contenteditable]'))previous.focus({preventScroll:true});};
 },[]);
 return <dialog ref={ref} tabIndex={-1} className={`drawing-objects${advanced?' desktop-drawing-objects':''}`} aria-label={advanced?'Drawing object tree':'Chart drawings'} onCancel={e=>{e.preventDefault();onClose();}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <header><div><h3>{advanced?'Object tree':'Drawings'}</h3><small>{items.length} on this symbol</small></div><button aria-label="Close drawing list" onClick={onClose}><X size={20}/></button></header>
  {advanced&&<><div className="desktop-object-filters"><label><Search size={15}/><input aria-label="Search drawing objects" placeholder="Search drawings" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="Clear drawing search" onClick={()=>setSearch('')}><X size={13}/></button>}</label><select aria-label="Filter drawing objects" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All drawings</option><option value="price">Price chart</option><option value="study">Indicator panes</option><option value="hidden">Hidden</option><option value="locked">Locked</option></select></div><div className="desktop-object-bulk"><span>{visible.length} shown</span><button disabled={disabled||!visible.length} aria-label={canHide?'Hide matching drawings':'Show matching drawings'} onClick={()=>bulk(canHide?'hide':'show')}>{canHide?<EyeOff size={14}/>:<Eye size={14}/>} {canHide?'Hide':'Show'} shown</button><button disabled={disabled||!visible.length} aria-label={canLock?'Lock matching drawings':'Unlock matching drawings'} onClick={()=>bulk(canLock?'lock':'unlock')}>{canLock?<Lock size={14}/>:<LockOpen size={14}/>} {canLock?'Lock':'Unlock'} shown</button></div></>}
  <div className="drawing-object-rows">{visible.length?visible.map(item=><div className={`drawing-object-row${item.hidden?' is-hidden':''}`} key={`${item.study}:${item.id}`}>
   <button className="drawing-object-name" aria-label={`Select ${item.title}${item.text?' '+item.text:''}`} onClick={()=>onAction(item,'select')}><i style={{background:item.color}}/><span><b>{item.title}</b><small>{item.text || (item.study?'Indicator pane':'Price chart')}</small></span></button>
   <div className="drawing-object-actions"><button aria-label={`${item.hidden?'Show':'Hide'} ${item.title}`} aria-pressed={item.hidden} disabled={disabled} onClick={()=>onAction(item,'hide')}>{item.hidden?<EyeOff size={18}/>:<Eye size={18}/>}</button><button aria-label={`${item.locked?'Unlock':'Lock'} ${item.title}`} aria-pressed={item.locked} disabled={disabled} onClick={()=>onAction(item,'lock')}>{item.locked?<Lock size={18}/>:<LockOpen size={18}/>}</button><button aria-label={`Settings for ${item.title}`} disabled={disabled||item.locked} onClick={()=>onAction(item,'settings')}><Settings2 size={18}/></button><button aria-label={`Delete ${item.title}`} disabled={disabled||item.locked} onClick={()=>onAction(item,'delete')}><Trash2 size={18}/></button></div>
  </div>):<p className="drawing-objects-empty">{advanced&&items.length?'No drawings match your search or filter.':'Your saved drawings will appear here.'}</p>}</div>
  {advanced&&<footer className="desktop-object-footer"><span>{items.filter(item=>item.hidden).length} hidden</span><span>{items.filter(item=>item.locked).length} locked</span><span>Changes are saved with this symbol.</span></footer>}
 </dialog>;
}
