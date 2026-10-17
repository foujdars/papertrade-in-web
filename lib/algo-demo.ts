import type { AlgoCandle, AlgoStrategy } from "./algo-types.ts";

export const ALGO_DEMO_STRATEGIES: AlgoStrategy[] = [
  {
    id: "demo-two-leg", name: "Demo • Intraday pair", capital: 100_000,
    entryTime: "09:30", exitTime: "15:15", entryCondition: { type: "scheduled" },
    legs: [
      { id: "demo-trend", name: "Demo trend instrument", instrumentKey: "DEMO|TREND", side: "BUY", quantity: 2, lotSize: 25, stopLossPct: 1.5, targetPct: 2.5 },
      { id: "demo-hedge", name: "Demo hedge instrument", instrumentKey: "DEMO|HEDGE", side: "SELL", quantity: 1, lotSize: 25, stopLossPct: 1.5, targetPct: 2.5 },
    ],
    maxLoss: 1000, profitTarget: 1500, feePerOrder: 20, slippageBps: 5,
  },
  {
    id: "demo-ema", name: "Demo • EMA crossover", capital: 100_000,
    entryTime: "09:30", exitTime: "15:15",
    entryCondition: { type: "ema_cross", fastPeriod: 5, slowPeriod: 20, direction: "bullish", signalInstrumentKey: "DEMO|TREND" },
    legs: [{ id: "demo-ema-trend", name: "Demo trend instrument", instrumentKey: "DEMO|TREND", side: "BUY", quantity: 2, lotSize: 25, stopLossPct: 1, targetPct: 2 }],
    maxLoss: 1000, profitTarget: 1500, feePerOrder: 20, slippageBps: 5,
  },
];

/** Fixed, explicitly synthetic examples. Never called by historical-data loaders. */
export function createAlgoDemo(): { strategy: AlgoStrategy; candles: Record<string, AlgoCandle[]> } {
  const candles: Record<string, AlgoCandle[]> = { "DEMO|TREND": [], "DEMO|HEDGE": [] };
  const firstOpen = Date.parse("2026-10-12T09:15:00+05:30") / 1000;
  const round = (value: number) => Math.round(value * 100) / 100;
  for (let day = 0; day < 5; day++) {
    for (const [key, base, amplitude, drift] of [
      ["DEMO|TREND", 500 + day * 3, 7, day % 2 ? -0.016 : 0.022],
      ["DEMO|HEDGE", 220 + day * 1.2, 3.4, day % 2 ? 0.006 : -0.009],
    ] as const) {
      let previous = base;
      for (let minute = 0; minute < 375; minute++) {
        const open = previous;
        const close = round(base + Math.sin((minute + day * 13) / 27) * amplitude + Math.sin(minute / 7) * amplitude * 0.12 + minute * drift);
        const spread = 0.14 + (minute % 7) * 0.025;
        candles[key].push({ time: firstOpen + day * 86_400 + minute * 60, open, high: round(Math.max(open, close) + spread), low: round(Math.min(open, close) - spread), close, volume: 1000 + ((minute * 137 + day * 71) % 4000) });
        previous = close;
      }
    }
  }
  return { strategy: structuredClone(ALGO_DEMO_STRATEGIES[0]), candles };
}
