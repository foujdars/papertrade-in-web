export type NewsItem = { title: string; url: string; source: string; publishedAt: string; sentiment: 'Positive' | 'Negative' | 'Mixed' | 'Neutral'; importance: number };
export function headlineSignals(title: string) {
 const up = /\b(beats?|surges?|rally|record profit|profit rises|wins?|approval|upgrade|dividend|growth)\b/i.test(title);
 const down = /\b(misses|plunges?|slump|loss(?:es)?|profit falls|fraud|probe|downgrade|penalty|default|recall)\b/i.test(title);
 return { sentiment: up && down ? 'Mixed' as const : up ? 'Positive' as const : down ? 'Negative' as const : 'Neutral' as const, importance: /\b(results|earnings|merger|acquisition|RBI|SEBI|Federal Reserve|Fed|rate cut|rate hike|repo rate|inflation|GDP|fraud|default|insolvency|bankruptcy|buyback|dividend|demerger|stock split|bonus issue|order win|contract win|wins? (?:an? |new )?(?:order|contract)|tariffs?|sanctions?)\b/i.test(title) ? 3 : up || down ? 2 : 1 };
}
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").trim();
export function parseNewsFeed(xml: string, source: string, now = Date.now()): NewsItem[] {
 return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(m => {
 const field = (n: string) => decode(m[1].match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'))?.[1] ?? '');
 const title=field('title'), url=field('link'), date=Date.parse(field('pubDate'));
 if(!title || !/^https?:\/\//i.test(url) || !Number.isFinite(date) || date>now+300000 || now-date>7*86400000) return [];
 return [{title,url,source,publishedAt:new Date(date).toISOString(),...headlineSignals(title)}];
 });
}
/** Newest first: an impact keyword must never bury a fresh market update. */
export function rankNews(items: NewsItem[], now = Date.now()) {
 const titles = new Set<string>(), urls = new Set<string>();
 return items.filter(item => {
   const date = Date.parse(item.publishedAt);
   return Number.isFinite(date) && date <= now + 300000 && now - date <= 7 * 86400000;
 }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.importance - a.importance).filter(item => {
   const title = item.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
   let url = item.url;
   try {
     const canonical = new URL(item.url);
     canonical.hash = '';
     for (const key of [...canonical.searchParams.keys()]) if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) canonical.searchParams.delete(key);
     url = canonical.href;
   } catch { return false; }
   if (titles.has(title) || urls.has(url)) return false;
   titles.add(title); urls.add(url); return true;
 }).slice(0, 120);
}
export function matchNewsStocks<T extends {symbol:string;name:string;assetType?:string}>(title:string, stocks:readonly T[]):T[] {
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();const text=` ${norm(title)} `;
 return stocks.filter(s=>{if(s.assetType && s.assetType!=='EQUITY')return false;const name=norm(s.name.replace(/\b(limited|ltd)\b/gi,''));return (name.length>=5 && text.includes(` ${name} `)) || (s.symbol.length>=4 && text.includes(` ${norm(s.symbol)} `)) || (s.symbol.length>=2 && title.split(/[^A-Za-z0-9&-]+/).includes(s.symbol));}).slice(0,5);
}
