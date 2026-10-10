"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { AppDialog } from "./AppDialog";

type Choice = { id: string; label: string; description?: string; badge?: string };

export function WorkspaceListPicker({ label, title, value, choices, onChange }: {
  label: string; title: string; value: string; choices: Choice[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const selected = choices.find(choice => choice.id === value);
  const searchable = choices.length > 6;
  const filtered = choices.filter(choice => `${choice.label} ${choice.description ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <>
    <button ref={trigger} type="button" className="workspace-list-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setQuery(""); setOpen(true); }}>
      <span>{selected?.label ?? title}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    {open && <AppDialog className="workspace-list-dialog" labelledBy={titleId} returnFocus={trigger} initialFocus=".workspace-list-close" onClose={() => setOpen(false)}>
      <header className="workspace-list-heading"><h2 id={titleId}>{title}</h2><button type="button" className="workspace-list-close" aria-label={`Close ${title.toLowerCase()}`} onClick={() => setOpen(false)}><X size={20} /></button></header>
      {searchable && <label className="workspace-list-search"><Search size={18} aria-hidden="true" /><input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      <div className="workspace-list-options">
        {filtered.map(choice => <button key={choice.id} type="button" aria-pressed={choice.id === value} onClick={() => { onChange(choice.id); setOpen(false); }}>
          <span className="workspace-list-copy"><strong>{choice.label}</strong>{choice.description && <small>{choice.description}</small>}</span>
          {choice.badge && <span className="workspace-list-badge">{choice.badge}</span>}
          <span className="workspace-list-check" aria-hidden="true">{choice.id === value && <Check size={18} />}</span>
        </button>)}
        {!filtered.length && <p className="workspace-list-empty">No matching choices.</p>}
      </div>
    </AppDialog>}
  </>;
}
