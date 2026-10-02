import { alertTime } from "./ipo-notification-content.ts";
import { shadeChoice, type PushNotice } from "./notification-policy.ts";

export const EMA21_DEFAULT_MARKETS = [
  { symbol: "BTCUSD", label: "BTC" },
  { symbol: "ETHUSD", label: "ETH" },
  { symbol: "XAUTUSD", label: "Gold" },
] as const;

export type Ema21DefaultFrame = "5m" | "15m";
export type Ema21DefaultSide = "bullish" | "bearish";

/** The chart arrow is the candle that breaks the opposite-colour candle after an EMA 21 cross. */
export function ema21AlertTitle(label: string, frame: string, side: Ema21DefaultSide) {
  return shadeChoice(side === "bullish" ? "📈" : "📉", [
    `${label} ${frame} EMA 21 ${side}`,
    `${label} ${frame} EMA 21 entry`,
  ]);
}

export function ema21AlertId(symbol: string, frame: string, side: Ema21DefaultSide, candleTime: number) {
  return `ema21-${symbol}-${frame}-${side}-${candleTime}`;
}

export function ema21AlertNotice(input: {
  symbol: string;
  label: string;
  frame: Ema21DefaultFrame;
  side: Ema21DefaultSide;
  candleTime: number;
  now: number;
}): PushNotice {
  return {
    id: ema21AlertId(input.symbol, input.frame, input.side, input.candleTime),
    kind: "session",
    title: ema21AlertTitle(input.label, input.frame, input.side),
    body: `${input.symbol}, ${input.frame} chart: ${input.side === "bullish" ? "price broke the red candle high" : "price broke the green candle low"} after an EMA 21 cross. Signal observed ${alertTime(input.now)}. Open the chart to review the setup.`,
    url: `/?symbol=${encodeURIComponent(input.symbol)}&timeframe=${input.frame}`,
    silent: false,
    expiresAt: input.now + 20 * 60 * 1000,
  };
}
