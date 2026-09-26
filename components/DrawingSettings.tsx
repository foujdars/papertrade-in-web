"use client";
import { useState } from 'react';
import type { DrawingPresentation } from '@/lib/study-pane-drawings';
import { useTransientBack } from './useTransientBack';
export function DrawingSettings({ value, onApply, onClose }: { value: DrawingPresentation; onApply: (value: DrawingPresentation) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  useTransientBack(true, onClose);
  return <div className="drawing-settings-backdrop" onPointerDown={e=>e.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-label="Drawing settings" className="drawing-settings" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onClose();}}>
      <h3>Drawing settings</h3>
      <label>Text<input aria-label="Drawing text" maxLength={160} value={draft.text??''} onChange={e=>setDraft({...draft,text:e.target.value})}/></label>
      <label>Text position<select aria-label="Text position" value={draft.textVertical??'above'} onChange={e=>setDraft({...draft,textVertical:e.target.value as DrawingPresentation['textVertical']})}><option value="above">Above</option><option value="middle">Middle</option><option value="below">Below</option></select></label>
      <label>Text alignment<select aria-label="Text alignment" value={draft.textHorizontal??'center'} onChange={e=>setDraft({...draft,textHorizontal:e.target.value as DrawingPresentation['textHorizontal']})}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label>
      <label><input type="checkbox" checked={!!draft.extendLeft} onChange={e=>setDraft({...draft,extendLeft:e.target.checked})}/> Extend left</label>
      <label><input type="checkbox" checked={!!draft.extendRight} onChange={e=>setDraft({...draft,extendRight:e.target.checked})}/> Extend right</label>
      <p>Trend lines and rectangles extend only when selected. Horizontal lines already span the pane; rays retain their tool direction.</p>
      <footer><button onClick={onClose}>Cancel</button><button onClick={()=>{onApply(draft);onClose();}}>Apply</button></footer>
    </section>
  </div>;
}
