"use client";
import { useRef, useState } from 'react';

type Props={value:string;onChange:(value:string)=>void;error?:string|null};
/** Native textarea keeps selection and the on-screen keyboard reliable on touch devices. */
export function PineTouchEditor({value,onChange,error}:Props){
 const field=useRef<HTMLTextAreaElement>(null),[query,setQuery]=useState(''),[notice,setNotice]=useState('');
 function indent(){
  const node=field.current;if(!node)return;
  const start=node.selectionStart,end=node.selectionEnd;
  onChange(value.slice(0,start)+'    '+value.slice(end));
  requestAnimationFrame(()=>{node.focus();node.setSelectionRange(start+4,start+4);});
 }
 function find(){
  const node=field.current;if(!node||!query)return;
  const index=value.indexOf(query,node.selectionEnd),next=index<0?value.indexOf(query):index;
  if(next<0){setNotice('No matches');return;}
  setNotice('Match selected');node.focus();node.setSelectionRange(next,next+query.length);
  node.scrollTop=Math.max(0,value.slice(0,next).split('\n').length-3)*24;
 }
 return <div className="pine-touch-editor"><div className="pine-touch-tools"><button type="button" onClick={indent} aria-label="Insert indentation">Tab</button><input aria-label="Find in script" placeholder="Find in script" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();find();}}}/><button type="button" disabled={!query} onClick={find}>Find next</button></div><textarea ref={field} aria-label="Pine source code" aria-invalid={!!error} value={value} maxLength={50_000} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();indent();}}}/><small role="status">{notice||`${value.split('\n').length} lines · Touch editor · PineTS runtime`}</small></div>;
}
