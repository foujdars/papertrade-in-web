import { parseNewsFeed, rankNews, type NewsItem } from '@/lib/market-news';

export const dynamic = 'force-dynamic';
const feeds = [
  ['Economic Times', 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms'],
  ['Moneycontrol', 'https://www.moneycontrol.com/rss/marketreports.xml'],
  ['Mint Markets', 'https://www.livemint.com/rss/markets'],
  ['Mint Companies', 'https://www.livemint.com/rss/companies'],
];
const CACHE_MS = 15_000;
const MANUAL_COOLDOWN_MS = 5_000;
const FALLBACK_MS = 86_400_000;
const responseHeaders = { 'Cache-Control': 'no-store, max-age=0' };
type SourceCache = { items: NewsItem[]; checkedAt: number; etag: string | null; modified: string | null };
type Snapshot = { items: NewsItem[]; updatedAt: string; checkedAt: string; unavailableSources: string[]; sourceCount: number; stale: boolean };
const sources = new Map<string, SourceCache>();
let cache: Snapshot | undefined;
let lastAttempt = 0;
let pending: Promise<Snapshot> | undefined;

async function load(): Promise<Snapshot> {
  const results = await Promise.allSettled(feeds.map(async ([source, url]) => {
    const saved = sources.get(url);
    const headers: Record<string, string> = { accept: 'application/rss+xml, application/xml, text/xml' };
    if (saved?.etag) headers['If-None-Match'] = saved.etag;
    if (saved?.modified) headers['If-Modified-Since'] = saved.modified;
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers });
    const now = Date.now();
    if (response.status === 304 && saved) {
      const items = rankNews(saved.items, now);
      if (!items.length) throw new Error('No recent headlines');
      sources.set(url, { ...saved, items, checkedAt: now });
      return;
    }
    if (!response.ok) throw new Error('Feed unavailable');
    const items = parseNewsFeed(await response.text(), source, now);
    if (!items.length) throw new Error('No recent headlines');
    sources.set(url, { items, checkedAt: now, etag: response.headers.get('etag'), modified: response.headers.get('last-modified') });
  }));
  const now = Date.now();
  // A failed publisher must not erase its last usable headlines or block other publishers.
  const usable = [...sources.values()].filter(source => now - source.checkedAt < FALLBACK_MS);
  const items = rankNews(usable.flatMap(source => source.items), now);
  return {
    items,
    updatedAt: usable.length ? new Date(Math.max(...usable.map(source => source.checkedAt))).toISOString() : '',
    checkedAt: new Date(now).toISOString(),
    unavailableSources: results.flatMap((result, index) => result.status === 'rejected' ? [feeds[index][0]] : []),
    sourceCount: feeds.length,
    stale: results.every(result => result.status === 'rejected'),
  };
}

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  const maxAge = force ? MANUAL_COOLDOWN_MS : CACHE_MS;
  if (!cache || Date.now() - lastAttempt >= maxAge) {
    // Share one upstream refresh across simultaneous tabs/users, including manual refreshes.
    pending ??= load().then(snapshot => { cache = snapshot; lastAttempt = Date.now(); return snapshot; }).finally(() => { pending = undefined; });
    await pending;
  }
  if (!cache?.items.length) return Response.json({ error: 'News is temporarily unavailable. Retrying automatically.' }, { status: 503, headers: responseHeaders });
  return Response.json(cache, { headers: responseHeaders });
}
