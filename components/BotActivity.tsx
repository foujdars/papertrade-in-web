"use client";
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteBotActivity, visibleBotActivity } from '@/lib/bot-activity';
import { formatUsd } from '@/lib/global-order-engine';
import type { GlobalTrading } from './useGlobalTrading';

export function BotActivity({ trading }: { trading: GlobalTrading }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const entries = trading.account ? visibleBotActivity(trading.account) : [];
  const remove = async (id: string) => {
    setDeleting(id);
    setError('');
    try {
      if (!await trading.transact(account => deleteBotActivity(account, id))) setError('Could not delete this activity entry. Please try again.');
    } catch {
      setError('Could not delete this activity entry. Please try again.');
    } finally { setDeleting(null); }
  };
  return <details className="bot-card bot-activity">
    <summary>Bot activity <span>{entries.length}</span></summary>
    {!entries.length ? <p>No bot activity to show.</p> : <>
      <p className="bot-activity-note">Deleting an entry removes it from this list. Your trade history is retained.</p>
      <ul>{entries.slice(-20).reverse().map(event => <li key={event.id}>
        <div><b>{event.symbol} · {event.kind}</b><small>{new Date(event.at).toLocaleString('en-IN')} · {event.detail}</small></div>
        <span>{event.contracts} lots @ {formatUsd(event.price)}<small>Net {formatUsd(event.pnl - event.fee)}</small>
          <button type="button" className="bot-activity-delete" aria-label={`Delete ${event.symbol} ${event.kind} activity entry from ${new Date(event.at).toLocaleString('en-IN')}`} title="Delete activity entry" disabled={trading.busy || deleting !== null} onClick={() => void remove(event.id)}><Trash2 size={15}/><span>{deleting === event.id ? 'Deleting…' : 'Delete'}</span></button>
        </span>
      </li>)}</ul>
    </>}
    {error && <p role="alert" className="negative">{error}</p>}
  </details>;
}
