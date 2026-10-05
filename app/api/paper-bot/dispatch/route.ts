import { GET as market } from '@/app/api/global-markets/route';
import { randomUUID } from 'node:crypto';
import { runBackgroundAccount, type CloudBotAccount, type BotMarket } from '@/lib/paper-bot-background';
import { botDatabase, botError, BotRequestError, requireBotScheduler, saveCloudBotAccount } from '@/lib/paper-bot-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  let healthDb: ReturnType<typeof botDatabase> | undefined;
  const started = Date.now();
  try {
    requireBotScheduler(request);
    const db = botDatabase(); healthDb = db;
    const { data, error } = await db.from('paper_bot_accounts').select('user_id,account,version,last_checked_at,last_error').eq('active', true).limit(26);
    if (error || !data || data.length > 25) throw new BotRequestError('Background bot capacity or storage needs attention.');
    const pending = new Map<string, { at: number; value: Promise<BotMarket> }>();
    const feed = (symbol: string, frame?: string) => {
      const key = `${symbol}:${frame ?? 'quote'}`, cached = pending.get(key);
      if (cached && Date.now() - cached.at < (frame ? 8000 : 2000)) return cached.value;
      const value = (async () => {
        const params = new URLSearchParams({ symbol, ...(frame ? { mode: 'candles', timeframe: frame } : {}) });
        const response = await market(new Request(`https://papertrade.site/api/global-markets?${params}`));
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error('Market data unavailable');
        return result as BotMarket;
      })();
      pending.set(key, { at: Date.now(), value }); return value;
    };
    const results = await Promise.allSettled((data as CloudBotAccount[]).map(async record => {
      const token = randomUUID();
      const { data: claimed, error: claimError } = await db.rpc('paper_bot_claim', { p_user_id: record.user_id, p_now: Date.now(), p_token: token });
      if (claimError) throw new Error('Worker claim failed');
      if (!claimed?.[0]) return { conflict: true, failed: false };
      try {
        return await runBackgroundAccount(claimed[0], { now: Date.now, market: feed, save: (current, account, checked, message) => saveCloudBotAccount(db, current, account, checked, message) });
      } finally {
        await db.rpc('paper_bot_release', { p_user_id: record.user_id, p_token: token });
      }
    }));
    const failed = results.filter(result => result.status === 'rejected' || result.value.failed).length;
    const { error: healthError } = await db.rpc('paper_bot_heartbeat', { p_at: started, p_ok: true, p_failed: failed });
    if (healthError) throw new BotRequestError('Background heartbeat could not be saved.');
    return Response.json({ ok: true, checked: data.length, failed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (healthDb) await healthDb.rpc('paper_bot_heartbeat', { p_at: started, p_ok: false, p_failed: 1 }).then(() => {}, () => {});
    return botError(error);
  }
}
