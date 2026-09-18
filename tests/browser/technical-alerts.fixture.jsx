import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PriceActions } from '../../components/PriceActions';
import { NotificationCenter } from '../../components/NotificationCenter';
const stock = { symbol: 'TEST', name: 'Test Company', price: 110, change: 0, exchange: 'NSE', instrumentKey: 'NSE_EQ|TEST', categories: [], assetType: 'EQUITY' };
function App() {
  const [request, setRequest] = useState(null), [host, setHost] = useState(null), [owner, setOwner] = useState('qa'), [theme, setTheme] = useState('light'), [chart, setChart] = useState(true), [notice, setNotice] = useState(''), [opened, setOpened] = useState('');
  return <main className="terminal-shell" data-theme={theme} style={{ display: 'block', padding: 16, height: '100dvh' }}>
    <h1>Technical alerts · test workspace</h1><NotificationCenter />
    <button onClick={() => setRequest({ instrument: stock, price: 110, mode: 'alert' })}>New alert</button>
    <button onClick={() => setChart(c => !c)}>Switch app tab</button><button onClick={() => setOwner(o => o === 'qa' ? 'other' : 'qa')}>Switch account</button><button onClick={() => setTheme(t => t === 'light' ? 'neon' : 'light')}>Switch theme</button>
    <p>{chart ? 'Chart visible' : 'P&L visible — monitoring continues'}</p><p role="status">{notice}</p><p data-opened>{opened}</p>
    <div className="chart-trade-meta"><button className="chart-positions-trigger">Stocks</button><div className="chart-price-actions-slot" ref={setHost} /></div>
    <PriceActions key={owner} ownerId={owner} timeframe="5m" visible triggerHost={host} request={request} onClose={() => setRequest(null)} onFill={() => null} marketOpen intradayOpen onNotice={setNotice} onCreateAlert={() => setRequest({ instrument: stock, price: 110, mode: 'alert' })} onOpenTechnical={(instrument, frame) => setOpened(`${instrument.symbol} ${frame}`)} />
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
