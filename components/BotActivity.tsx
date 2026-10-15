"use client";
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteBotActivities, visibleBotActivity } from '@/lib/bot-activity';
import { formatUsd } from '@/lib/global-order-engine';
import type { GlobalTrading } from './useGlobalTrading';

export function BotActivity({ trading }: { trading: GlobalTrading }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const entries = trading.account ? visibleBotActivity(trading.account) : [];
  const shown = entries.slice(-limit).reverse();
  const selectedIds = selected.filter(id => entries.some(event => event.id === id));
  const busy = trading.busy || deleting !== null;
  const remove = async (ids: string[]) => {
    if (!ids.length || busy) return;
    setDeleting(ids.length === 1 ? ids[0] : 'selection');
    setError('');
    try {
      if (!await trading.transact(account => deleteBotActivities(account, ids))) setError('Could not delete the selected activity. Please try again.');
      else setSelected(current => current.filter(id => !ids.includes(id)));
    } catch {
      setError('Could not delete the selected activity. Please try again.');
    } finally { setDeleting(null); }
  };
  return <details className="bot-card bot-activity">
    <summary>Bot activity <span>{entries.length}</span></summary>
    {!entries.length ? <p>No bot activity to show.</p> : <>
      <p className="bot-activity-note">Deleting an entry removes it from this list. Your trade history is retained.</p>
      <div className="bot-activity-actions">
        <label><input type="checkbox" aria-label="Select all shown activity" disabled={busy} checked={shown.length > 0 && shown.every(event => selectedIds.includes(event.id))} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...shown.map(row => row.id)])] : current.filter(id => !shown.some(row => row.id === id)))}/>Select shown ({shown.length})</label>
        <span role="status">{selectedIds.length} selected</span>
        <button type="button" className="bot-activity-delete" disabled={busy || !selectedIds.length} onClick={() => void remove(selectedIds)}><Trash2 size={15}/>{deleting === 'selection' ? 'Deleting…' : `Delete selected (${selectedIds.length})`}</button>
        {!!selectedIds.length && <button type="button" disabled={busy} onClick={() => setSelected([])}>Clear selection</button>}
      </div>
      <ul>{shown.map(event => <li key={event.id}>
        <input type="checkbox" aria-label={`Select ${event.symbol} ${event.kind} activity entry from ${new Date(event.at).toLocaleString('en-IN')}`} checked={selectedIds.includes(event.id)} disabled={busy} onChange={e => setSelected(current => e.target.checked ? [...new Set([...current, event.id])] : current.filter(id => id !== event.id))}/>
        <div><b>{event.symbol} · {event.kind}</b><small>{new Date(event.at).toLocaleString('en-IN')} · {event.detail}</small></div>
        <span>{event.contracts} lots @ {formatUsd(event.price)}<small>Net {formatUsd(event.pnl - event.fee)}</small>
          <button type="button" className="bot-activity-delete" aria-label={`Delete ${event.symbol} ${event.kind} activity entry from ${new Date(event.at).toLocaleString('en-IN')}`} title="Delete activity entry" disabled={busy} onClick={() => void remove([event.id])}><Trash2 size={15}/><span>{deleting === event.id ? 'Deleting…' : 'Delete'}</span></button>
        </span>
      </li>)}</ul>
      {entries.length > shown.length && <button type="button" disabled={busy} onClick={() => setLimit(value => value + 20)}>Show more activity</button>}
    </>}
    {error && <p role="alert" className="negative">{error}</p>}
  </details>;
}
