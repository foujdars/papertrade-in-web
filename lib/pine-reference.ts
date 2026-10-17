import type { Candle } from './market';

export type PineReference = { candles: Candle[]; columns: Record<string, (number | null)[]> };
export type PineReferencePlot = { name: string; values: number[] };

/** Read exported chart CSV without losing quoted plot names, na, or timestamp identity. */
export function readPineReference(csv: string): PineReference {
  if (csv.length > 25_000_000) throw new Error('Reference CSV exceeds 25 MB.');
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false, closed = false;
  const endCell = () => { row.push(value.trim()); value = ''; closed = false; };
  const endRow = () => { endCell(); if (row.some(Boolean)) rows.push(row); row = []; };
  const text = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (char === ',') endCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (closed && !/\s/.test(char) || char === '"') throw new Error('Malformed quoted CSV cell.');
    else value += char;
  }
  if (quoted) throw new Error('Unclosed quoted CSV cell.');
  if (row.length || value || closed) endRow();
  const headers = rows.shift();
  if (!headers || !rows.length) throw new Error('Reference CSV must contain a header and candles.');
  if (rows.length > 20_000) throw new Error('Reference CSV exceeds the 20,000 candle runtime limit.');
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('CSV column titles must be nonempty and unique. Rename duplicate plots before exporting.');
  const indices = ['time', 'open', 'high', 'low', 'close', 'volume'].map(name => {
    const matches = headers.flatMap((header, index) => header.toLowerCase() === name ? [index] : []);
    if (matches.length !== 1) throw new Error(`Export exactly one ${name} column (include Volume in the chart export).`);
    return matches[0];
  });
  const columns: PineReference['columns'] = Object.create(null);
  headers.forEach((header, index) => { if (!indices.includes(index)) columns[header] = []; });
  const number = (value: string, line: number, name: string) => {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw new Error(`Invalid ${name} at CSV row ${line}.`);
    return Number(value);
  };
  const candles = rows.map((cells, offset) => {
    const line = offset + 2;
    if (cells.length !== headers.length) throw new Error(`CSV row ${line} has ${cells.length} cells; expected ${headers.length}.`);
    const rawTime = cells[indices[0]];
    let time: number;
    if (/^\d+(?:\.\d+)?$/.test(rawTime)) { time = Number(rawTime); if (time >= 1e12) time /= 1000; }
    else {
      // Local date-times without an offset silently change with the machine timezone.
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawTime)) throw new Error(`Use UNIX timestamps or ISO timestamps with an explicit timezone at CSV row ${line}.`);
      time = Date.parse(rawTime) / 1000;
    }
    if (!Number.isSafeInteger(time) || time <= 0) throw new Error(`Invalid candle time at CSV row ${line}.`);
    const [open, high, low, close, volume] = indices.slice(1).map(index => number(cells[index], line, headers[index]));
    if (Math.min(open, high, low, close) <= 0 || low > Math.min(open, close) || high < Math.max(open, close) || volume < 0) throw new Error(`Invalid OHLCV candle at CSV row ${line}.`);
    headers.forEach((header, index) => {
      if (indices.includes(index)) return;
      const value = cells[index];
      columns[header].push(/^(?:na|nan|null)?$/i.test(value) ? null : number(value, line, header));
    });
    return { time, open, high, low, close, volume };
  });
  if (candles.some((candle, index) => index > 0 && candle.time <= candles[index - 1].time)) throw new Error('CSV candles must be strictly chronological with no duplicate timestamps.');
  if (!Object.keys(columns).length) throw new Error('Reference CSV contains no indicator plot columns to compare.');
  return { candles, columns };
}

/** Match every selected plot bar, including missing warm-up values; never silently skip mismatches. */
export function comparePineReference(reference: PineReference, plots: PineReferencePlot[], options: {
  columns?: Record<string, string>; skipBars?: number; absoluteTolerance?: number; relativeTolerance?: number;
} = {}) {
  const skip = options.skipBars ?? 0, absolute = options.absoluteTolerance ?? 1e-8, relative = options.relativeTolerance ?? 1e-8;
  if (!Number.isInteger(skip) || skip < 0 || skip >= reference.candles.length) throw new Error('skipBars must leave at least one candle to compare.');
  if (![absolute, relative].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Tolerances must be finite and nonnegative.');
  const pairs = options.columns ?? Object.fromEntries(Object.keys(reference.columns).map(name => [name, name]));
  if (!Object.keys(pairs).length) throw new Error('Select at least one reference plot column.');
  const mismatches: { plot: string; time: number; expected: number | null; actual: number | null; reason: string }[] = [];
  let compared = 0, failures = 0;
  const summaries = Object.entries(pairs).map(([column, plotName]) => {
    if (!Object.hasOwn(reference.columns, column)) throw new Error(`Missing CSV plot column: ${column}`);
    const matches = plots.filter(plot => plot.name === plotName);
    if (matches.length !== 1) throw new Error(`Expected exactly one runtime plot named ${plotName}; found ${matches.length}.`);
    const plot = matches[0];
    if (plot.values.length !== reference.candles.length) throw new Error(`Runtime plot ${plotName} has ${plot.values.length} bars; CSV has ${reference.candles.length}.`);
    let failed = 0, maxAbsoluteError = 0;
    for (let index = skip; index < reference.candles.length; index++) {
      compared++;
      const expected = reference.columns[column][index], raw = plot.values[index];
      const actual = Number.isFinite(raw) ? raw : null;
      const delta = expected !== null && actual !== null ? Math.abs(expected - actual) : null;
      const invalid = raw === Infinity || raw === -Infinity || typeof raw !== 'number';
      const equal = !invalid && (expected === null || actual === null ? expected === actual : delta! <= absolute + relative * Math.abs(expected));
      if (delta !== null) maxAbsoluteError = Math.max(maxAbsoluteError, delta);
      if (!equal) {
        failed++; failures++;
        if (mismatches.length < 100) mismatches.push({ plot: plotName, time: reference.candles[index].time, expected, actual, reason: invalid ? 'Invalid runtime value' : delta === null ? 'Missing-value mismatch' : 'Outside tolerance' });
      }
    }
    return { column, plot: plotName, compared: reference.candles.length - skip, failed, maxAbsoluteError };
  });
  return { passed: failures === 0, compared, failures, skippedBars: skip, absoluteTolerance: absolute, relativeTolerance: relative, columns: summaries, mismatches, omittedMismatches: Math.max(0, failures - mismatches.length) };
}
