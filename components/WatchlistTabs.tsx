"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

type Choice = { id: string; name: string; count: number; description?: string };

export function WatchlistTabs({ activeId, choices, onSelect, onNewList }: {
  activeId: string;
  choices: readonly Choice[];
  onSelect: (id: string) => void;
  onNewList: () => void;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

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

  return <div ref={tabsRef} className="desktop-watchlist-tabs" role="tablist" aria-label="Watchlists" onKeyDown={navigate}>
    {choices.map(choice => <button type="button" role="tab" key={choice.id} className={activeId === choice.id ? "active" : ""}
      aria-selected={activeId === choice.id} tabIndex={activeId === choice.id ? 0 : -1} title={choice.description}
      onClick={() => onSelect(choice.id)}><span>{choice.name}</span><small>{choice.count}</small></button>)}
    <button type="button" className="new-list-tab" onClick={onNewList}><Plus size={15} aria-hidden="true" />New list</button>
  </div>;
}
