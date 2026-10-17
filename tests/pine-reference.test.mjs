import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readPineReference, comparePineReference } from '../lib/pine-reference.ts';
import { runAdvancedPineScript } from '../lib/pine-runtime.ts';
const fixture = path => new URL(`./fixtures/pine-reference/${path}`, import.meta.url);
const csv = readFileSync(fixture('arithmetic.csv'), 'utf8');
const source = readFileSync(fixture('arithmetic.pine'), 'utf8');

test('independently calculated SMA, EMA, history and RSI match every candle including warmup', async () => {
  const reference = readPineReference(csv);
  const result = await runAdvancedPineScript(source, reference.candles, {}, {symbol: 'REFERENCE', timeframe: '5'});
  assert.equal(result.error, null);
  const report = comparePineReference(reference, result.plots);
  assert.equal(report.passed, true); assert.equal(report.compared, 24); assert.equal(report.failures, 0);
});
test('quoted titles, escaped quotes, BOM, CRLF and ISO timezone preserve reference identity', () => {
  const reference = readPineReference('\uFEFFtime,open,high,low,close,Volume,"Moving, average","Signal ""A"""\r\n2023-11-15T03:45:00+05:30,10,11,9,10,100,NA,1\r\n');
  assert.deepEqual(reference.columns['Moving, average'], [null]);
  assert.deepEqual(reference.columns['Signal "A"'], [1]);
  assert.equal(reference.candles[0].time, Date.parse('2023-11-14T22:15:00Z') / 1000);
});
test('missing values and infinity cannot become a passing zero or absent observation', () => {
  const reference = readPineReference(csv), plots = Object.entries(reference.columns).map(([name, values]) => ({name, values: values.map(value => value ?? NaN)}));
  plots[0].values[0] = 0;
  plots[1].values[0] = Infinity;
  const result = comparePineReference(reference, plots);
  assert.equal(result.passed, false); assert.equal(result.failures, 2);
  assert.deepEqual(result.mismatches.map(value => value.reason), ['Missing-value mismatch', 'Invalid runtime value']);
});
test('unknown or duplicate plot matches and mismatched history fail instead of silently skipping', () => {
  const reference = readPineReference(csv);
  assert.throws(() => comparePineReference(reference, []), /exactly one runtime plot/);
  assert.throws(() => comparePineReference(reference, [{name:'SMA 3',values:[]}]), /CSV has 6/);
  assert.throws(() => comparePineReference(reference, [{name:'SMA 3',values:[]},{name:'SMA 3',values:[]}]), /found 2/);
  assert.throws(() => comparePineReference(reference, [], {columns:{Missing:'SMA 3'}}), /Missing CSV plot/);
});
test('explicit column mapping and tolerances give bounded mismatch details', () => {
  const reference = readPineReference(csv);
  const result = comparePineReference(reference, [{name:'Renamed',values:[NaN,NaN,11,12.1,13,14]}], {columns:{'SMA 3':'Renamed'},relativeTolerance:0,absoluteTolerance:0.01});
  assert.equal(result.failures,1); assert.equal(result.mismatches[0].time,1700001000);
  assert.equal(comparePineReference(reference,[{name:'SMA 3',values:[0,0,11,12,13,14]}],{columns:{'SMA 3':'SMA 3'},skipBars:2}).passed,true);
  for (const options of [{skipBars:6},{skipBars:-1},{absoluteTolerance:NaN},{relativeTolerance:-1},{columns:{}}]) assert.throws(() => comparePineReference(reference,[],options));
});
test('CSV rejects ambiguous dates, invalid prices, duplicate bars and malformed quoting', () => {
  assert.throws(() => readPineReference(csv.replace('1700000100','2023-11-14 22:15:00')),/explicit timezone/);
  assert.throws(() => readPineReference(csv.replace('1700000400','1700000100')),/strictly chronological/);
  assert.throws(() => readPineReference(csv.replace('9.5,11,9,10','9.5,9,9,10')),/Invalid OHLCV/);
  assert.throws(() => readPineReference(csv.replace('SMA 3,EMA 3','SMA 3,SMA 3')),/unique/);
  assert.throws(() => readPineReference(csv.replace('volume,','vol,')),/volume column/);
  assert.throws(() => readPineReference(csv+'"unterminated'),/Unclosed/);
  assert.throws(() => readPineReference(csv.replace('SMA 3','"SMA 3"extra')),/Malformed/);
});
test('comparison command runs the real runtime and produces a reviewable report', () => {
  const result = spawnSync(process.execPath,['--experimental-strip-types','scripts/compare-pine-reference.mjs','--script','tests/fixtures/pine-reference/arithmetic.pine','--reference','tests/fixtures/pine-reference/arithmetic.csv','--timeframe','5'],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed,true); assert.equal(report.compared,24);
  assert.match(report.sourceSha256,/^[a-f0-9]{64}$/); assert.match(report.inputsSha256,/^[a-f0-9]{64}$/); assert.match(report.contextSha256,/^[a-f0-9]{64}$/); assert.equal(report.referenceKind,'user-supplied CSV');
});
