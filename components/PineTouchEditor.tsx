"use client";
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { pineErrorLocation } from '@/lib/pine-language';
import type { PineEditorCommand, PineEditorPosition } from './PineCodeEditor';

type Props={value:string;onChange:(value:string)=>void;error?:string|null;command?:PineEditorCommand;onPositionChange?:(position:PineEditorPosition)=>void};
/** Native textarea keeps selection and the on-screen keyboard reliable on touch devices. */
export function PineTouchEditor({value,onChange,error,command,onPositionChange}:Props){
 const field=useRef<HTMLTextAreaElement>(null),findField=useRef<HTMLInputElement>(null);
 const [query,setQuery]=useState(''),[replacement,setReplacement]=useState(''),[notice,setNotice]=useState(''),[replaceOpen,setReplaceOpen]=useState(false),[goToOpen,setGoToOpen]=useState(false),[line,setLine]=useState('1');
 const undo=useRef<string[]>([]),redo=useRef<string[]>([]),latest=useRef(value);
 useEffect(()=>{latest.current=value;},[value]);
 function change(next:string){if(next===value)return;undo.current.push(value);undo.current=undo.current.slice(-100);redo.current=[];onChange(next);}
 function position(){const node=field.current;if(!node)return;const before=node.value.slice(0,node.selectionStart);onPositionChange?.({line:before.split('\n').length,column:before.length-before.lastIndexOf('\n')});}
 function select(start:number,end=start){requestAnimationFrame(()=>{const node=field.current;if(!node)return;node.focus();node.setSelectionRange(start,end);node.scrollTop=Math.max(0,node.value.slice(0,start).split('\n').length-3)*24;position();});}
 function indent(){const node=field.current;if(!node)return;const start=node.selectionStart,end=node.selectionEnd;change(value.slice(0,start)+'    '+value.slice(end));select(start+4);}
 function find(){
  const node=field.current;if(!node||!query)return;
  const index=value.indexOf(query,node.selectionEnd),next=index<0?value.indexOf(query):index;
  if(next<0){setNotice('No matches');return;}
  const matches=value.split(query).length-1;setNotice(`${matches} ${matches===1?'match':'matches'} · Selected next`);select(next,next+query.length);
 }
 function replace(all=false){
  if(!query)return;const node=field.current;if(!node)return;
  if(all){const count=value.split(query).length-1;change(value.split(query).join(replacement));setNotice(`Replaced ${count} ${count===1?'match':'matches'}`);return;}
  const start=node.selectionStart,end=node.selectionEnd;
  if(value.slice(start,end)!==query){find();return;}
  change(value.slice(0,start)+replacement+value.slice(end));setNotice('Replaced selection');select(start,start+replacement.length);
 }
 function goTo(lineNumber:number,column=1){const lines=latest.current.split('\n'),target=Math.max(1,Math.min(lines.length,lineNumber));const start=lines.slice(0,target-1).reduce((total,row)=>total+row.length+1,0)+Math.min(Math.max(0,column-1),lines[target-1].length);select(start);setGoToOpen(false);}
 function travel(direction:'undo'|'redo'){const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;const next=from.current.pop();if(next!==undefined){to.current.push(latest.current);onChange(next);}}
 const acceptCommand=useEffectEvent((next:PineEditorCommand)=>{
  if(next.type==='find'||next.type==='replace'){setReplaceOpen(next.type==='replace');requestAnimationFrame(()=>findField.current?.focus());}
  else if(next.type==='goto')setGoToOpen(true);
  else if(next.type==='diagnostic'){const location=pineErrorLocation(error,latest.current.split('\n').length);goTo(location.line,location.column);}
  else travel(next.type);
 });
 useEffect(()=>{
  if(!command)return;
  const frame=requestAnimationFrame(()=>acceptCommand(command));
  return()=>cancelAnimationFrame(frame);
 },[command]);
 return <div className="pine-touch-editor">
  <div className="pine-touch-tools"><button type="button" onClick={indent} aria-label="Insert indentation">Tab</button><input ref={findField} aria-label="Find in script" placeholder="Find in script" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();find();}}}/><button type="button" disabled={!query} onClick={find}>Next</button><button type="button" aria-label="Toggle replace" aria-expanded={replaceOpen} onClick={()=>setReplaceOpen(open=>!open)}>⇄</button></div>
  {replaceOpen&&<div className="pine-touch-tools pine-touch-replace"><input aria-label="Replace with" placeholder="Replace with" value={replacement} onChange={event=>setReplacement(event.target.value)}/><button type="button" disabled={!query} onClick={()=>replace()}>Replace</button><button type="button" disabled={!query} onClick={()=>replace(true)}>All</button></div>}
  {goToOpen&&<form className="pine-touch-tools" onSubmit={event=>{event.preventDefault();goTo(Number(line)||1);}}><label>Line <input aria-label="Go to line number" type="number" min="1" max={value.split('\n').length} value={line} onChange={event=>setLine(event.target.value)}/></label><button type="submit">Go</button></form>}
  <textarea ref={field} aria-label="Pine source code" aria-invalid={!!error} value={value} maxLength={50_000} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" onChange={event=>change(event.target.value)} onSelect={position} onKeyDown={event=>{
   if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();indent();}
   if((event.ctrlKey||event.metaKey)&&['f','h','g'].includes(event.key.toLowerCase())){event.preventDefault();if(event.key.toLowerCase()==='g')setGoToOpen(true);else{setReplaceOpen(event.key.toLowerCase()==='h');findField.current?.focus();}}
  }}/>
  {notice&&<small role="status">{notice}</small>}
 </div>;
}
