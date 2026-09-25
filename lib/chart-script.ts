import type { Candle } from "./market";
import type { StudyPlot } from "./study-calculations";

export type ChartScriptRun = { plots: StudyPlot[]; levels: number[]; overlay: boolean; error: string | null };

const COLORS = ["#753bce", "#0b9f7a", "#e23b4a", "#2563eb"];

type Value = number | number[];
type Env = Map<string, Value>;

export function runChartScript(source: string, candles: Candle[]): ChartScriptRun {
  const empty = { plots: [] as StudyPlot[], levels: [] as number[], overlay: false, error: null as string | null };
  const text = source.trim();
  if (!text) return empty;
  if (!candles.length) return { ...empty, error: "Waiting for candles" };
  try {
    const open = candles.map((bar) => bar.open);
    const high = candles.map((bar) => bar.high);
    const low = candles.map((bar) => bar.low);
    const close = candles.map((bar) => bar.close);
    const volume = candles.map((bar) => Number(bar.volume) || 0);
    const env: Env = new Map<string, Value>([
      ["open", open], ["high", high], ["low", low], ["close", close], ["volume", volume],
      ["hl2", zip(high, low, (a, b) => (a + b) / 2)],
      ["hlc3", close.map((value, index) => (high[index] + low[index] + value) / 3)],
      ["ohlc4", close.map((value, index) => (open[index] + high[index] + low[index] + value) / 4)],
    ]);
    const plots: StudyPlot[] = [];
    const levels: number[] = [];
    let overlay = false;
    for (const [index, raw] of text.split(/\n/).entries()) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      if (line === "overlay") { overlay = true; continue; }
      const assigned = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (assigned) {
        env.set(assigned[1], evaluate(assigned[2], env, candles, index + 1));
        continue;
      }
      const plotted = /^plot\s*\((.*)\)\s*$/.exec(line);
      if (plotted) {
        const args = splitArgs(plotted[1]);
        if (!args.length || args.length > 2) fail(index + 1, "plot takes a series and an optional name");
        const values = asSeries(evaluate(args[0], env, candles, index + 1), candles.length, index + 1);
        const name = args[1] ? readString(args[1], index + 1) : `Plot ${plots.length + 1}`;
        plots.push({ name, values, colors: values.map(() => COLORS[plots.length % COLORS.length]) });
        continue;
      }
      const level = /^hline\s*\((.*)\)$/.exec(line);
      if (level) {
        const value = evaluate(level[1], env, candles, index + 1);
        if (typeof value !== "number") fail(index + 1, "hline needs a number");
        levels.push(value);
        continue;
      }
      fail(index + 1, "Use overlay, name = expression, plot(...) or hline(...)");
    }
    if (!plots.length) return { ...empty, overlay, error: "Add a plot(...) line" };
    return { plots, levels, overlay, error: null };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Script could not run" };
  }
}

function fail(line: number, message: string): never {
  throw new Error(`Line ${line}: ${message}`);
}

function evaluate(input: string, env: Env, candles: Candle[], line: number): Value {
  let cursor = 0;
  const text = input.trim();
  const value = parseExpr();
  skip();
  if (cursor < text.length) fail(line, "Unexpected text");
  return value;

  function skip() { while (text[cursor] === " " || text[cursor] === "\t") cursor += 1; }
  function parseExpr(): Value { let value = parseTerm(); skip(); while (text[cursor] === "+" || text[cursor] === "-") { const op = text[cursor]; cursor += 1; value = combine(value, parseTerm(), op, line); skip(); } return value; }
  function parseTerm(): Value { let value = parseFactor(); skip(); while (text[cursor] === "*" || text[cursor] === "/") { const op = text[cursor]; cursor += 1; value = combine(value, parseFactor(), op, line); skip(); } return value; }
  function parseFactor(): Value {
    skip();
    if (text[cursor] === "(") { cursor += 1; const value = parseExpr(); skip(); if (text[cursor] !== ")") fail(line, "Missing )"); cursor += 1; return value; }
    if (text[cursor] === "-") { cursor += 1; const value = parseFactor(); return typeof value === "number" ? -value : value.map((item) => -item); }
    if (/[0-9.]/.test(text[cursor] ?? "")) {
      const start = cursor;
      while (/[0-9.]/.test(text[cursor] ?? "")) cursor += 1;
      const value = Number(text.slice(start, cursor));
      if (!Number.isFinite(value)) fail(line, "Bad number");
      return value;
    }
    const name = readName();
    if (!name) fail(line, "Expected a value");
    skip();
    if (text[cursor] !== "(") {
      if (!env.has(name)) fail(line, `Unknown name ${name}`);
      return env.get(name)!;
    }
    cursor += 1;
    const args: Value[] = [];
    skip();
    if (text[cursor] !== ")") {
      args.push(parseExpr());
      skip();
      while (text[cursor] === ",") { cursor += 1; args.push(parseExpr()); skip(); }
    }
    if (text[cursor] !== ")") fail(line, "Missing )");
    cursor += 1;
    return call(name, args, candles, line);
  }
  function readName() { const start = cursor; while (/[A-Za-z0-9_]/.test(text[cursor] ?? "")) cursor += 1; return text.slice(start, cursor); }
}

function call(name: string, args: Value[], candles: Candle[], line: number): Value {
  const series = (index: number) => asSeries(args[index], candles.length, line);
  const length = (index: number) => { const value = args[index]; if (typeof value !== "number" || value < 1) fail(line, `${name} needs a length`); return Math.floor(value); };
  if (name === "sma") return rolling(series(0), length(1), (window) => window.reduce((sum, item) => sum + item, 0) / window.length);
  if (name === "ema") return ema(series(0), length(1));
  if (name === "rsi") return rsi(series(0), length(1));
  if (name === "atr") return atr(candles, length(0));
  fail(line, `Unknown function ${name}`);
}

function asSeries(value: Value | undefined, size: number, line: number) {
  if (typeof value === "number") return Array.from({ length: size }, () => value);
  if (Array.isArray(value)) return value;
  fail(line, "Expected a series");
}

function combine(left: Value, right: Value, op: string, line: number): Value {
  const apply = (a: number, b: number) => op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : b === 0 ? Number.NaN : a / b;
  if (typeof left === "number" && typeof right === "number") return apply(left, right);
  const size = Array.isArray(left) ? left.length : Array.isArray(right) ? right.length : 0;
  return asSeries(left, size, line).map((item, index) => apply(item, asSeries(right, size, line)[index]));
}

function rolling(values: number[], length: number, reduce: (window: number[]) => number) {
  return values.map((_, index) => {
    const window = values.slice(index - length + 1, index + 1);
    return index >= length - 1 && window.every(Number.isFinite) ? reduce(window) : Number.NaN;
  });
}

function ema(values: number[], length: number) {
  const alpha = 2 / (length + 1);
  let state = Number.NaN;
  const seed: number[] = [];
  return values.map((value) => {
    if (!Number.isFinite(value)) { state = Number.NaN; seed.length = 0; return Number.NaN; }
    if (!Number.isFinite(state)) { seed.push(value); if (seed.length < length) return Number.NaN; state = seed.reduce((sum, item) => sum + item, 0) / length; }
    else state += alpha * (value - state);
    return state;
  });
}

function rsi(values: number[], length: number) {
  const change = values.map((value, index) => index ? value - values[index - 1] : Number.NaN);
  const up = ema(change.map((value) => Math.max(value, 0)), length);
  const down = ema(change.map((value) => Math.max(-value, 0)), length);
  return up.map((value, index) => !Number.isFinite(value + down[index]) ? Number.NaN : down[index] === 0 ? 100 : 100 - 100 / (1 + value / down[index]));
}

function atr(candles: Candle[], length: number) {
  const range = candles.map((bar, index) => index ? Math.max(bar.high - bar.low, Math.abs(bar.high - candles[index - 1].close), Math.abs(bar.low - candles[index - 1].close)) : bar.high - bar.low);
  return ema(range, length);
}

function zip(left: number[], right: number[], map: (a: number, b: number) => number) {
  return left.map((value, index) => map(value, right[index]));
}

function splitArgs(input: string) {
  const args: string[] = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') quote = !quote;
    if (quote) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { args.push(input.slice(start, index).trim()); start = index + 1; }
  }
  const last = input.slice(start).trim();
  if (last) args.push(last);
  return args;
}

function readString(input: string, line: number) {
  const match = /^"([^"]*)"$/.exec(input.trim());
  if (!match) fail(line, "Plot name must be in quotes");
  return match[1] || "Plot";
}
