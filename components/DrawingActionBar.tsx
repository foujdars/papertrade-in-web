"use client";
import { Check, Copy, EyeOff, Lock, LockOpen, Settings2, Trash2 } from 'lucide-react';
export function DrawingActionBar({ title, locked, disabled = false, position, onSettings, onDuplicate, onLock, onHide, onDelete, onDone }: {
 title: string; locked: boolean; disabled?: boolean; position: {x:number;y:number};
 onSettings:()=>void; onDuplicate:()=>void; onLock:()=>void; onHide:()=>void; onDelete:()=>void; onDone:()=>void;
}) {
 return <div className="chart-selected-drawing drawing-action-bar" role="toolbar" aria-label="Selected drawing actions" style={{left:position.x,top:position.y}} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
  <span className="drawing-action-title">{title}{locked && <Lock size={12} aria-label="Locked"/>}</span>
  <div><button type="button" aria-label="Drawing settings" title="Settings" disabled={disabled||locked} onClick={onSettings}><Settings2 size={19}/></button>
  <button type="button" aria-label="Duplicate drawing" title="Duplicate" disabled={disabled} onClick={onDuplicate}><Copy size={19}/></button>
  <button type="button" aria-label={locked?'Unlock selected drawing':'Lock selected drawing'} title={locked?'Unlock':'Lock'} aria-pressed={locked} disabled={disabled} onClick={onLock}>{locked?<Lock size={19}/>:<LockOpen size={19}/>}</button>
  <button type="button" aria-label="Hide selected drawing" title="Hide" disabled={disabled} onClick={onHide}><EyeOff size={19}/></button>
  <button type="button" aria-label="Delete selected drawing" title="Delete" className="drawing-delete-action" disabled={disabled||locked} onClick={onDelete}><Trash2 size={19}/></button>
  <button type="button" aria-label="Finish editing drawing" title="Done" onClick={onDone}><Check size={21}/></button></div>
 </div>;
}
