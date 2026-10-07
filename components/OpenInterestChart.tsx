"use client";
import { useEffect, useRef, useState } from 'react';
import { oiChartScale, type oiLevels } from '@/lib/oi-chart';
import type { oiSummary } from '@/lib/home-derivatives';

const format = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const compact = (value: number) => value.toLocaleString('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export function OpenInterestChart({ rows, change, spot, symbol, levels }: {
  rows: ReturnType<typeof oiSummary>['strikes']; change: boolean; spot: number | null; symbol: string; levels: ReturnType<typeof oiLevels>;
}) {
  const host = useRef<HTMLDivElement>(null), [width, setWidth] = useState(360);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const left = 8, right = width - 42, step = (right - left) / Math.max(1, rows.length);
  const first = rows[0]?.strike ?? 0, last = rows.at(-1)?.strike ?? first;
  const x = (price: number) => {
    if (rows.length < 2) return (left + right) / 2;
    const upper = rows.findIndex(row => row.strike >= price);
    const index = upper <= 0 ? 0 : upper - 1 + (price - rows[upper - 1].strike) / (rows[upper].strike - rows[upper - 1].strike);
    return left + step * (index + .5);
  };
  const onChart = (price: number | null): price is number => price !== null && price >= first && price <= last;
  const markers = ([['support', 'OI Support', levels.support], ['resistance', 'OI Resistance', levels.resistance], ['pain', 'Max Pain', levels.maxPain]] as const).filter(([, , price]) => onChart(price)).sort((a, b) => a[2]! - b[2]!);
  const lanes: number[] = [];
  const labels = markers.map(([kind, label, price]) => {
    const boxWidth = label.length * 5.6 + 12, boxX = Math.max(left, Math.min(right - boxWidth, x(price!) - boxWidth / 2));
    let lane = 0; while (lanes[lane] !== undefined && lanes[lane] + 4 > boxX) lane++;
    lanes[lane] = boxX + boxWidth;
    return { kind, label, price: price!, boxWidth, boxX, lane };
  });
  const top = 28 + lanes.length * 18, bottom = top + 138, height = bottom + 47;
  const values = rows.flatMap(row => [row.call[change ? 'change' : 'oi'], row.put[change ? 'change' : 'oi']]);
  const scale = oiChartScale(values), y = (value: number) => bottom - (value - scale.min) / (scale.max - scale.min) * (bottom - top);
  const barWidth = Math.min(12, step * .3);
  return <div ref={host} className="home-oi-chart-scroll">
    <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" aria-label={change ? 'Call and put change in open interest by strike' : 'Call and put open interest by strike'}>
      <title>{symbol}: call and put {change ? 'OI change' : 'OI'}. {spot === null ? 'Current price unavailable.' : `Current price ${format(spot)}.`}</title>
      {scale.ticks.map(value => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} className={value === 0 ? 'home-oi-zero' : 'home-oi-grid'}/><text x={width - 2} y={y(value) + 3} textAnchor="end">{compact(value)}</text></g>)}
      {onChart(spot) && <g className="home-oi-spot" data-price={spot}>
        <line x1={x(spot)} x2={x(spot)} y1="22" y2={bottom}/>
        <rect x={Math.max(left, Math.min(right - Math.min(right - left, symbol.length * 6 + 72), x(spot) - (symbol.length * 6 + 72) / 2))} y="1" width={Math.min(right - left, symbol.length * 6 + 72)} height="18" rx="4"/>
        <text x={Math.max(left + Math.min(right - left, symbol.length * 6 + 72) / 2, Math.min(right - Math.min(right - left, symbol.length * 6 + 72) / 2, x(spot)))} y="13" textAnchor="middle">{symbol} {format(spot)}</text>
      </g>}
      {rows.map(row => <g key={row.strike}>{(['call', 'put'] as const).map((side, j) => {
        const value = row[side][change ? 'change' : 'oi'];
        return value === null ? null : <rect key={side} x={x(row.strike) + (j - 1) * (barWidth + 1)} y={Math.min(y(value), y(0))} width={barWidth} height={Math.abs(y(value) - y(0))} rx="1" className={`home-oi-bar ${side}`}><title>{format(row.strike)} · {side === 'call' ? 'Call' : 'Put'} {change ? 'OI change' : 'OI'}: {format(value)}</title></rect>;
      })}<text transform={`translate(${x(row.strike) + 4},${bottom + 8}) rotate(-55)`} textAnchor="end">{format(row.strike)}</text></g>)}
      {labels.map(({ kind, label, price, boxWidth, boxX, lane }) => <g key={kind} className={`home-oi-marker ${kind}`} data-strike={price}>
        <title>{label}: {format(price)}</title><line x1={x(price)} x2={x(price)} y1={26 + lane * 18 + 16} y2={bottom}/>
        <rect x={boxX} y={26 + lane * 18} width={boxWidth} height="16" rx="4"/><text x={boxX + boxWidth / 2} y={38 + lane * 18} textAnchor="middle">{label}</text>
      </g>)}
    </svg>
    <div className="home-oi-levels" aria-label="Open interest levels">{spot !== null && !onChart(spot) && <span>Price <b>{format(spot)}</b></span>}{([['OI Support', levels.support], ['OI Resistance', levels.resistance], ['Max Pain', levels.maxPain]] as const).map(([label, price]) => <span key={label} title={label === 'Max Pain' ? 'Strike with the lowest total intrinsic option payout across the full expiry chain. Unavailable when OI is incomplete.' : `Strike with the highest ${label === 'OI Support' ? 'put' : 'call'} OI across the full expiry chain. Unavailable when OI is incomplete.`}>{label} <b>{price === null ? '—' : format(price)}</b></span>)}</div>
  </div>;
}
