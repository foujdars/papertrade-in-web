import type { AlgoQuote } from './algo-market-data.ts';

export type PaperLeg = { id: string; instrumentKey: string; symbol: string; side: 'BUY' | 'SELL'; quantity: number; stopPercent: number; targetPercent: number };
export type PaperPlan = { name: string; legs: PaperLeg[]; entryTime: string; exitTime: string; maxLoss: number; maxProfit: number; capital: number; feePerOrder: number; slippageBps: number };
export type AlgoPaperPosition = PaperLeg & { entryPrice: number; markPrice: number; enteredAt: number; unrealizedPnl: number };
export type AlgoPaperTrade = AlgoPaperPosition & { exitPrice: number; exitedAt: number; pnl: number; fees: number; reason: string };
export type AlgoPaperEvent = { id: string; at: number; message: string };
export type AlgoPaperSession = {
  version: 1; id: string; mode: 'demo' | 'market'; status: 'running' | 'paused' | 'stopping' | 'stopped';
  plan: PaperPlan; startedAt: number; lastChecked: number; cursor: number; enteredDay: string | null;
  stopRequested: boolean;
  positions: AlgoPaperPosition[]; trades: AlgoPaperTrade[]; events: AlgoPaperEvent[];
  equity: number; netPnl: number; entryFees: number; message: string;
};

export function algoClock(now: number) {
  const date = new Date(now + 19_800_000);
  return { day: date.toISOString().slice(0, 10), minute: date.getUTCHours() * 60 + date.getUTCMinutes() };
}
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const sign = (side: 'BUY' | 'SELL') => side === 'BUY' ? 1 : -1;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const execution = (price: number, side: 'BUY' | 'SELL', bps: number) => price * (1 + sign(side) * bps / 10_000);
const opposite = (side: 'BUY' | 'SELL') => side === 'BUY' ? 'SELL' : 'BUY';

function notice(session: AlgoPaperSession, message: string, now: number) {
  if (session.message !== message) session.events = [...session.events, { id: `${now}-${session.events.length}`, at: now, message }].slice(-300);
  session.message = message;
  return session;
}

export function createAlgoPaperSession(plan: PaperPlan, mode: 'demo' | 'market', now: number, id: string): AlgoPaperSession {
  if (!plan.legs.length || plan.legs.length > 8 || plan.legs.some(leg => !leg.instrumentKey || !Number.isInteger(leg.quantity) || leg.quantity < 1 || !['BUY', 'SELL'].includes(leg.side))) throw new Error('Choose valid legs before starting a paper run.');
  if (new Set(plan.legs.map(leg => leg.id)).size !== plan.legs.length) throw new Error('Leg IDs must be unique.');
  if (![plan.capital, plan.feePerOrder, plan.slippageBps, plan.maxLoss, plan.maxProfit].every(Number.isFinite) || plan.capital <= 0 || plan.feePerOrder < 0 || plan.slippageBps < 0 || plan.slippageBps > 1000 || plan.maxLoss < 0 || plan.maxProfit < 0) throw new Error('Invalid paper risk or cost settings.');
  if (![plan.entryTime, plan.exitTime].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || minute(plan.entryTime) < 555 || minute(plan.exitTime) > 929 || minute(plan.entryTime) >= minute(plan.exitTime)) throw new Error('Use an NSE entry and exit window between 09:15 and 15:29 IST.');
  if (plan.legs.some(leg => !Number.isFinite(leg.stopPercent) || !Number.isFinite(leg.targetPercent) || leg.stopPercent < 0 || leg.stopPercent >= 100 || leg.targetPercent < 0 || leg.targetPercent > 1000)) throw new Error('Invalid leg protection.');
  return notice({ version: 1, id, mode, status: 'running', plan: structuredClone(plan), startedAt: now, lastChecked: 0, cursor: 0, enteredDay: null, stopRequested: false, positions: [], trades: [], events: [], equity: plan.capital, netPnl: 0, entryFees: 0, message: '' }, mode === 'demo' ? 'Synthetic demo started. No broker orders.' : 'Waiting for fresh quotes and the entry window. No broker orders.', now);
}

function mark(session: AlgoPaperSession) {
  const closed = session.trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const unrealized = session.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const openEntryFees = session.positions.length * session.plan.feePerOrder;
  session.netPnl = money(closed + unrealized - openEntryFees);
  session.equity = money(session.plan.capital + session.netPnl);
}

function closeLeg(session: AlgoPaperSession, position: AlgoPaperPosition, price: number, reason: string, now: number) {
  const exitPrice = execution(price, opposite(position.side), session.plan.slippageBps);
  const fees = session.plan.feePerOrder * 2;
  const pnl = money((exitPrice - position.entryPrice) * sign(position.side) * position.quantity - fees);
  session.trades.push({ ...position, markPrice: price, exitPrice, exitedAt: now, fees, pnl, reason });
  session.positions = session.positions.filter(p => p.id !== position.id);
  notice(session, `${position.symbol}: ${reason}. Simulated P&L ${pnl.toFixed(2)}.`, now);
}

function freshQuotes(quotes: Record<string, AlgoQuote>, keys: string[], now: number) {
  const values = keys.map(key => quotes[key]);
  if (values.some((q, i) => !q || q.instrumentKey !== keys[i] || !Number.isFinite(q.price) || q.price <= 0 || !Number.isFinite(q.observedAt) || !Number.isFinite(q.tradedAt) || now - q.observedAt > 20_000 || now - q.tradedAt > 60_000 || q.observedAt > now + 2_000 || q.tradedAt > now + 2_000)) return false;
  // All legs must belong to one recent observation window, not mixed stale snapshots.
  return Math.max(...values.map(q => q.observedAt)) - Math.min(...values.map(q => q.observedAt)) <= 10_000;
}

export function advanceAlgoPaperSession(previous: AlgoPaperSession, quotes: Record<string, AlgoQuote>, now: number, options: { marketOpen: boolean; signalReady: boolean }): AlgoPaperSession {
  if (!['running', 'stopping'].includes(previous.status) || now < previous.lastChecked) return previous;
  const session: AlgoPaperSession = structuredClone(previous);
  session.lastChecked = now;
  const clock = algoClock(now), exitMinute = minute(session.plan.exitTime);
  const keys = [...new Set((session.positions.length ? session.positions : session.plan.legs).map(p => p.instrumentKey))];
  if (!options.marketOpen) return notice(session, 'Market closed or session unavailable. Waiting; no simulated fill.', now);
  if (!freshQuotes(quotes, keys, now)) return notice(session, 'Waiting for fresh, matching quotes for every leg. No simulated fill.', now);

  for (const position of session.positions) {
    position.markPrice = quotes[position.instrumentKey].price;
    position.unrealizedPnl = money((position.markPrice - position.entryPrice) * sign(position.side) * position.quantity);
  }
  mark(session);
  if (session.positions.length) {
    const basketPnl = session.positions.reduce((sum, p) => sum + p.unrealizedPnl - session.plan.feePerOrder * 2, 0) + session.trades.reduce((sum, t) => sum + t.pnl, 0);
    const basketReason = session.status === 'stopping' ? 'Manual stop' : session.enteredDay !== clock.day ? 'Session expired while paused' : clock.minute >= exitMinute ? 'Scheduled exit' : session.plan.maxLoss > 0 && basketPnl <= -session.plan.maxLoss ? 'Basket stop loss' : session.plan.maxProfit > 0 && basketPnl >= session.plan.maxProfit ? 'Basket target' : session.equity <= 0 ? 'Virtual capital exhausted' : null;
    for (const position of [...session.positions]) {
      const move = (position.markPrice - position.entryPrice) / position.entryPrice * sign(position.side) * 100;
      const reason = basketReason ?? (position.stopPercent > 0 && move <= -position.stopPercent ? 'Leg stop loss' : position.targetPercent > 0 && move >= position.targetPercent ? 'Leg target' : null);
      if (reason) closeLeg(session, position, position.markPrice, reason, now);
    }
    mark(session);
    if (!session.positions.length) { session.status = 'stopped'; notice(session, 'Paper run complete. All simulated legs are closed.', now); }
    return session;
  }
  if (session.status === 'stopping') { session.status = 'stopped'; return notice(session, 'Paper run stopped.', now); }
  if (session.enteredDay) { session.status = 'stopped'; return notice(session, 'Paper run complete. Start a new run to test again.', now); }
  if (clock.minute >= exitMinute) { session.status = 'stopped'; return notice(session, 'Entry window has ended. No simulated trade opened.', now); }
  if (clock.minute < minute(session.plan.entryTime)) return notice(session, `Waiting for ${session.plan.entryTime} IST.`, now);
  if (!options.signalReady) return notice(session, 'Waiting for an entry signal from completed candles.', now);
  const entryFees = session.plan.legs.length * session.plan.feePerOrder;
  // Conservative full-notional budget; this lab does not model broker margin or portfolio offsets.
  const notional = session.plan.legs.reduce((sum, leg) => sum + execution(quotes[leg.instrumentKey].price, leg.side, session.plan.slippageBps) * leg.quantity, 0);
  if (notional + entryFees * 2 > session.plan.capital) { session.status = 'paused'; return notice(session, 'Virtual capital is below gross leg notional plus costs. Increase test capital or reduce quantity.', now); }
  session.positions = session.plan.legs.map(leg => {
    const price = quotes[leg.instrumentKey].price, entryPrice = execution(price, leg.side, session.plan.slippageBps);
    return { ...leg, entryPrice, markPrice: price, enteredAt: now, unrealizedPnl: money((price - entryPrice) * sign(leg.side) * leg.quantity) };
  });
  session.entryFees = entryFees;
  session.enteredDay = clock.day;
  mark(session);
  return notice(session, `${session.positions.length} simulated leg${session.positions.length === 1 ? '' : 's'} opened. Monitoring stops and targets.`, now);
}

export function pauseAlgoPaperSession(previous: AlgoPaperSession, now: number, reason = 'Paused. Monitoring and simulated fills stop until you resume.') {
  if (previous.status === 'stopped') return previous;
  return notice({ ...previous, status: 'paused' }, reason, now);
}
export function resumeAlgoPaperSession(previous: AlgoPaperSession, now: number) {
  if (previous.status !== 'paused') return previous;
  return notice({ ...previous, status: previous.stopRequested ? 'stopping' : 'running' }, 'Resumed. Waiting for fresh observations.', now);
}
export function stopAlgoPaperSession(previous: AlgoPaperSession, now: number) {
  if (previous.status === 'stopped') return previous;
  return notice({ ...previous, stopRequested: true, status: previous.positions.length ? 'stopping' : 'stopped' }, previous.positions.length ? 'Stop requested. Open legs will close only at the next fresh quotes while the market is open.' : 'Paper run stopped.', now);
}

export function restoreAlgoPaperSession(value: unknown): AlgoPaperSession | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const session = value as AlgoPaperSession;
    if (session.version !== 1 || typeof session.id !== 'string' || !['demo', 'market'].includes(session.mode) || !['running', 'paused', 'stopping', 'stopped'].includes(session.status) || typeof session.stopRequested !== 'boolean' || !Number.isFinite(session.startedAt) || !Number.isFinite(session.lastChecked) || !Number.isInteger(session.cursor) || session.cursor < 0 || session.cursor > 100_000 || (session.enteredDay !== null && (typeof session.enteredDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(session.enteredDay)))) return null;
    createAlgoPaperSession(session.plan, session.mode, session.startedAt, session.id);
    if (!Array.isArray(session.positions) || session.positions.length > 8 || !Array.isArray(session.trades) || session.trades.length > 8 || !Array.isArray(session.events) || session.events.length > 300) return null;
    if (session.positions.some(p => !session.plan.legs.some(l => l.id === p.id && l.instrumentKey === p.instrumentKey && l.quantity === p.quantity && l.side === p.side) || ![p.entryPrice, p.markPrice, p.enteredAt, p.unrealizedPnl].every(Number.isFinite) || p.entryPrice <= 0 || p.markPrice <= 0) || session.trades.some(t => ![t.exitPrice, t.exitedAt, t.pnl, t.fees].every(Number.isFinite))) return null;
    if (session.events.some(e => typeof e.message !== 'string' || !Number.isFinite(e.at))) return null;
    const restored = structuredClone(session); mark(restored);
    return restored.status === 'stopped' ? restored : pauseAlgoPaperSession(restored, Date.now(), 'Restored paused. Resume to monitor fresh quotes; no background fills were assumed.');
  } catch { return null; }
}
