"use client";

import { useEffect, useMemo, useRef } from "react";
import { CandlestickChart } from "lucide-react";
import type { SpreadContract } from "@/lib/vertical-spread";
import type { BasketLeg, BasketSide } from "@/lib/option-basket";

export function OptionChainTable({ contracts, reference, currency, onSide, onChart, selected, legs, allowUnquoted = false, nearby = false, focusAtm = false, focusStrike }: {
  contracts: SpreadContract[]; reference: number | null; currency: "INR" | "USD";
  onSide: (contract: SpreadContract, side: BasketSide) => void;
  onChart?: (contract: SpreadContract) => void;
  selected?: string; legs?: BasketLeg[]; allowUnquoted?: boolean; nearby?: boolean; focusAtm?: boolean; focusStrike?: number;
}) {
  const rows = useMemo(() => {
    const groups = new Map<number, { strike: number; CE?: SpreadContract; PE?: SpreadContract }>();
    for (const contract of contracts) {
      const row = groups.get(contract.strike) ?? { strike: contract.strike };
      row[contract.kind] = contract;
      groups.set(row.strike, row);
    }
    return [...groups.values()].sort((a,b) => a.strike - b.strike);
  }, [contracts]);
  const nearest = rows.length && reference !== null
    ? rows.reduce((best, row, i) => Math.abs(row.strike - reference) < Math.abs(rows[best].strike - reference) ? i : best, 0) : -1;
  const focused = focusStrike === undefined ? -1 : rows.findIndex(row => row.strike === focusStrike);
  const center = focused >= 0 ? focused : nearest < 0 ? Math.floor(rows.length / 2) : nearest;
  const start = nearby ? Math.max(0, Math.min(rows.length - 15, center - 7)) : 0;
  const displayed = nearby ? rows.slice(start, start + 15) : rows;
  const scroll = useRef<HTMLDivElement>(null);
  const series = contracts[0]?.series;
  const hasAtm = nearest >= 0;
  useEffect(() => {
    const box = scroll.current, row = box?.querySelector<HTMLElement>("[data-atm='true']");
    if (focusAtm && box && row) box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - (box.clientHeight - row.offsetHeight) / 2;
  }, [series, focusAtm, rows.length, hasAtm]);
  const priceFormat = useMemo(() => new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    maximumFractionDigits: currency === "USD" ? 6 : 2,
  }), [currency]);
  function cell(contract: SpreadContract | undefined) {
    if (!contract) return <span className="chain-no-contract" aria-label="Contract unavailable">—</span>;
    const name = priceFormat.format(contract.strike) + (contract.kind === "CE" ? " call" : " put");
    const current = legs?.find(leg => leg.id === contract.id);
    return <div className="chain-contract" data-current={selected === contract.id}>
      <div className="chain-quotes">{(["BUY", "SELL"] as const).map(side => {
        const price = side === "BUY" ? contract.ask : contract.bid;
        const label = side === "BUY" ? "Buy" : "Sell";
        return <button key={side} type="button" data-side={side} aria-pressed={legs ? current?.side === side : undefined}
          aria-label={`${label} ${name}${price === null ? "" : " at " + priceFormat.format(price)}`}
          disabled={!contract.multiplier || (!allowUnquoted && price === null && current?.side !== side)}
          title={`${label} ${name} · ${side === "BUY" ? "ask" : "bid"}`}
          onClick={() => onSide(contract, side)}><b>{side === "BUY" ? "B" : "S"}</b><span>{price === null ? "—" : priceFormat.format(price)}</span></button>;
      })}</div>
      {onChart ? <button type="button" className="chain-chart" aria-label={`Open ${name} chart`}
        aria-pressed={selected === contract.id} onClick={() => onChart(contract)}><CandlestickChart size={13} aria-hidden="true" /><span>{contract.last !== null ? priceFormat.format(contract.last) : "Chart"}</span></button>
        : <small className="chain-last">LTP {contract.last === null ? "—" : priceFormat.format(contract.last)}</small>}
    </div>;
  }
  return <div className="chain-grid-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Option chain prices">
    <table className="chain-grid"><colgroup><col/><col className="chain-strike-col"/><col/></colgroup>
      <thead><tr><th scope="col">Calls <small>Buy ask · Sell bid</small></th><th scope="col">Strike <small>{currency}</small></th><th scope="col">Puts <small>Buy ask · Sell bid</small></th></tr></thead>
      <tbody>{displayed.map(row => <tr key={row.strike} data-atm={row.strike === rows[nearest]?.strike}>
        <td>{cell(row.CE)}</td><th scope="row">{priceFormat.format(row.strike)}{row.strike === rows[nearest]?.strike && <small>ATM</small>}</th><td>{cell(row.PE)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
