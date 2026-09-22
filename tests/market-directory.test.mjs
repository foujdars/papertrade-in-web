import test from 'node:test';
import assert from 'node:assert/strict';
import { marketGroup, marketTicker, marketDisplayName, marketProductLabel, compareMarketInstruments } from '../lib/market-directory.ts';
const item = (symbol, categories, extra = {}) => ({ symbol, name: symbol, categories, instrumentKey: `DELTA|${symbol}`, assetType: 'FUTURE', ...extra });
test('global groups distinguish US-linked contracts, commodities and crypto', () => {
  assert.equal(marketGroup(item('AAPLXUSD', ['GLOBAL', 'US_MARKET'])), 'us');
  for (const [symbol, tag] of [['XAUTUSD', 'METAL'], ['SLVONUSD', 'METAL'], ['BRENT', 'ENERGY']]) assert.equal(marketGroup(item(symbol, ['GLOBAL', tag])), 'commodities');
  assert.equal(marketGroup(item('BTCUSD', ['GLOBAL', 'CRYPTO'])), 'crypto');
  assert.equal(marketGroup(item('TCS', ['NIFTY 50'], { instrumentKey: 'NSE_EQ|TCS' })), 'india');
});
test('curated leaders precede alphabetical tail and option strikes', () => {
  const stocks = ['AMDBUSD', 'AAPLXUSD', 'NVDAXUSD', 'RKLBBUSD'].map(symbol => item(symbol, ['GLOBAL', 'US_MARKET']));
  assert.deepEqual(stocks.sort(compareMarketInstruments).map(marketTicker), ['NVDA', 'AAPL', 'AMD', 'RKLB']);
  const crypto = ['AAAUSD', 'ETHUSD', 'BTCUSD'].map(symbol => item(symbol, ['GLOBAL', 'CRYPTO']));
  crypto.push(item('C-BTC-100000-010127', ['GLOBAL', 'OPTION'], { assetType: 'OPTION' }));
  assert.deepEqual(crypto.sort(compareMarketInstruments).map(x => x.symbol), ['BTCUSD', 'ETHUSD', 'AAAUSD', 'C-BTC-100000-010127']);
});
test('names never disguise token contracts as direct shares', () => {
  const stock = item('AAPLXUSD', ['GLOBAL', 'US_MARKET'], { name: 'Apple xStock Token perpetual' });
  assert.equal(marketDisplayName(stock), 'Apple');
  assert.equal(marketProductLabel(stock), 'Tokenised perpetual · USD');
  assert.equal(marketProductLabel(item('BRENT', ['GLOBAL'], { instrumentKey: 'TVC|UKOIL' })), 'Reference · watch only');
});
