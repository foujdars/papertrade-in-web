import { parseNewsFeed, rankNews, type NewsItem } from '@/lib/market-news';
export const dynamic = 'force-dynamic';
const feeds = [
  ['Economic Times', 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms'],
  ['Moneycontrol', 'https://www.moneycontrol.com/rss/marketreports.xml'],
];
let cache: { items: NewsItem[]; updatedAt: string; unavailableSources: string[] } | undefined;
let pending: Promise<NonNullable<typeof cache>> | undefined;
async function load() {
  const results = await Promise.allSettled(feeds.map(async ([source, url]) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error('Feed unavailable');
    const items = parseNewsFeed(await response.text(), source);
    if (!items.length) throw new Error('No recent headlines');
    return items;
  }));
  const items = rankNews(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
  if (!items.length) throw new Error('News sources are temporarily unavailable');
  return { items, updatedAt: new Date().toISOString(), unavailableSources: results.flatMap((r, i) => r.status === 'rejected' ? [feeds[i][0]] : []) };
}
export async function GET() {
  try {
    if (!cache || Date.now() - Date.parse(cache.updatedAt) > 300000) {
      pending ??= load().finally(() => { pending = undefined; });
      cache = await pending;
    }
    return Response.json({ ...cache, stale: false });
  } catch {
    if (cache && Date.now() - Date.parse(cache.updatedAt) < 86400000) return Response.json({ ...cache, stale: true });
    return Response.json({ error: 'News is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
