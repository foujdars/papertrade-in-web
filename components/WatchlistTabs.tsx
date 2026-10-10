"use client";

import { ArrowDown, ArrowUp, GripVertical, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { moveWatchlistItem } from "@/lib/watchlist-order";
import { AppDialog } from "./AppDialog";

type Choice = { id: string; name: string; count: number; description?: string };

export function WatchlistTabs({ activeId, choices, onSelect, onNewList, onReorder }: {
  activeId: string;
  choices: readonly Choice[];
  onSelect: (id: string) => void;
  onNewList: () => void;
  onReorder?: (ids: string[]) => void;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const arrangeTrigger = useRef<HTMLButtonElement>(null);
  const [arranging, setArranging] = useState(false);

  const choiceIds = choices.map(choice => choice.id).join("|");
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const showSelection = () => {
      const selected = tabs.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!selected || !tabs.clientWidth) return;
      const bounds = tabs.getBoundingClientRect(), item = selected.getBoundingClientRect();
      if (item.left < bounds.left) tabs.scrollLeft -= bounds.left - item.left;
      else if (item.right > bounds.right) tabs.scrollLeft += item.right - bounds.right;
    };
    showSelection();
    const observer = new ResizeObserver(showSelection);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [activeId, choiceIds]);

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const current = tabs.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  };

  return <><div className="watchlist-tabs-toolbar"><div ref={tabsRef} className="desktop-watchlist-tabs" role="tablist" aria-label="Watchlists" onKeyDown={navigate}>
    {choices.map(choice => <button type="button" role="tab" key={choice.id} className={activeId === choice.id ? "active" : ""}
      aria-selected={activeId === choice.id} tabIndex={activeId === choice.id ? 0 : -1} title={choice.description}
      onClick={() => onSelect(choice.id)}><span>{choice.name}</span><small>{choice.count}</small></button>)}
  </div><div className="watchlist-tabs-actions">
    <button type="button" className="new-list-tab" title="New watchlist" aria-label="New watchlist" onClick={onNewList}><Plus size={17} aria-hidden="true" /></button>
    {onReorder && choices.length > 1 && <button type="button" ref={arrangeTrigger} className="arrange-watchlists-button" aria-label="Arrange watchlists" title="Arrange watchlists" onClick={() => setArranging(true)}><SlidersHorizontal size={15} aria-hidden="true" /><span>Arrange</span></button>}
  </div></div>
    {arranging && onReorder && <WatchlistOrderDialog choices={choices} onReorder={onReorder} returnFocus={arrangeTrigger} onClose={() => setArranging(false)} />}
  </>;
}

type DragSession = { id: string; pointerId: number; y: number; target: number; source: number };

function WatchlistOrderDialog({ choices, onReorder, onClose, returnFocus }: {
  choices: readonly Choice[];
  onReorder: (ids: string[]) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const titleId = useId(), hintId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const frameRef = useRef(0);
  const [drag, setDrag] = useState<Pick<DragSession, "id" | "target" | "source"> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const move = (id: string, target: number) => {
    const current = choices;
    const index = current.findIndex(choice => choice.id === id);
    const destination = Math.max(0, Math.min(current.length - 1, target));
    if (index < 0 || index === destination) return;
    onReorder(moveWatchlistItem(current.map(choice => choice.id), id, destination));
    setAnnouncement(`${current[index].name} moved to position ${destination + 1} of ${current.length}.`);
  };

  const nearestTarget = (list: HTMLOListElement, y: number, fallback: number) => {
    const rows = Array.from(list.children) as HTMLElement[];
    let nearest = fallback, distance = Infinity;
    rows.forEach((row, index) => {
      const rect = row.getBoundingClientRect();
      const delta = Math.abs(y - (rect.top + rect.height / 2));
      if (delta < distance) { nearest = index; distance = delta; }
    });
    return nearest;
  };

  const track = () => {
    const session = dragRef.current, list = listRef.current;
    if (!session || !list) return;
    const bounds = list.getBoundingClientRect();
    if (session.y < bounds.top + 36) list.scrollTop -= 8;
    else if (session.y > bounds.bottom - 36) list.scrollTop += 8;
    const nearest = nearestTarget(list, session.y, session.source);
    if (session.target !== nearest) {
      session.target = nearest;
      setDrag({ id: session.id, source: session.source, target: nearest });
    }
    frameRef.current = requestAnimationFrame(track);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: string, source: number) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, pointerId: event.pointerId, y: event.clientY, source, target: source };
    setDrag({ id, source, target: source });
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(track);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragRef.current = null;
    cancelAnimationFrame(frameRef.current);
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit) move(session.id, listRef.current ? nearestTarget(listRef.current, event.clientY, session.target) : session.target);
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, id: string, index: number) => {
    const target = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    move(id, target);
  };

  return <AppDialog className="watchlist-order-dialog" labelledBy={titleId} returnFocus={returnFocus} onClose={onClose} initialFocus=".watchlist-order-close">
    <header className="watchlist-order-heading"><h2 id={titleId}>Arrange watchlists</h2><button type="button" className="watchlist-order-close" aria-label="Close arrange watchlists" onClick={onClose}><X size={19} aria-hidden="true" /></button></header>
    <p id={hintId} className="watchlist-order-hint">Drag a handle or use the arrows.</p>
    <ol ref={listRef} className="watchlist-order-list" aria-label="Watchlist order">
      {choices.map((choice, index) => <li key={choice.id} className={[
        drag?.id === choice.id ? "is-dragging" : "",
        drag?.target === index && drag.target !== drag.source ? (drag.target < drag.source ? "drop-before" : "drop-after") : "",
      ].filter(Boolean).join(" ")}>
        <button type="button" className="watchlist-drag-handle" aria-label={`Reorder ${choice.name}, position ${index + 1} of ${choices.length}`} aria-describedby={hintId}
          onPointerDown={event => startDrag(event, choice.id, index)}
          onPointerMove={event => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current.y = event.clientY; }}
          onPointerUp={event => finishDrag(event, true)} onPointerCancel={event => finishDrag(event, false)} onLostPointerCapture={event => finishDrag(event, false)}
          onKeyDown={event => moveWithKeyboard(event, choice.id, index)}><GripVertical size={18} aria-hidden="true" /></button>
        <span className="watchlist-order-name">{choice.name}</span>
        <div className="watchlist-order-moves"><button type="button" aria-label={`Move ${choice.name} up`} aria-disabled={index === 0} onClick={() => move(choice.id, index - 1)}><ArrowUp size={16} aria-hidden="true" /></button><button type="button" aria-label={`Move ${choice.name} down`} aria-disabled={index === choices.length - 1} onClick={() => move(choice.id, index + 1)}><ArrowDown size={16} aria-hidden="true" /></button></div>
      </li>)}
    </ol>
    <span className="watchlist-order-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    <footer className="watchlist-order-footer"><button type="button" onClick={onClose}>Done</button></footer>
  </AppDialog>;
}
