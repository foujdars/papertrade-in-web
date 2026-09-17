import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DrawingManager } from 'lightweight-charts-drawing';
import { MarketChart, DEFAULT_CHART_INDICATORS } from '../../components/MarketChart';

const originalAttach = DrawingManager.prototype.attach;
DrawingManager.prototype.attach = function (...args) {
  window.qaChart = args[0];
  window.qaSeries = args[1];
  return originalAttach.apply(this, args);
};
const instrument = { symbol: 'TEST', name: 'Live chart regression', price: 110, change: 0, exchange: 'NSE', instrumentKey: 'NSE_EQ|TEST', categories: [] };
function App() {
  const [tick, setTick] = useState();
  const [action, setAction] = useState();
  const [smc, setSmc] = useState(false);
  window.qaSmc = setSmc;
  window.qaAction = setAction;
  return <main className="terminal-shell" data-theme="light"><MarketChart
    instrument={instrument} timeframe="5m" activeTool="cursor"
    indicators={{ ...DEFAULT_CHART_INDICATORS, smc }}
    // Match the dashboard: no position, but its unused risk entry follows LTP.
    orderTool={{ enabled: false, side: 'BUY', quantity: 0, entryPrice: tick?.price ?? 110 }}
    chartAction={action} liveTick={tick} onFeedStatus={() => {}}
    onPrice={(price, timestampMs) => {
      window.qaPublished = { price, timestampMs };
      setTick({ instrumentKey: instrument.instrumentKey, price, timestampMs });
    }}
  /></main>;
}
createRoot(document.getElementById('root')).render(<App />);
