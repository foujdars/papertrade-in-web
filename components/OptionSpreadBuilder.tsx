"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MCX_SPREAD_PRODUCTS } from "@/lib/mcx-spread-chain";
import { loadSpreadChain, loadSpreadSeries, loadSpreadUnderlyings, loadTokenOptionRoots, type SpreadMarket } from "@/lib/spread-chain-client";
import { calculateSpread, initialStrikes, SPREADS, type PremiumSource, type SpreadChain, type SpreadContract, type SpreadId } from "@/lib/vertical-spread";

const marketLabels = { india: "Indian F&O", crypto: "Crypto", metals: "Gold & Silver", tokens: "Delta Tokens" };
const sources = { india: "NSE via Upstox", crypto: "Delta Exchange India", metals: "MCX via Upstox", tokens: "Delta Exchange India" };
const crypto = [{ id: "BTC", label: "BTC · Bitcoin" }, { id: "ETH", label: "ETH · Ethereum" }];
const metals = Object.entries(MCX_SPREAD_PRODUCTS).map(([id, product]) => ({ id, label: `${id} · ${product.label}` }));
const optionNames = { CE: "call", PE: "put" };
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

function useResource<T>(key: string, refresh: number, loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; refresh: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, refresh, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({
        key, refresh, data: previous?.key === key ? previous.data : undefined,
        error: error instanceof Error ? error.message : "The option feed is unavailable.",
      }));
    });
    return () => controller.abort();
  }, [key, refresh, loader]);
  const current = state?.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(key && current?.refresh !== refresh) };
}

export function OptionSpreadBuilder({ initialMarket, initialRoot, initialExpiry, initialStrike, initialKind, embedded = false }: {
  initialMarket: SpreadMarket;
  initialRoot: string;
  initialExpiry: string;
  initialStrike?: number;
  initialKind?: "CE" | "PE";
  embedded?: boolean;
}) {
  const [market, setMarket] = useState<SpreadMarket>(initialMarket);
  const [requestedRoot, setRoot] = useState(initialRoot);
  const [seriesReload, retrySeries] = useState(0);
  const [chainReload, reloadChain] = useState(0);
  const [requestedSeries, setSeries] = useState(initialExpiry);
  const india = useResource(market === "india" ? "india" : "", seriesReload, loadSpreadUnderlyings);
  const tokens = useResource(market === "tokens" ? "tokens" : "", seriesReload, loadTokenOptionRoots);
  const choices = market === "india" ? (india.data ?? []).map(item => ({ id: item.instrumentKey, label: `${item.symbol} · ${item.name}` }))
    : market === "tokens" ? (tokens.data ?? []).map(id => ({ id, label: id === "XAUT" ? "XAUT · Tether Gold" : id }))
    : market === "crypto" ? crypto : metals;
  const root = choices.find(item => item.id === requestedRoot)?.id
    ?? choices.find(item => item.id === "NSE_INDEX|Nifty 50")?.id ?? choices[0]?.id ?? "";
  const underlying = india.data?.find(item => item.instrumentKey === root);
  const loadSeries = useMemo(() => (signal: AbortSignal) => loadSpreadSeries(market, root, underlying, signal), [market, root, underlying]);
  const marketKey = root ? `${market}:${root}` : "";
  const series = useResource(marketKey, seriesReload, loadSeries);
  const expiry = series.data?.find(item => item.id === requestedSeries) ?? series.data?.[0];
  const loadChain = useMemo(() => (signal: AbortSignal) => loadSpreadChain(market, root, underlying, expiry?.id ?? "", signal),
    [market, root, underlying, expiry?.id]);
  const chainKey = expiry ? `${marketKey}:${expiry.id}` : "";
  const chain = useResource(chainKey, chainReload, loadChain);
  const isDelta = market === "crypto" || market === "tokens";
  const currency = isDelta ? "USD" : "INR";
  const metal = market === "metals" ? MCX_SPREAD_PRODUCTS[root as keyof typeof MCX_SPREAD_PRODUCTS] : undefined;
  const error = india.error ?? tokens.error ?? series.error ?? chain.error;
  const loading = india.loading || tokens.loading || series.loading || chain.loading;

  const seeded = market === initialMarket && root === initialRoot && expiry?.id === initialExpiry;
  return <div className={`spread-builder${embedded ? " spread-builder-embedded" : ""}`}>
    <header className="spread-top">
      {!embedded && <div><Link className="spread-back" href="/">← PaperTrade IN</Link>
        <h1>Option Strategy Builder</h1></div>}
      <div className="spread-market" role="group" aria-label="Market">
        {(Object.keys(marketLabels) as SpreadMarket[]).map(value => <button type="button" key={value} aria-pressed={market === value}
          onClick={() => { if (market !== value) { setMarket(value); setRoot(""); setSeries(""); } }}>{marketLabels[value]}</button>)}
      </div>
    </header>

    <section className="spread-card spread-feed" aria-label="Option chain filters">
      <label>Underlying
        <select value={root} disabled={!choices.length} onChange={event => { setRoot(event.target.value); setSeries(""); }}>
          {!choices.length && <option value="">Choose underlying</option>}
          {choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Expiry
        <select value={expiry?.id ?? ""} disabled={!expiry} onChange={event => setSeries(event.target.value)}>
          {!expiry && <option value="">{series.loading ? "Loading expiries…" : "Choose expiry"}</option>}
          {series.data?.map(item => <option key={item.id} value={item.id}>
            {dateFormat.format(Date.parse(`${item.expiry}T00:00:00Z`))}
            {isDelta ? ` · ${timeFormat.format(Date.parse(item.id))} IST` : item.detail ? ` · ${item.detail}` : ""}
          </option>)}
        </select>
      </label>
      <button type="button" onClick={() => {
        if (error || !expiry) retrySeries(value => value + 1);
        reloadChain(value => value + 1);
      }} disabled={loading}>{loading ? "Loading…" : "Refresh quotes"}</button>
      <p>{sources[market]} · {metal ? metal.unit : currency}
        {chain.data?.reference ? ` · ${market === "metals" ? "Underlying futures" : "Underlying"} ${formatter(currency).format(chain.data.reference)}` : ""}
      </p>
    </section>

    {error && !loading && <p className="spread-message" role="alert">{error}</p>}
    {chain.loading && !chain.data && <p className="spread-message" role="status">Loading option chain…</p>}
    {!loading && !error && (!expiry || !chain.data?.contracts.length) &&
      <p className="spread-message" role="status">No listed options</p>}
    {chain.data?.quoteWarning && !chain.error && <p className="spread-message" role="status">{chain.data.quoteWarning}</p>}
    {!!chain.data?.contracts.length && <SpreadWorkspace key={chainKey} chain={chain.data} currency={currency} market={market}
      initialStrike={seeded ? initialStrike : undefined} initialStrategy={seeded && initialKind === "PE" ? "bearPut" : "bullCall"} />}
  </div>;
}

function formatter(currency: "INR" | "USD") {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: currency === "USD" ? 6 : 2 });
}

type Money = ReturnType<typeof formatter>;
type Selection = { buy: string; sell: string };

function SpreadWorkspace({ chain, currency, market, initialStrike, initialStrategy }: {
  chain: SpreadChain; currency: "INR" | "USD"; market: SpreadMarket; initialStrike?: number; initialStrategy: SpreadId;
}) {
  const [strategy, setStrategy] = useState<SpreadId>(initialStrategy);
  const [source, setSource] = useState<PremiumSource>("market");
  const [chosen, setSelection] = useState<Selection>(() => initialStrikes(chain.contracts, initialStrategy, initialStrike ?? chain.reference, "market"));
  const [lots, setLots] = useState("1");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const preset = SPREADS[strategy];
  const money = useMemo(() => formatter(currency), [currency]);
  const contracts = chain.contracts;
  const sides = useMemo(() => contracts.filter(leg => leg.kind === preset.kind).sort((a, b) => a.strike - b.strike), [contracts, preset.kind]);
  const buy = sides.find(leg => leg.id === chosen.buy);
  const sell = sides.find(leg => leg.id === chosen.sell);

  function premium(leg: SpreadContract | undefined, action: keyof Selection) {
    if (!leg) return null;
    if (source === "market") return action === "buy" ? leg.ask : leg.bid;
    if (source === "last") return leg.last;
    const value = manual[leg.id];
    return value?.trim() ? Number(value) : null;
  }

  function changeSource(value: PremiumSource) {
    if (value === "manual") {
      setManual(previous => {
        const next = { ...previous };
        if (buy && next[buy.id] === undefined) next[buy.id] = String(premium(buy, "buy") ?? buy.last ?? "");
        if (sell && next[sell.id] === undefined) next[sell.id] = String(premium(sell, "sell") ?? sell.last ?? "");
        return next;
      });
    }
    setSource(value);
  }

  function setLeg(role: keyof Selection, next: SpreadContract) {
    if (next.kind !== preset.kind) {
      setStrategy(preset.flow === "Debit" ? (next.kind === "CE" ? "bullCall" : "bearPut") : (next.kind === "CE" ? "bearCall" : "bullPut"));
    }
    const isBuy = role === "buy";
    const other = isBuy ? "sell" : "buy";
    const buyLower = next.kind === preset.kind ? preset.buyLower : !preset.buyLower;
    const wantHigher = isBuy === buyLower;
    const suitable = (leg: SpreadContract) => leg.kind === next.kind && leg.multiplier === next.multiplier && (wantHigher ? leg.strike > next.strike : leg.strike < next.strike);
    const previous = isBuy ? sell : buy;
    const compatible = previous && suitable(previous) ? previous : contracts.filter(suitable).sort((a, b) => Math.abs(next.strike - a.strike) - Math.abs(next.strike - b.strike))[0];
    setSelection({ ...chosen, [role]: next.id, [other]: compatible?.id ?? "" });
  }

  const buyPremium = premium(buy, "buy");
  const sellPremium = premium(sell, "sell");
  let result: ReturnType<typeof calculateSpread> | undefined;
  let note = "";
  if (!buy || !sell) note = "Choose two listed strikes for the selected strategy.";
  else if (buyPremium === null || sellPremium === null) note = source === "market"
    ? "A bid or ask is missing for the selected legs. Choose another strike, use last traded prices, or enter premiums manually."
    : source === "last" ? "A last traded price is missing. Choose another strike or enter premiums manually."
      : "Supply both leg premiums to calculate the payoff.";
  else {
    try { result = calculateSpread(strategy, buy, sell, buyPremium, sellPremium, Number(lots)); }
    catch (error) { note = (error as Error).message; }
  }

  const table = useMemo(() => {
    const rows = new Map<number, { CE?: SpreadContract; PE?: SpreadContract }>();
    for (const leg of contracts) {
      const row = rows.get(leg.strike) ?? {};
      row[leg.kind] = row[leg.kind]?.multiplier ? row[leg.kind] : leg;
      rows.set(leg.strike, row);
    }
    return [...rows.entries()].sort(([a], [b]) => a - b);
  }, [contracts]);
  const anchor = chain.reference ?? table[Math.floor(table.length / 2)]?.[0] ?? 0;
  const nearby = useMemo(() => new Set(table.slice().sort(([a], [b]) => Math.abs(a - anchor) - Math.abs(b - anchor)).slice(0, 15).map(([strike]) => strike)),
    [table, anchor]);
  const visibleRows = showAll ? table : table.filter(([strike]) => nearby.has(strike) || strike === buy?.strike || strike === sell?.strike);
  const fmt = (value: number | null | undefined) => value == null ? "—" : money.format(value);
  const legPrices = (leg: SpreadContract | undefined) => leg ? <div className="spread-price-pair">
    {(["buy", "sell"] as const).map(role => <button type="button" key={role} data-side={role} disabled={!leg.multiplier}
      aria-label={`${role === "buy" ? "Buy" : "Sell"} ${optionNames[leg.kind]} at strike ${leg.strike}`}
      aria-pressed={chosen[role] === leg.id} onClick={() => setLeg(role, leg)}>
      <b>{role === "buy" ? "B" : "S"}</b><span>{fmt(role === "buy" ? leg.ask : leg.bid)}</span>
    </button>)}
    <small>LTP {fmt(leg.last)}</small>
  </div> : "—";

  return <>
    <div className="spread-workspace">
      <section className="spread-card spread-setup">
        <h2>Configure spread</h2>
        <div className="spread-presets" role="group" aria-label="Spread strategy">
          {(Object.entries(SPREADS) as [SpreadId, typeof preset][]).map(([id, option]) =>
            <button type="button" key={id} aria-pressed={id === strategy} onClick={() => {
              if (id !== strategy) {
                setStrategy(id);
                setSelection(initialStrikes(contracts, id, chain.reference, source));
              }
            }}>
              <strong>{option.label}</strong><span>{option.flow} spread</span>
            </button>)}
        </div>
        <div className="spread-entry">
          <label>Premium source
            <select value={source} onChange={event => changeSource(event.target.value as PremiumSource)}>
              <option value="market">Buy at ask · Sell at bid</option>
              <option value="last">Last traded prices</option>
              <option value="manual">Manual premiums</option>
            </select>
          </label>
          <label>Lots per leg
            <input type="number" min="1" max="100000" step="1" value={lots} onChange={event => setLots(event.target.value)} />
          </label>
        </div>
        <div className="spread-legs">
          {([{ leg: buy, role: "buy", price: buyPremium }, { leg: sell, role: "sell", price: sellPremium }] as const).map(({ leg, role, price }) =>
            <div key={role} className="spread-leg" data-side={role}>
              <label>{role === "buy" ? "Buy" : "Sell"} {optionNames[preset.kind]} strike
                <select value={leg?.id ?? ""} onChange={event => {
                  const selected = sides.find(contract => contract.id === event.target.value);
                  if (selected) setLeg(role, selected);
                }}>
                  <option value="" disabled>Select strike</option>
                  {sides.map(contract => <option key={contract.id} value={contract.id} disabled={!contract.multiplier}>{fmt(contract.strike)}</option>)}
                </select>
              </label>
              {source === "manual" ? <label>Premium
                <input aria-label={`${role === "buy" ? "Buy" : "Sell"} premium`} type="number" step="any" min="0" disabled={!leg}
                  value={leg ? manual[leg.id] ?? "" : ""}
                  onChange={event => { if (leg) setManual({ ...manual, [leg.id]: event.target.value }); }} />
              </label> : <div><span>{source === "last" ? "Last traded" : role === "buy" ? "Ask" : "Bid"}</span><strong>{fmt(price)}</strong></div>}
            </div>)}
        </div>
        {buy?.multiplier && buy.multiplier === sell?.multiplier ? <p className="spread-hint">Multiplier per lot <strong>{buy.multiplier}</strong></p> : null}
      </section>

      <section className="spread-card spread-payoff" aria-label="Expiry payoff">
        <h2>Expiry payoff</h2>
        {result ? <>
          <dl className="spread-metrics">
            <div><dt>Net {preset.flow.toLowerCase()}</dt><dd>{fmt(result.netPremium)}</dd></div>
            <div><dt>Break-even</dt><dd>{fmt(result.breakEven)}</dd></div>
            <div><dt>Max profit</dt><dd className="spread-up">{fmt(result.maxProfit)}</dd></div>
            <div><dt>Max loss</dt><dd className="spread-down">{fmt(-result.maxLoss)}</dd></div>
          </dl>
          <PayoffChart key={`${strategy}:${chosen.buy}:${chosen.sell}`} result={result} money={money} reference={chain.reference} />
        </> : <p className="spread-empty" role="status">{note}</p>}
        <p className="spread-hint">{market === "metals" ? "Before fees, delivery and devolvement costs" : "Before fees and settlement costs"}</p>
      </section>
    </div>

    <section className="spread-card spread-chain" aria-label="Option chain">
      <div className="spread-chain-heading"><h2>Option chain</h2>
        {table.length > 15 && <button type="button" aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Show nearby strikes" : "Show all strikes"}</button>}
      </div>
      <div className="spread-table-scroll" tabIndex={0} role="region" aria-label="Option chain prices">
        <table>
          <thead><tr><th scope="col">Calls</th><th scope="col">Strike</th><th scope="col">Puts</th></tr></thead>
          <tbody>{visibleRows.map(([strike, row]) => {
            return <tr key={strike} data-selected={strike === buy?.strike || strike === sell?.strike}>
              <td>{legPrices(row.CE)}</td>
              <th scope="row">{fmt(strike)}</th>
              <td>{legPrices(row.PE)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  </>;
}

function PayoffChart({ result, money, reference }: { result: ReturnType<typeof calculateSpread>; money: Money; reference: number | null }) {
  const [scenario, setScenario] = useState<number | null>(null);
  const { lower, upper, maxProfit, maxLoss, breakEven, payoff } = result;
  const [riskInput, setRisk] = useState<string>();
  const [targetInput, setTarget] = useState<string>();
  const defaultLevel = (max: number) => String(Number((max / 2).toPrecision(4)));
  const stop = riskInput ?? defaultLevel(maxLoss);
  const target = targetInput ?? defaultLevel(maxProfit);
  const risk = Number(stop), reward = Number(target);
  const validRisk = risk > 0 && risk <= maxLoss;
  const validReward = reward > 0 && reward <= maxProfit;
  const padding = (upper - lower) * 0.65;
  const start = Math.max(0, lower - padding);
  const end = upper + padding;
  const price = Math.min(end, Math.max(start, scenario ?? reference ?? breakEven));
  const x = (value: number) => 76 + 388 * (value - start) / (end - start);
  const y = (value: number) => 13 + 128 * (maxProfit - value) / (maxProfit + maxLoss);
  const y0 = y(0);
  const points = [start, lower, breakEven, upper, end];
  const line = (values: number[]) => values.map(value => `${x(value)},${y(payoff(value))}`).join(" ");
  const ascending = payoff(end) > payoff(start);
  const first = points.slice(0, 3);
  const last = points.slice(2);
  const zone = (values: number[]) => `${x(values[0])},${y0} ${line(values)} ${x(values[values.length - 1])},${y0}`;
  const ticks = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2, style: "currency", currency: money.resolvedOptions().currency });

  return <figure className="spread-chart">
    <div className="spread-risk-plan">
      <label>Stop loss ({money.resolvedOptions().currency})<input type="number" min="0" max={maxLoss} step="any" value={stop} onChange={event => setRisk(event.target.value)} aria-invalid={!validRisk} /></label>
      <label>Target ({money.resolvedOptions().currency})<input type="number" min="0" max={maxProfit} step="any" value={target} onChange={event => setTarget(event.target.value)} aria-invalid={!validReward} /></label>
      <div><span>Risk : reward</span><strong>{validRisk && validReward ? `1 : ${(reward / risk).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}</strong></div>
    </div>
    {(!validRisk || !validReward) && <p className="spread-hint" role="status">Enter levels within the maximum loss and profit.</p>}
    <svg viewBox="0 0 480 154" role="img" aria-label="Profit and loss at expiry across settlement prices">
      {[maxProfit, 0, -maxLoss].map(value => <text key={value} className="spread-chart-tick" x="70" y={y(value) + 4} textAnchor="end">{ticks.format(value)}</text>)}
      <line x1={x(start)} x2={x(end)} y1={y0} y2={y0} className="spread-zero" />
      <polygon points={zone(first)} className={ascending ? "spread-loss-zone" : "spread-profit-zone"} />
      <polygon points={zone(last)} className={ascending ? "spread-profit-zone" : "spread-loss-zone"} />
      <polyline points={line(first)} className={ascending ? "spread-loss-line" : "spread-profit-line"} />
      <polyline points={line(last)} className={ascending ? "spread-profit-line" : "spread-loss-line"} />
      {validRisk && <line x1={x(start)} x2={x(end)} y1={y(-risk)} y2={y(-risk)} className="spread-stop-line" />}
      {validReward && <line x1={x(start)} x2={x(end)} y1={y(reward)} y2={y(reward)} className="spread-target-line" />}
      <circle cx={x(breakEven)} cy={y0} r="3" className="spread-break-even" />
      <line x1={x(price)} x2={x(price)} y1="5" y2="149" className="spread-marker" />
      <circle cx={x(price)} cy={y(payoff(price))} r="4.5" className="spread-point" />
    </svg>
    <div className="spread-chart-axis"><span>{money.format(start)}</span><span>{money.format(end)}</span></div>
    <label>Settlement price scenario <strong>{money.format(price)}</strong>
      <input type="range" min={start} max={end} step={(end - start) / 200} value={price} aria-valuetext={money.format(price)}
        onChange={event => setScenario(Number(event.target.value))} />
    </label>
    <figcaption>Estimated P&amp;L <strong className={payoff(price) >= 0 ? "spread-up" : "spread-down"}>{money.format(payoff(price))}</strong></figcaption>
  </figure>;
}
