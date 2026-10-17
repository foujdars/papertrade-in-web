export type AppliedPineScript = { source: string; inputs: Record<string, number | boolean | string>; name: string };
export type SavedPineScript = AppliedPineScript & { id: string; updatedAt: number };
export const PINE_STORAGE_KEY = 'papertrade-pine-workspace-v1';
const ACTIVE_KEY = 'papertrade-pine-active-v1';
const ADVANCED_ACTIVE_KEY = 'papertrade-pine-active-v2';
export const PINE_TEMPLATES = [
  { name: 'EMA crossover', source: `//@version=6
indicator("EMA crossover", overlay=true)
fastLength = input.int(9, "Fast length", minval=1, maxval=500)
slowLength = input.int(21, "Slow length", minval=1, maxval=500)
src = input.source(close, "Source")
fast = ta.ema(src, fastLength)
slow = ta.ema(src, slowLength)
plot(fast, title="Fast EMA", color=color.teal)
plot(slow, title="Slow EMA", color=color.orange)
alertcondition(ta.crossover(fast, slow), title="Bullish crossover", message="Fast EMA crossed above slow EMA")
alertcondition(ta.crossunder(fast, slow), title="Bearish crossover", message="Fast EMA crossed below slow EMA")` },
  { name: 'RSI oscillator', source: `//@version=6
indicator("RSI oscillator", overlay=false)
length = input.int(14, "Length", minval=2, maxval=500)
upper = input.float(70, "Upper level", minval=0, maxval=100)
lower = input.float(30, "Lower level", minval=0, maxval=100)
r = ta.rsi(close, length)
plot(r, title="RSI", color=color.purple)
hline(upper)
hline(lower)
alertcondition(ta.crossover(r, lower), title="RSI recovery", message="RSI crossed above the lower level")` },
  { name: 'Volatility bands', source: `//@version=6
indicator("Volatility bands", overlay=true)
length = input.int(20, "Length", minval=2, maxval=500)
multiple = input.float(2.0, "Deviation", minval=0.1, maxval=10, step=0.1)
basis = ta.sma(close, length)
width = ta.stdev(close, length) * multiple
plot(basis, title="Basis", color=color.orange)
plot(basis + width, title="Upper", color=color.blue)
plot(basis - width, title="Lower", color=color.blue)` },
] as const;

function storage(): Storage | null { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } }
function valid(value: unknown): value is AppliedPineScript {
  if (!value || typeof value !== 'object') return false;
  const item = value as AppliedPineScript;
  return typeof item.source === 'string' && item.source.length <= 50_000 && typeof item.name === 'string' && item.name.length <= 100 && !!item.inputs && typeof item.inputs === 'object' && !Array.isArray(item.inputs) && Object.keys(item.inputs).length <= 100 && Object.values(item.inputs).every(v => typeof v === 'string' ? v.length <= 100 : typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v));
}
export function loadAppliedPineScript(advanced = false): AppliedPineScript | null {
  try {
    const target = storage();
    const stored = advanced ? target?.getItem(ADVANCED_ACTIVE_KEY) ?? target?.getItem(ACTIVE_KEY) : target?.getItem(ACTIVE_KEY);
    const value: unknown = JSON.parse(stored ?? 'null');
    return valid(value) ? value : null;
  } catch { return null; }
}
export function saveAppliedPineScript(value: AppliedPineScript | null, advanced = false): boolean {
  try {
    const target = storage();
    if (!target) return false;
    const key = advanced ? ADVANCED_ACTIVE_KEY : ACTIVE_KEY;
    if (value === null) {
      // Keep an explicit advanced tombstone so an older mobile script cannot reappear.
      if (advanced) target.setItem(key, 'null'); else target.removeItem(key);
    } else {
      if (!valid(value)) return false;
      target.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch { return false; }
}
export function loadPineScripts(): SavedPineScript[] { try { const list: unknown=JSON.parse(storage()?.getItem(PINE_STORAGE_KEY) ?? '[]'); return Array.isArray(list) ? list.filter((v):v is SavedPineScript=>valid(v)&&'id' in v&&typeof v.id==='string'&&v.id.length<=100&&'updatedAt' in v&&typeof v.updatedAt==='number'&&Number.isFinite(v.updatedAt)).slice(0,30) : []; } catch { return []; } }
export function savePineScripts(list: SavedPineScript[]): boolean { try { const target=storage(); if(!target || list.length>30 || !list.every(valid)) return false; target.setItem(PINE_STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; } }


export type PineRevision = SavedPineScript & { revisionId: string };
const REVISION_KEY = 'papertrade-pine-revisions-v1';
export function loadPineRevisions(scriptId?: string): PineRevision[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(REVISION_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PineRevision => valid(item) && 'id' in item && typeof item.id === 'string' && item.id.length <= 100 && 'updatedAt' in item && typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) && 'revisionId' in item && typeof item.revisionId === 'string' && item.revisionId.length <= 100)
      .filter(item => !scriptId || item.id === scriptId).slice(0, 120);
  } catch { return []; }
}
export function savePineRevision(script: SavedPineScript): boolean {
  try {
    const target = storage();
    if (!target || !valid(script) || typeof script.id !== 'string' || script.id.length > 100 || !Number.isFinite(script.updatedAt)) return false;
    const history = loadPineRevisions();
    const latest = history.find(item => item.id === script.id);
    if (latest && latest.source === script.source && JSON.stringify(latest.inputs) === JSON.stringify(script.inputs) && latest.name === script.name) return true;
    const revision: PineRevision = { ...script, revisionId: crypto.randomUUID() };
    const counts = new Map<string, number>();
    const next = [revision, ...history].filter(item => {
      const count = counts.get(item.id) ?? 0;
      counts.set(item.id, count + 1);
      return count < 20;
    }).slice(0, 120);
    target.setItem(REVISION_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}
export const PINE_ADVANCED_TEMPLATES = [
  { name: 'Strategy crossover', source: `//@version=5
strategy("EMA crossover strategy", overlay=true, initial_capital=100000)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
plot(fast, "Fast EMA", color=color.teal)
plot(slow, "Slow EMA", color=color.orange)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")` },
] as const;
