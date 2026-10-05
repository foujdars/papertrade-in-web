import { advanceGlobalAccount, readGlobalAccount } from './global-order-engine.ts';
import { advanceOptions, type OptionObservation } from './global-option-orders.ts';
import { advancePaperBots, type BotObservation } from './paper-bot-engine.ts';
import { botFrames, botScope } from './paper-bot-state.ts';
import type { PerpAccount, PerpQuote, PerpSpec, PerpSymbol } from './global-markets.ts';

export type CloudBotAccount = { user_id: string; account: PerpAccount; version: number; last_checked_at: number; last_error: string };
export type BotMarket = { kind?: string; quote?: PerpQuote; spec?: PerpSpec; candles?: BotObservation['candles']; fetchedAt?: number; settlement?: number };
export const backgroundActive = (a: PerpAccount) => !!(a.bots?.some(b => b.enabled) || a.positions.length || a.orders.length || a.optionPositions?.length || a.optionOrders?.length);
export type BackgroundDependencies = {
  now: () => number;
  market: (symbol: string, frame?: string) => Promise<BotMarket>;
  save: (current: CloudBotAccount, account: PerpAccount, checked: number, error: string) => Promise<CloudBotAccount | null>;
};

/** No browser state or timers. Every save is a compare-and-swap against the shared wallet. */
export async function runBackgroundAccount(record: CloudBotAccount, deps: BackgroundDependencies) {
  const account = readGlobalAccount(JSON.stringify(record.account));
  const symbols = [...new Set([...(account.bots ?? []).filter(b => b.enabled).map(b => b.symbol), ...account.positions.map(p => p.symbol), ...account.orders.map(o => o.symbol), ...(account.optionPositions ?? []).map(p => p.symbol), ...(account.optionOrders ?? []).map(o => o.symbol)])];
  const snapshots: Partial<Record<PerpSymbol, { quote: PerpQuote; spec: PerpSpec }>> = {};
  const options: Record<string, OptionObservation> = {};
  const failures: string[] = [];
  await Promise.all(symbols.map(async symbol => {
    try {
      const data = await deps.market(symbol);
      if (data.kind === 'option') {
        if (typeof data.settlement === 'number') options[symbol] = { settlement: data.settlement };
        else if (data.quote && data.spec) options[symbol] = { snapshot: { quote: data.quote, spec: data.spec } as unknown as NonNullable<OptionObservation['snapshot']> };
        else throw new Error('Missing option quote');
      } else if (data.quote?.symbol === symbol && data.spec?.symbol === symbol) snapshots[symbol] = { quote: data.quote, spec: data.spec };
      else throw new Error('Missing quote');
    } catch { failures.push(`${symbol}: price unavailable`); }
  }));
  const now = deps.now();
  const quotes: Partial<Record<PerpSymbol, PerpQuote>> = {}, specs: Partial<Record<PerpSymbol, PerpSpec>> = {};
  for (const [symbol, snapshot] of Object.entries(snapshots)) if (snapshot) { quotes[symbol] = snapshot.quote; specs[symbol] = snapshot.spec; }
  // Persist protective exits first. Slow candle history never holds up TP/SL processing.
  const protectedAccount = advanceOptions(advanceGlobalAccount(account, quotes, specs, now), options, now);
  const protectedRecord = await deps.save(record, protectedAccount, now, failures.join(' · ').slice(0, 500));
  if (!protectedRecord) return { conflict: true, failed: false }; // Pause/edit/another worker won; discard this run.
  const bots = protectedAccount.bots?.filter(b => b.enabled) ?? [];
  if (!bots.length) return { conflict: false, failed: failures.length > 0 };
  const observations: Record<string, BotObservation> = {};
  const scopes = [...new Set(bots.flatMap(bot => [...botFrames(bot), ...(bot.trendTimeframe && bot.trendTimeframe !== 'off' ? [bot.trendTimeframe] : [])].map(frame => botScope(bot.symbol, frame))))];
  await Promise.all(scopes.map(async scope => {
    const [symbol, frame] = scope.split(':');
    try {
      const data = await deps.market(symbol, frame);
      if (!Array.isArray(data.candles) || !Number.isFinite(data.fetchedAt)) throw new Error('Missing history');
      observations[scope] = { candles: data.candles, fetchedAt: data.fetchedAt! };
    } catch { failures.push(`${scope}: candles unavailable`); }
  }));
  // Refresh entry quotes after history fetches; never fill against a stale snapshot.
  await Promise.all(bots.map(async bot => {
    try {
      const data = await deps.market(bot.symbol);
      if (data.quote?.symbol !== bot.symbol || data.spec?.symbol !== bot.symbol) throw new Error('Missing entry quote');
      snapshots[bot.symbol] = { quote: data.quote, spec: data.spec };
    } catch { delete snapshots[bot.symbol]; failures.push(`${bot.symbol}: entry price unavailable`); }
  }));
  const checked = deps.now();
  const next = advancePaperBots(protectedAccount, snapshots, observations, checked);
  const saved = await deps.save(protectedRecord, next, checked, failures.join(' · ').slice(0, 500));
  return { conflict: !saved, failed: failures.length > 0 };
}
