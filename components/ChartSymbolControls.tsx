"use client";
import { CandlestickChart, ChevronDown, Link2, Plus, Search, Star } from 'lucide-react';
import type { Instrument } from '@/lib/market';
import { StockLogo } from './StockLogo';

export function ChartFavouriteButton({ instrument, saved, onClick }: { instrument: Instrument; saved: boolean; onClick: () => void }) {
  if (instrument.assetType === 'OPTION') return null;
  return <button type="button" className={`chart-watchlist-star chart-floating-favourite ${saved ? 'saved' : ''}`} onClick={onClick} aria-label={`Add ${instrument.symbol} to a custom watchlist`} title="Add to custom watchlist"><Star size={18} fill={saved ? 'currentColor' : 'none'}/></button>;
}

export function ChartSymbolControls({ instrument, venue, desktop = false, expanded, onToggle, compared, onCompare, onOptions, optionsDisabled, styled, onStyle, query, onQuery, matches, onChoose, venueLabel }: {
  instrument: Instrument; venue: string; desktop?: boolean; expanded: boolean; onToggle: () => void;
  compared: boolean; onCompare: () => void; onOptions?: () => void; optionsDisabled: boolean;
  styled: boolean; onStyle: () => void; query: string; onQuery: (value: string) => void;
  matches: Instrument[]; onChoose: (instrument: Instrument) => void; venueLabel: (instrument: Instrument) => string;
}) {
  return <>
    <div className="chart-symbol-search">
      {desktop ? <button className="desktop-symbol-trigger" onClick={onToggle} aria-expanded={expanded}><StockLogo {...instrument} size={24}/><span>{instrument.symbol}</span><small>{venue}</small><ChevronDown size={15}/></button> : <button className="trade-symbol-trigger" onClick={onToggle} aria-expanded={expanded}><div className="title-line"><StockLogo {...instrument} size={28}/><h1>{instrument.symbol}</h1><span>{venue}</span><ChevronDown size={16}/></div><p>{instrument.name}</p></button>}
      <button type="button" className={`chart-compare-link ${compared ? 'active' : ''}`} onClick={onCompare} aria-label="Compare symbols" title="Compare symbols"><Plus size={desktop ? 17 : 18}/></button>
    </div>
    {onOptions && <button className="chart-derivatives-link" disabled={optionsDisabled} onClick={onOptions} aria-label={`Open ${instrument.symbol} option charts`} title="Open option charts"><Link2 size={desktop ? 16 : 19}/></button>}
    <button type="button" className={`chart-style-link ${styled ? 'active' : ''}`} onClick={onStyle} aria-label="Chart type" title={desktop ? 'Candles' : 'Chart type'}><CandlestickChart size={desktop ? 17 : 18}/></button>
    {expanded && <div className={`trade-symbol-menu${desktop ? ' desktop-symbol-menu' : ''}`}>
      <label><Search size={16}/><input value={query} onChange={event => onQuery(event.target.value)} placeholder="Search stocks, BTC, gold or Brent"/></label>
      <div>{matches.map(item => <button key={item.symbol} onClick={() => onChoose(item)}><span className="stock-identity"><StockLogo {...item} size={32}/><span><b>{item.symbol}</b><small>{item.name}</small></span></span><em>{venueLabel(item)}</em></button>)}{!matches.length && <p>No matching symbol.</p>}</div>
    </div>}
  </>;
}
