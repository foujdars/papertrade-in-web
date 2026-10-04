"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Newspaper, RefreshCw, ExternalLink } from 'lucide-react';
import type { Instrument } from '@/lib/market';
import { matchNewsStocks, rankNews, type NewsItem } from '@/lib/market-news';
import { StockLogo } from './StockLogo';
import './news-workspace.css';

const REFRESH_MS = 30_000;
const filters = ['All', 'Positive', 'Negative', 'Mixed', 'Neutral'] as const;
type Feed = { items: NewsItem[]; updatedAt: string; checkedAt: string; unavailableSources: string[]; sourceCount: number; stale: boolean };
const timestamp = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
function age(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export function NewsWorkspace({ instruments, onOpenChart }: { instruments: Instrument[]; onOpenChart: (stock: Instrument) => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<typeof filters[number]>('All');
  const [important, setImportant] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const request = useRef<AbortController | null>(null);
  const lastRequest = useRef(0);
  const scrollArea = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (request.current || (!force && Date.now() - lastRequest.current < 1000)) return;
    const controller = new AbortController();
    request.current = controller;
    lastRequest.current = Date.now();
    setLoading(true);
    // Keep the first visible headline anchored when fresh items arrive above it.
    const anchor = [...(scrollArea.current?.querySelectorAll<HTMLElement>('[data-news-id]') ?? [])]
      .find(node => node.getBoundingClientRect().bottom > (scrollArea.current?.getBoundingClientRect().top ?? 0) + 5);
    const preserveAnchor = scrollArea.current && scrollArea.current.scrollTop > 24 && anchor
      ? { id: anchor.dataset.newsId, top: anchor.getBoundingClientRect().top, scroll: scrollArea.current.scrollTop } : null;
    try {
      const response = await fetch(`/api/market/news${force ? '?refresh=1' : ''}`, {
        cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Refresh unavailable. Retrying automatically.');
      if (!Array.isArray(data.items)) throw new Error('Refresh unavailable. Retrying automatically.');
      if (controller.signal.aborted) return;
      setFeed(data); setError(''); setClock(Date.now());
      if (preserveAnchor) requestAnimationFrame(() => {
        const area = scrollArea.current;
        if (!area || Math.abs(area.scrollTop - preserveAnchor.scroll) > 2) return;
        const node = [...area.querySelectorAll<HTMLElement>('[data-news-id]')].find(item => item.dataset.newsId === preserveAnchor.id);
        if (node) area.scrollTop += node.getBoundingClientRect().top - preserveAnchor.top;
      });
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error && caught.name !== 'TimeoutError' ? caught.message : 'Refresh timed out. Retrying automatically.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true); };
    const timer = window.setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh();
    }, REFRESH_MS);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      request.current?.abort(); request.current = null; lastRequest.current = 0;
    };
  }, [refresh]);

  const rows = useMemo(() => rankNews(feed?.items ?? []).filter(item => (!important || item.importance === 3) && (filter === 'All' || item.sentiment === filter))
    .map(item => ({ ...item, stocks: matchNewsStocks(item.title, instruments) })), [feed, instruments, filter, important]);
  const resetScroll = () => { if (scrollArea.current) scrollArea.current.scrollTop = 0; };
  const unavailable = feed?.unavailableSources ?? [];
  const status = error ? (feed ? 'Refresh unavailable · saved news' : error) : feed?.stale ? 'Saved news · retrying' : '';

  return <section ref={scrollArea} className="news-workspace" aria-label="Market news" tabIndex={0}>
    <div className="news-content">
      <header className="news-header">
        <h1><Newspaper size={23} aria-hidden="true" />News</h1>
        <button disabled={loading} onClick={() => void refresh(true)} aria-label="Refresh news"><RefreshCw size={16} aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>
      <div className="news-toolbar">
        <div className="news-modes" role="group" aria-label="News priority">
          <button aria-pressed={!important} onClick={() => { setImportant(false); resetScroll(); }}>Latest</button>
          <button aria-pressed={important} onClick={() => { setImportant(true); resetScroll(); }}>Important</button>
        </div>
        {feed && <span className="news-update" title={`Last successful check: ${timestamp(feed.updatedAt)}`}>
          Checked <time dateTime={feed.checkedAt}>{new Date(feed.checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST</time>
        </span>}
      </div>
      <div className="news-filters" role="group" aria-label="Headline sentiment">{filters.map(value => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); resetScroll(); }}>{value}</button>)}</div>
      <div className="news-feed-status">
        <span>{rows.length} headlines</span>
        {feed && <span className={unavailable.length ? 'news-partial' : ''} title={unavailable.length ? `Unavailable: ${unavailable.join(', ')}` : 'All feeds checked'}>{feed.sourceCount - unavailable.length}/{feed.sourceCount} feeds</span>}
        {status && <span role={error && !feed ? 'alert' : 'status'}>{status}</span>}
      </div>
      {loading && !feed && <p role="status" className="news-empty">Loading headlines…</p>}
      {!loading && !error && !rows.length && <p className="news-empty">No recent headlines match this filter.</p>}
      <div className="news-list" aria-label="Headlines">{rows.map(item => <article key={item.url} data-news-id={item.url}>
        <div className="news-meta"><span className="news-source">{item.source}</span><time dateTime={item.publishedAt} title={timestamp(item.publishedAt)} aria-label={`Published ${timestamp(item.publishedAt)}`}>{age(item.publishedAt, clock)}</time></div>
        <h2><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ExternalLink size={13} aria-hidden="true" /></a></h2>
        <div className="news-tags"><span className={`news-sentiment news-${item.sentiment.toLowerCase()}`} title="Headline sentiment">{item.sentiment}</span>{item.importance === 3 && <span className="news-important">Important</span>}
          {unavailable.includes(item.source) && <span className="news-cached">Saved</span>}
          {item.stocks.map(stock => <button key={stock.instrumentKey} aria-label={`Open ${stock.symbol} chart`} onClick={() => onOpenChart(stock)}><StockLogo {...stock} size={20} /><b>{stock.symbol}</b></button>)}
        </div>
      </article>)}</div>
    </div>
  </section>;
}
