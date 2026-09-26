import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TradingWatchlist } from '../../components/TradingWatchlist';

const stocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', instrumentKey: 'NSE_EQ|INE001', categories: ['NIFTY 50', 'NIFTY 500'] },
  { symbol: 'SBIN', name: 'State Bank of India', instrumentKey: 'NSE_EQ|INE002', categories: ['NIFTY 50', 'NIFTY PSU BANK', 'NIFTY 500'] },
  { symbol: 'BANKINDIA', name: 'Bank of India', instrumentKey: 'NSE_EQ|INE003', categories: ['NIFTY PSU BANK', 'NIFTY 500'] },
].map(item => ({ ...item, exchange: 'NSE', price: 0, change: 0 }));
const underlyings = [{ instrumentKey: 'NSE_EQ|INE002', underlyingType: 'EQUITY' }];
function App() {
  const [count, setCount] = useState(0), [search, setSearch] = useState('');
  return <main className="terminal-shell section-watchlist" data-theme="light">
    <header className="qa-header">PaperTrade IN <span>Watchlist · {count} setups</span></header>
    <input aria-label="Search setups" placeholder="Search setups" value={search} onChange={e => setSearch(e.target.value)} />
    <TradingWatchlist instruments={stocks} underlyings={underlyings} active search={search} onCount={setCount} onOpen={(instrument, frame, time) => { window.openedSetup = { symbol: instrument.symbol, frame, time }; }} />
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
