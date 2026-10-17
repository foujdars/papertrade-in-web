/** Prices are INR, times are UNIX seconds, and configured session times are IST. */
export type AlgoCandle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
export type AlgoLeg = {
  id: string;
  name: string;
  /** An exact broker instrument key. Options must identify a specific expiry and strike. */
  instrumentKey: string;
  side: "BUY" | "SELL";
  /** Number of whole lots; one equity unit is a lot of size 1. */
  quantity: number;
  lotSize: number;
  stopLossPct: number | null;
  targetPct: number | null;
};
export type AlgoEntryCondition = { type: "scheduled" } | {
  type: "ema_cross";
  fastPeriod: number;
  slowPeriod: number;
  direction: "bullish" | "bearish";
  signalInstrumentKey: string;
};
export type AlgoStrategy = {
  id: string;
  name: string;
  capital: number;
  entryTime: string;
  exitTime: string;
  entryCondition: AlgoEntryCondition;
  legs: AlgoLeg[];
  maxLoss: number | null;
  profitTarget: number | null;
  feePerOrder: number;
  slippageBps: number;
};
export type AlgoExitReason = "stop_loss" | "target" | "basket_stop" | "basket_target" | "session_exit" | "data_end";
export type AlgoTrade = {
  id: string;
  sessionDate: string;
  legId: string;
  instrumentKey: string;
  name: string;
  side: "BUY" | "SELL";
  units: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  exitReason: AlgoExitReason;
};
export type AlgoEquityPoint = { time: number; equity: number; drawdown: number; drawdownPct: number };
export type AlgoBacktestResult = {
  trades: AlgoTrade[];
  equity: AlgoEquityPoint[];
  summary: {
    netPnl: number;
    grossPnl: number;
    totalFees: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    finalEquity: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
  };
  warnings: string[];
  dataMode: "historical" | "demo";
  assumptions: string[];
};
export type AlgoBacktestOptions = {
  dataMode?: "historical" | "demo";
  /** Start-time OHLC bars; this duration controls when a signal bar is complete. */
  barIntervalSeconds?: number;
};
