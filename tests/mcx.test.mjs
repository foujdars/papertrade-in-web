import test from 'node:test';
import assert from 'node:assert/strict';
import { mcxInstruments, indianInstrumentStatus, indianSquareOffMinute } from '../lib/mcx.ts';
import { marketGroup, marketProductLabel } from '../lib/market-directory.ts';
import { searchShelfRows, FALLBACK_POPULAR } from '../lib/search-shelf.ts';
import { isSupportedNseInstrumentKey } from '../lib/upstox.ts';
import { futureFillCashDelta, calculatePosition } from '../lib/paper-trading.ts';
import { calculateUpstoxTradingCharges } from '../lib/trading-charges.ts';

const at = value => new Date(value + '+05:30');
const row = (root, expiry = '2026-12-04', key = '123') => ({ segment: 'MCX_FO', instrument_type: 'FUT', instrument_key: 'MCX_FO|' + key, underlying_symbol: root, name: root, trading_symbol: `${root} FUT ${expiry}`, expiry: +at(expiry + 'T23:59:59'), lot_size: 1000, qty_multiplier: 100, underlying_key: 'MCX_COM|1' });
const gold = mcxInstruments([row('GOLD')], at('2026-10-07T10:00:00'))[0];
const session = (now, start = '09:00', end = '23:30') => ({ date: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), checkedAt: +now, status: 'NORMAL_OPEN', source: 'MCX test', sessions: [{ start: +at(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T' + start + ':00'), end: +at(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T' + end + ':00') }] });

test('MCX catalogue uses active futures, unique dated symbols and quote-unit multipliers', () => {
  const rows = mcxInstruments([row('GOLD'), row('GOLD', '2027-02-05', '456'), row('SILVER', '2026-09-01'), { ...row('GOLD'), instrument_type: 'CE' }, { ...row('GOLD'), qty_multiplier: 0 }], at('2026-10-07T09:00:00'));
  assert.equal(rows.length, 2); assert.equal(rows[0].lotSize, 100); assert.notEqual(rows[0].symbol, rows[1].symbol);
  assert.equal(rows[0].exchange, 'MCX'); assert.equal(rows[0].assetType, 'FUTURE');
  assert.equal(marketGroup(gold), 'india'); assert.equal(marketProductLabel(gold), 'MCX future · INR');
  assert.equal(isSupportedNseInstrumentKey(gold.instrumentKey), true); assert.equal(isSupportedNseInstrumentKey('MCX_FO|../bad'), false);
});

test('MCX is open after NSE closes and uses its own session cutoff', () => {
  const now = at('2026-10-07T20:00:00');
  const mcx = session(now), nse = session(now, '09:15', '15:30');
  assert.equal(indianInstrumentStatus(gold, now, nse, mcx).isOpen, true);
  assert.equal(indianInstrumentStatus({ ...gold, instrumentKey: 'NSE_FO|1' }, now, nse, mcx).isOpen, false);
  assert.equal(indianSquareOffMinute(gold, now, nse, mcx), 23 * 60);
  assert.equal(indianSquareOffMinute(gold, now, nse, session(now, '09:00', '23:55')), 23 * 60 + 25);
});

test('holiday, special evening window, stale/unavailable sessions and agri caps remain exchange-specific', () => {
  const now = at('2026-10-07T18:00:00');
  const mcx = session(now);
  for (const unavailable of [null, { ...mcx, checkedAt: +now - 90_000 }, { ...mcx, status: 'UNAVAILABLE' }, { ...mcx, sessions: [] }, { ...mcx, date: '2026-10-06' }]) assert.equal(indianInstrumentStatus(gold, now, null, unavailable).isOpen, false);
  assert.equal(indianInstrumentStatus(gold, now, null, session(now, '17:00', '23:30')).isOpen, true);
  const mentha = mcxInstruments([row('MENTHAOIL')], now)[0], cotton = mcxInstruments([row('COTTON')], now)[0];
  assert.equal(indianInstrumentStatus(mentha, now, null, mcx).isOpen, false);
  assert.equal(indianSquareOffMinute(mentha, now, null, mcx), 16 * 60 + 30);
  assert.equal(indianInstrumentStatus(cotton, now, null, mcx).isOpen, true);
  assert.equal(indianSquareOffMinute(cotton, now, null, mcx), 20 * 60 + 30);
});

test('MCX shelf is separate from global commodities and defaults to nearest expiry', () => {
  const pool = [gold, ...mcxInstruments([row('GOLD', '2027-02-05', '456')], at('2026-10-07T09:00:00')), { symbol: 'XAUTUSD', name: 'Global Gold', instrumentKey: 'DELTA|XAUTUSD', categories: ['GLOBAL', 'GOLD'], assetType: 'FUTURE' }];
  const base = { instruments: pool, recent: [], popular: FALLBACK_POPULAR };
  assert.equal(searchShelfRows({ ...base, shelf: 'mcx', query: '' }).popular.length, 1);
  assert.equal(searchShelfRows({ ...base, shelf: 'mcx', query: 'gold' }).matches.length, 2);
  assert.equal(searchShelfRows({ ...base, shelf: 'in', query: 'gold' }).matches.length, 2);
});

test('MCX long and short futures release margin and realise quoted-unit P&L', () => {
  for (const side of ['BUY', 'SELL']) {
    const entry = { id: '1', createdAt: 1, status: 'COMPLETE', symbol: gold.symbol, side, product: 'DELIVERY', assetType: 'FUTURE', instrumentKey: gold.instrumentKey, quantity: 100, price: 10000, charges: { total: 0 } };
    const exit = { ...entry, id: '2', createdAt: 2, side: side === 'BUY' ? 'SELL' : 'BUY', price: side === 'BUY' ? 10100 : 9900 };
    const debit = futureFillCashDelta([], entry), credit = futureFillCashDelta([entry], exit);
    assert.equal(debit.cashDelta, -200000); assert.equal(credit.realisedPnl, 10000); assert.equal(debit.cashDelta + credit.cashDelta, 10000);
    assert.equal(calculatePosition([entry, exit], gold.symbol, exit.price, 'DELIVERY').quantity, 0);
  }
  const input = { side: 'SELL', product: 'DELIVERY', quantity: 100, price: 10000 };
  assert.equal(calculateUpstoxTradingCharges('FUTURE', input, gold.instrumentKey, 'GOLD').stt, 100);
  assert.equal(calculateUpstoxTradingCharges('FUTURE', input, 'NSE_FO|1').stt, 500);
});
