"use client";
import { useEffect, useRef, useState } from 'react';
import type { DrawingPresentation } from '@/lib/study-pane-drawings';
import { useTransientBack } from './useTransientBack';
import { ChartDialogPortal } from './ChartDialogPortal';
type Props = { value: DrawingPresentation; onApply: (value: DrawingPresentation) => void; onClose: () => void };
export function DrawingSettings(props: Props) {
  return <ChartDialogPortal><DrawingSettingsDialog {...props}/></ChartDialogPortal>;
}
function DrawingSettingsDialog({ value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(value);
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
      <h3>Drawing settings</h3>
      <div className="drawing-settings-fields">
      <label>Text<input aria-label="Drawing text" autoComplete="off" maxLength={160} value={draft.text??''} onChange={e=>setDraft({...draft,text:e.target.value})}/></label>
      <label>Text position<select aria-label="Text position" value={draft.textVertical??'above'} onChange={e=>setDraft({...draft,textVertical:e.target.value as DrawingPresentation['textVertical']})}><option value="above">Above</option><option value="middle">Middle</option><option value="below">Below</option></select></label>
      <label>Text alignment<select aria-label="Text alignment" value={draft.textHorizontal??'center'} onChange={e=>setDraft({...draft,textHorizontal:e.target.value as DrawingPresentation['textHorizontal']})}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label>
      <label><input type="checkbox" checked={!!draft.extendLeft} onChange={e=>setDraft({...draft,extendLeft:e.target.checked})}/> Extend left</label>
      <label><input type="checkbox" checked={!!draft.extendRight} onChange={e=>setDraft({...draft,extendRight:e.target.checked})}/> Extend right</label>
      <p>Trend lines and rectangles extend only when selected. Horizontal lines already span the pane; rays retain their tool direction.</p>
      </div>
      <footer><button onClick={onClose}>Cancel</button><button onClick={()=>{onApply(draft);onClose();}}>Apply</button></footer>
  </dialog>;
}
