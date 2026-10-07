import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { commodityLogo, rankCommodityRows } from '../lib/commodity-discovery.ts';
import { resolveStockLogo } from '../lib/stock-logo.ts';
const contract = root => ({ symbol: root + '-20261204', instrumentKey: 'MCX_FO|123' });
test('MCX icons use local commodity artwork for full and mini contracts', async () => {
  for (const [root, type] of [['GOLD', 'gold'], ['GOLDM', 'gold'], ['SILVERM', 'silver'], ['CRUDEOILM', 'oil'], ['NATGASMINI', 'gas'], ['COPPER', 'copper'], ['ALUMINI', 'aluminium'], ['ZINC', 'metal'], ['ELECDMBL', 'electricity'], ['CARDAMOM', 'agriculture']]) {
    const path = commodityLogo(contract(root));
    assert.equal(path, '/commodities/' + type + '.svg');
    assert.equal(resolveStockLogo(contract(root), new Map()), path);
    await access(new URL('../public' + path, import.meta.url));
    const svg = await readFile(new URL('../public' + path, import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 48 48"/);
    assert.doesNotMatch(svg, /https?:\/\/(?!www.w3.org)|<script/);
  }
  assert.equal(commodityLogo({ symbol: 'GOLD', instrumentKey: 'NSE_EQ|INE123' }), null);
});
test('observed volume outranks popular order, missing volumes do not become invented activity', () => {
  const rows = ['CARDAMOM', 'GOLD', 'CRUDEOILM', 'NATGASMINI'].map(contract);
  const snapshot = { CARDAMOM: 5, GOLD: 4600, CRUDEOILM: 71000, NATGASMINI: 25000 };
  assert.deepEqual(rankCommodityRows(rows, row => snapshot[row.symbol.split('-')[0]]).map(row => row.symbol.split('-')[0]), ['CRUDEOILM', 'NATGASMINI', 'GOLD', 'CARDAMOM']);
  assert.deepEqual(rankCommodityRows(rows, () => NaN).map(row => row.symbol.split('-')[0]), ['CRUDEOILM', 'NATGASMINI', 'GOLD', 'CARDAMOM']);
  assert.equal(rows[0].symbol, 'CARDAMOM-20261204');
  assert.equal(rankCommodityRows(rows, row => row.symbol.startsWith('CARDAMOM') ? 100 : -10)[0].symbol, 'CARDAMOM-20261204');
});
