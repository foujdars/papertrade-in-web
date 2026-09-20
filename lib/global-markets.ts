import type { Candle } from "./market";
import type { Instrument } from "./market";

export const GLOBAL_SYMBOLS = ["BTCUSD", "XAUTUSD", "BRENT"] as const;
export type GlobalSymbol = (typeof GLOBAL_SYMBOLS)[number];
export type PerpSymbol = Exclude<GlobalSymbol, "BRENT">;
export const GLOBAL_INSTRUMENTS = [
  {
    symbol: "BTCUSD",
    name: "Bitcoin",
    subtitle: "Delta India · perpetual",
    categories: ["Crypto"],
    price: 0,
    changePercent: 0,
  },
  {
    symbol: "XAUTUSD",
    name: "Gold · Tether Gold",
    subtitle: "Delta India · tokenised gold perpetual",
    categories: ["Gold"],
    price: 0,
    changePercent: 0,
  },
  {
    symbol: "BRENT",
    name: "Brent crude oil",
    subtitle: "TVC Brent CFD reference · watch only",
    categories: ["Energy"],
    price: 0,
    changePercent: 0,
  },
] as const;
export const isGlobalSymbol = (value: string): value is GlobalSymbol =>
  (GLOBAL_SYMBOLS as readonly string[]).includes(value);
export const GLOBAL_CHART_INSTRUMENTS: Instrument[] = [
  {
    symbol: "BTCUSD",
    name: "Bitcoin perpetual",
    exchange: "DELTA",
    price: 0,
    change: 0,
    instrumentKey: "DELTA|BTCUSD",
    categories: ["GLOBAL", "CRYPTO"],
    assetType: "FUTURE",
    lotSize: 1,
    underlyingSymbol: "BTC",
  },
  {
    symbol: "XAUTUSD",
    name: "Gold perpetual",
    exchange: "DELTA",
    price: 0,
    change: 0,
    instrumentKey: "DELTA|XAUTUSD",
    categories: ["GLOBAL", "GOLD"],
    assetType: "FUTURE",
    lotSize: 1,
    underlyingSymbol: "XAUT",
  },
  {
    symbol: "BRENT",
    name: "Brent crude oil",
    exchange: "TVC",
    price: 0,
    change: 0,
    instrumentKey: "TVC|UKOIL",
    categories: ["GLOBAL", "ENERGY"],
    assetType: "INDEX",
  },
];
export const deltaSymbolFromInstrumentKey = (
  value?: string,
): PerpSymbol | null => {
  const symbol = value?.startsWith("DELTA|") ? value.slice(6) : "";
  return symbol === "BTCUSD" || symbol === "XAUTUSD" ? symbol : null;
};
export const isGlobalInstrumentKey = (value?: string) =>
  Boolean(value?.startsWith("DELTA|") || value?.startsWith("TVC|"));
export const USD_INR = 85;
export const PERP_SEED_INR = 100000;
export type PerpSpec = {
  symbol: PerpSymbol;
  lot: number;
  tick: number;
  initial: number;
  maintenance: number;
  initialScale: number;
  maintenanceScale: number;
  scalingThreshold: number;
  maxNotional: number;
  maker: number;
  taker: number;
  liquidation: number;
  fundingSeconds: number;
  operational: boolean;
  fetchedAt: number;
};
export type PerpQuote = {
  symbol: PerpSymbol;
  last: number;
  mark: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  funding: number;
  change: number;
  at: number;
  operational: boolean;
};
const positive = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;
export function normalizePerpSpec(
  raw: Record<string, any>,
  symbol: PerpSymbol,
  now: number,
): PerpSpec {
  if (
    raw.symbol !== symbol ||
    raw.contract_type !== "perpetual_futures" ||
    raw.is_quanto ||
    raw.notional_type !== "vanilla" ||
    raw.quoting_asset?.symbol !== "USD"
  )
    throw new Error("Unexpected Delta contract. Trading disabled.");
  const spec: PerpSpec = {
    symbol,
    lot: Number(raw.contract_value),
    tick: Number(raw.tick_size),
    initial: Number(raw.initial_margin) / 100,
    maintenance: Number(raw.maintenance_margin) / 100,
    initialScale: Number(raw.initial_margin_scaling_factor) / 100,
    maintenanceScale: Number(raw.maintenance_margin_scaling_factor) / 100,
    scalingThreshold: Number(raw.max_leverage_notional),
    maxNotional: Number(raw.position_notional_limit),
    maker: Number(raw.maker_commission_rate),
    taker: Number(raw.taker_commission_rate),
    liquidation: Number(raw.product_specs?.isolated_liq_penalty_factor),
    fundingSeconds: Number(raw.product_specs?.rate_exchange_interval),
    operational:
      raw.state === "live" &&
      raw.trading_status === "operational" &&
      !raw.product_specs?.only_reduce_only_orders_allowed,
    fetchedAt: now,
  };
  if (
    ![
      spec.lot,
      spec.tick,
      spec.initial,
      spec.maintenance,
      spec.scalingThreshold,
      spec.maxNotional,
      spec.fundingSeconds,
    ].every(positive) ||
    ![
      spec.maker,
      spec.taker,
      spec.liquidation,
      spec.initialScale,
      spec.maintenanceScale,
    ].every((n) => Number.isFinite(n) && n >= 0) ||
    spec.maintenance >= spec.initial ||
    spec.initial > 1 ||
    !Number.isInteger(spec.fundingSeconds)
  )
    throw new Error("Incomplete contract rules. Trading disabled.");
  return spec;
}
export function normalizePerpQuote(
  raw: Record<string, any>,
  symbol: PerpSymbol,
): PerpQuote {
  const quote: PerpQuote = {
    symbol,
    last: Number(raw.close),
    mark: Number(raw.mark_price),
    bid: Number(raw.quotes?.best_bid),
    ask: Number(raw.quotes?.best_ask),
    bidSize: Number(raw.quotes?.bid_size),
    askSize: Number(raw.quotes?.ask_size),
    funding: Number(raw.funding_rate) / 100,
    change: Number(raw.ltp_change_24h),
    at: Number(raw.timestamp) / 1000,
    operational: raw.product_trading_status === "operational",
  };
  if (
    raw.symbol !== symbol ||
    ![quote.last, quote.mark, quote.bid, quote.ask, quote.at].every(positive) ||
    ![quote.bidSize, quote.askSize].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    quote.bid > quote.ask ||
    !Number.isFinite(quote.funding)
  )
    throw new Error("Delta quote unavailable.");
  return quote;
}
export function normalizeGlobalCandles(rows: any[]): Candle[] {
  const unique = new Map<number, Candle>();
  for (const row of rows) {
    const c = {
      time: Number(row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    };
    if (
      [c.time, c.open, c.high, c.low, c.close].every(positive) &&
      Number.isFinite(c.volume) &&
      c.volume >= 0 &&
      c.high >= Math.max(c.open, c.close, c.low) &&
      c.low <= Math.min(c.open, c.close)
    )
      unique.set(c.time, c);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export const freshPerpQuote = (
  q: PerpQuote | undefined,
  now: number,
): q is PerpQuote =>
  !!q &&
  [q.last, q.mark, q.bid, q.ask].every(positive) &&
  [q.bidSize, q.askSize].every((n) => Number.isFinite(n) && n >= 0) &&
  Number.isFinite(q.funding) &&
  q.bid <= q.ask &&
  q.at <= now + 5000 &&
  now - q.at <= 30000 &&
  q.operational;
export function marginRate(
  spec: PerpSpec,
  notional: number,
  maintenance = false,
) {
  return (
    (maintenance ? spec.maintenance : spec.initial) +
    Math.max(0, notional - spec.scalingThreshold) *
      (maintenance ? spec.maintenanceScale : spec.initialScale)
  );
}
export const tradingFee = (spec: PerpSpec, notional: number, maker = false) =>
  notional * (maker ? spec.maker : spec.taker) * 1.18 * USD_INR;

export type PerpPosition = {
  symbol: PerpSymbol;
  side: "BUY" | "SELL";
  contracts: number;
  entry: number;
  margin: number;
  leverage: number;
  openedAt: number;
  stop?: number;
  target?: number;
  nextFunding: number;
  spec: PerpSpec;
};
export type PerpOrder = {
  id: string;
  symbol: PerpSymbol;
  side: "BUY" | "SELL";
  contracts: number;
  leverage: number;
  limit: number;
  stop?: number;
  target?: number;
  at: number;
  reserve: number;
};
export type PerpEvent = {
  id: string;
  symbol: PerpSymbol;
  at: number;
  kind: "OPEN" | "CLOSE" | "LIQUIDATION" | "FUNDING" | "CANCEL";
  contracts: number;
  price: number;
  pnl: number;
  fee: number;
  detail: string;
};
export type PerpAccount = {
  version: 1;
  wallet: number;
  positions: PerpPosition[];
  orders: PerpOrder[];
  events: PerpEvent[];
  lastChecked: number;
  revision: number;
  fundingGap: boolean;
};
export const newPerpAccount = (): PerpAccount => ({
  version: 1,
  wallet: PERP_SEED_INR,
  positions: [],
  orders: [],
  events: [],
  lastChecked: 0,
  revision: 0,
  fundingGap: false,
});
export function readPerpAccount(text: string | null): PerpAccount {
  if (!text) return newPerpAccount();
  const a = JSON.parse(text) as PerpAccount;
  if (
    a?.version !== 1 ||
    !Number.isFinite(a.wallet) ||
    a.wallet < 0 ||
    !Number.isSafeInteger(a.revision) ||
    !Array.isArray(a.positions) ||
    !Array.isArray(a.orders) ||
    !Array.isArray(a.events) ||
    a.positions.length > 2 ||
    a.orders.length > 20
  )
    throw new Error(
      "Practice wallet data could not be read. It has not been reset.",
    );
  for (const p of a.positions)
    if (
      !["BTCUSD", "XAUTUSD"].includes(p.symbol) ||
      !["BUY", "SELL"].includes(p.side) ||
      !Number.isSafeInteger(p.contracts) ||
      p.contracts <= 0 ||
      ![
        p.entry,
        p.leverage,
        p.nextFunding,
        p.openedAt,
        p.spec?.lot,
        p.spec?.tick,
        p.spec?.maintenance,
        p.spec?.initial,
        p.spec?.fundingSeconds,
        p.spec?.maxNotional,
      ].every(positive) ||
      !Number.isFinite(p.margin) ||
      p.margin < 0 ||
      p.spec.symbol !== p.symbol ||
      ![
        p.spec.maker,
        p.spec.taker,
        p.spec.liquidation,
        p.spec.scalingThreshold,
        p.spec.maintenanceScale,
        p.spec.initialScale,
      ].every((v) => Number.isFinite(v) && v >= 0) ||
      [p.stop, p.target].some((v) => v !== undefined && !positive(v))
    )
      throw new Error("Practice position data is invalid.");
  for (const o of a.orders)
    if (
      !["BTCUSD", "XAUTUSD"].includes(o.symbol) ||
      !["BUY", "SELL"].includes(o.side) ||
      !Number.isSafeInteger(o.contracts) ||
      o.contracts <= 0 ||
      ![o.limit, o.leverage, o.reserve].every(positive)
    )
      throw new Error("Practice order data is invalid.");
  if (
    new Set(a.positions.map((p) => p.symbol)).size !== a.positions.length ||
    new Set(a.orders.map((o) => o.id)).size !== a.orders.length ||
    typeof a.fundingGap !== "boolean" ||
    !Number.isFinite(a.lastChecked) ||
    a.lastChecked < 0 ||
    a.revision < 0
  )
    throw new Error("Practice wallet records are inconsistent.");
  if (
    a.events.some(
      (e) =>
        !e ||
        typeof e.id !== "string" ||
        !["BTCUSD", "XAUTUSD"].includes(e.symbol) ||
        !["OPEN", "CLOSE", "LIQUIDATION", "FUNDING", "CANCEL"].includes(
          e.kind,
        ) ||
        ![e.at, e.price, e.contracts].every(positive) ||
        ![e.pnl, e.fee].every(Number.isFinite) ||
        e.fee < 0,
    )
  )
    throw new Error("Practice history data is invalid.");
  if (availablePerpCash(a) < -0.000001)
    throw new Error(
      "Practice reservations exceed the wallet. No data was reset.",
    );
  return a;
}
export const availablePerpCash = (a: PerpAccount) =>
  a.wallet -
  a.positions.reduce((n, p) => n + p.margin, 0) -
  a.orders.reduce((n, o) => n + o.reserve, 0);
export const positionPnl = (p: PerpPosition, price: number) =>
  (price - p.entry) *
  p.contracts *
  p.spec.lot *
  (p.side === "BUY" ? 1 : -1) *
  USD_INR;
export function liquidationPrice(p: PerpPosition): number {
  const equity = (price: number) =>
    p.margin +
    positionPnl(p, price) -
    price *
      p.contracts *
      p.spec.lot *
      marginRate(p.spec, price * p.contracts * p.spec.lot, true) *
      USD_INR;
  let lo = 0,
    hi = p.entry * 2;
  if (p.side === "SELL") for (let i = 0; i < 20 && equity(hi) > 0; i++) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (equity(mid) > 0 === (p.side === "BUY")) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
const copy = (a: PerpAccount): PerpAccount => ({
  ...a,
  positions: a.positions.map((p) => ({ ...p })),
  orders: a.orders.map((o) => ({ ...o })),
  events: [...a.events],
  revision: a.revision + 1,
});
const event = (a: PerpAccount, e: Omit<PerpEvent, "id">) => {
  a.events.push({ ...e, id: `${e.at}:${a.revision}:${a.events.length}` });
};
function validateTrade(
  a: PerpAccount,
  s: PerpSpec,
  q: PerpQuote,
  side: "BUY" | "SELL",
  contracts: number,
  leverage: number,
  price: number,
  now: number,
  stop?: number,
  target?: number,
) {
  if (
    !freshPerpQuote(q, now) ||
    q.symbol !== s.symbol ||
    now - s.fetchedAt > 3600000 ||
    s.fetchedAt > now + 5000 ||
    !s.operational
  )
    throw new Error("A fresh quote and operational contract are required.");
  if (!Number.isSafeInteger(contracts) || contracts < 1)
    throw new Error("Enter a whole number of contracts, at least 1.");
  if (!Number.isFinite(leverage) || leverage < 1)
    throw new Error("Invalid leverage.");
  if (!positive(price)) throw new Error("Invalid order price.");
  const p = a.positions.find((p) => p.symbol === s.symbol);
  if (p && p.side !== side)
    throw new Error(
      "Close the existing position before opening the opposite direction.",
    );
  const notional = ((p?.contracts ?? 0) + contracts) * s.lot * price;
  if (notional > s.maxNotional)
    throw new Error("This position exceeds Delta’s current notional limit.");
  if (1 / leverage + 1e-12 < marginRate(s, notional))
    throw new Error(
      `Position size limits leverage to ${(1 / marginRate(s, notional)).toFixed(1)}×.`,
    );
  for (const [name, value] of [
    ["Stop-loss", stop],
    ["Take-profit", target],
  ] as const)
    if (
      value !== undefined &&
      (!positive(value) ||
        Math.abs(value / s.tick - Math.round(value / s.tick)) > 1e-6)
    )
      throw new Error(`${name} must use a ${s.tick} USD price increment.`);
  if (stop !== undefined && (side === "BUY" ? stop >= price : stop <= price))
    throw new Error("Stop-loss must be on the losing side of entry.");
  if (
    target !== undefined &&
    (side === "BUY" ? target <= price : target >= price)
  )
    throw new Error("Take-profit must be on the winning side of entry.");
  if (a.fundingGap)
    throw new Error(
      "An unmonitored funding interval needs review before increasing exposure.",
    );
}
export function openPerp(
  a: PerpAccount,
  s: PerpSpec,
  q: PerpQuote,
  side: "BUY" | "SELL",
  contracts: number,
  leverage: number,
  now: number,
  stop?: number,
  target?: number,
  limit?: number,
): PerpAccount {
  const price = limit ?? (side === "BUY" ? q.ask : q.bid);
  validateTrade(a, s, q, side, contracts, leverage, price, now, stop, target);
  if (
    limit !== undefined &&
    Math.abs(limit / s.tick - Math.round(limit / s.tick)) > 1e-6
  )
    throw new Error(`Limit price must use a ${s.tick} USD increment.`);
  const prior = a.positions.find((p) => p.symbol === s.symbol),
    newNotional = contracts * s.lot * price;
  const required = Math.max(
    (newNotional / leverage) * USD_INR,
    ((newNotional + (prior?.contracts ?? 0) * s.lot * price) / leverage) *
      USD_INR -
      (prior?.margin ?? 0),
  );
  const fee = tradingFee(s, newNotional);
  if (required + fee > availablePerpCash(a) + 1e-8)
    throw new Error("Insufficient available practice funds.");
  const n = copy(a);
  if (limit !== undefined) {
    if (n.orders.length >= 20) throw new Error("Maximum 20 pending orders.");
    n.orders.push({
      id: `${now}:${n.revision}`,
      symbol: s.symbol,
      side,
      contracts,
      leverage,
      limit,
      stop,
      target,
      at: now,
      reserve: required + fee,
    });
    return n;
  }
  if (contracts > (side === "BUY" ? q.askSize : q.bidSize))
    throw new Error(
      "Order exceeds visible top-of-book liquidity. Reduce the size.",
    );
  n.wallet -= fee;
  const p = n.positions.find((p) => p.symbol === s.symbol);
  if (p) {
    p.entry =
      (p.entry * p.contracts + price * contracts) / (p.contracts + contracts);
    p.contracts += contracts;
    p.margin += required;
    p.leverage = leverage;
    p.spec = s;
    if (stop !== undefined) p.stop = stop;
    if (target !== undefined) p.target = target;
  } else
    n.positions.push({
      symbol: s.symbol,
      side,
      contracts,
      entry: price,
      margin: required,
      leverage,
      openedAt: now,
      stop,
      target,
      nextFunding:
        (Math.floor(now / (s.fundingSeconds * 1000)) + 1) *
        s.fundingSeconds *
        1000,
      spec: s,
    });
  event(n, {
    symbol: s.symbol,
    at: now,
    kind: "OPEN",
    contracts,
    price,
    pnl: 0,
    fee,
    detail: `${side === "BUY" ? "Long" : "Short"} · taker · isolated`,
  });
  return n;
}
export function closePerp(
  a: PerpAccount,
  symbol: PerpSymbol,
  q: PerpQuote,
  contracts: number,
  now: number,
  kind: "CLOSE" | "LIQUIDATION" = "CLOSE",
  detail = "Manual reduce-only close",
): PerpAccount {
  const p = a.positions.find((p) => p.symbol === symbol);
  if (!p) throw new Error("No position to close.");
  if (q.symbol !== symbol || !freshPerpQuote(q, now))
    throw new Error("Fresh market data is required to close.");
  if (
    !Number.isSafeInteger(contracts) ||
    contracts <= 0 ||
    contracts > p.contracts
  )
    throw new Error("Close quantity must not exceed the open position.");
  if (
    kind !== "LIQUIDATION" &&
    contracts > (p.side === "BUY" ? q.bidSize : q.askSize)
  )
    throw new Error(
      "Close exceeds visible liquidity. Use a smaller partial close.",
    );
  const n = copy(a),
    price = p.side === "BUY" ? q.bid : q.ask,
    share = contracts / p.contracts;
  const fee =
    tradingFee(p.spec, price * contracts * p.spec.lot) +
    (kind === "LIQUIDATION"
      ? price * contracts * p.spec.lot * p.spec.liquidation * 1.18 * USD_INR
      : 0);
  const raw = positionPnl(p, price) * share,
    net = Math.max(-p.margin * share, raw - fee);
  n.wallet = Math.max(0, n.wallet + net);
  const remaining = n.positions.find((v) => v.symbol === symbol)!;
  remaining.contracts -= contracts;
  remaining.margin *= 1 - share;
  n.positions = n.positions.filter((v) => v.contracts > 0);
  n.orders = n.orders.filter((o) => o.symbol !== symbol);
  if (a.fundingGap) detail += " · missed funding excluded";
  if (!n.positions.length) n.fundingGap = false;
  event(n, {
    symbol,
    at: now,
    kind,
    contracts,
    price,
    pnl: net + fee,
    fee,
    detail:
      net !== raw - fee
        ? `${detail} · loss capped at isolated margin (simulation)`
        : detail,
  });
  return n;
}
export function cancelPerpOrder(
  a: PerpAccount,
  id: string,
  now: number,
): PerpAccount {
  const o = a.orders.find((o) => o.id === id);
  if (!o) return a;
  const n = copy(a);
  n.orders = n.orders.filter((v) => v.id !== id);
  event(n, {
    symbol: o.symbol,
    at: now,
    kind: "CANCEL",
    contracts: o.contracts,
    price: o.limit,
    pnl: 0,
    fee: 0,
    detail: "Pending order cancelled",
  });
  return n;
}
/** Foreground observations only: never invent missed fills or funding on reopening. */
export function advancePerps(
  a: PerpAccount,
  quotes: Partial<Record<PerpSymbol, PerpQuote>>,
  specs: Partial<Record<PerpSymbol, PerpSpec>>,
  now: number,
): PerpAccount {
  let n = a;
  for (const p of [...n.positions]) {
    const q = quotes[p.symbol];
    if (!freshPerpQuote(q, now)) continue;
    if (q.at < p.openedAt) continue;
    const continuous = a.lastChecked > 0 && now - a.lastChecked < 30000;
    if (p.nextFunding <= now) {
      if (!continuous || now - p.nextFunding > 30000) {
        if (!n.fundingGap) n = { ...copy(n), fundingGap: true };
      } else if (!n.fundingGap) {
        n = copy(n);
        const current = n.positions.find((v) => v.symbol === p.symbol)!;
        const amount =
          -q.funding *
          q.mark *
          p.contracts *
          p.spec.lot *
          (p.side === "BUY" ? 1 : -1) *
          USD_INR;
        const applied = Math.max(-current.margin, amount);
        n.wallet += applied;
        current.margin += applied;
        current.nextFunding += p.spec.fundingSeconds * 1000;
        event(n, {
          symbol: p.symbol,
          at: now,
          kind: "FUNDING",
          contracts: p.contracts,
          price: q.mark,
          pnl: applied,
          fee: 0,
          detail: "Estimated funding · observed rate at boundary",
        });
      }
    }
    const current = n.positions.find((v) => v.symbol === p.symbol)!;
    const mm =
      q.mark *
      p.contracts *
      p.spec.lot *
      marginRate(p.spec, q.mark * p.contracts * p.spec.lot, true) *
      USD_INR;
    if (current.margin + positionPnl(current, q.mark) <= mm)
      n = closePerp(
        n,
        p.symbol,
        q,
        p.contracts,
        now,
        "LIQUIDATION",
        "Mark-price liquidation · observed quote",
      );
    else if (
      (p.stop !== undefined &&
        (p.side === "BUY" ? q.mark <= p.stop : q.mark >= p.stop)) ||
      (p.target !== undefined &&
        (p.side === "BUY" ? q.mark >= p.target : q.mark <= p.target))
    ) {
      if (p.contracts <= (p.side === "BUY" ? q.bidSize : q.askSize))
        n = closePerp(
          n,
          p.symbol,
          q,
          p.contracts,
          now,
          "CLOSE",
          "Mark-price TP/SL · observed bid/ask",
        );
    }
  }
  if (!n.fundingGap)
    for (const o of [...n.orders]) {
      const q = quotes[o.symbol],
        s = specs[o.symbol];
      if (!s || !freshPerpQuote(q, now) || q.at <= o.at) continue;
      // A marketable quote, not candle contact, is required. Charge conservative taker fees.
      if (o.side === "BUY" ? q.ask > o.limit : q.bid < o.limit) continue;
      try {
        const without = { ...n, orders: n.orders.filter((v) => v.id !== o.id) };
        n = openPerp(
          without,
          s,
          q,
          o.side,
          o.contracts,
          o.leverage,
          now,
          o.stop,
          o.target,
        );
      } catch {
        /* Keep reserved order pending if liquidity or margin is insufficient. */
      }
    }
  return { ...n, lastChecked: now };
}
