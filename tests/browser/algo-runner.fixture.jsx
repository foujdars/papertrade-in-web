import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { useAlgoPaperSession } from '../../components/useAlgoPaperSession';

// Exercise the production hook with real React effects, storage events and timers.
// Only the native event bridge, exchange clock and HTTP responses are controlled.
Capacitor.isNativePlatform = () => true;
Capacitor.getPlatform = () => 'android';
const plan = {
  name: 'Runner regression', entryTime: '09:20', exitTime: '15:15', capital: 100000,
  maxLoss: 0, maxProfit: 0, feePerOrder: 2, slippageBps: 10,
  legs: [{ id: 'one', instrumentKey: 'NSE_EQ|TEST', symbol: 'TEST', side: 'BUY', quantity: 10, stopPercent: 0, targetPercent: 0 }],
};

function Runner() {
  const paper = useAlgoPaperSession('runner-test');
  window.runner = paper;
  return <main>
    <h1>Actual paper runner</h1>
    <button disabled={paper.loading} onClick={() => paper.start(plan, 'market')}>Start market</button>
    <button onClick={paper.pause}>Pause</button>
    <button onClick={paper.resume}>Resume</button>
    <button onClick={paper.stop}>Stop</button>
    <button onClick={paper.reset}>Clear</button>
    <output data-testid="notice">{paper.notice}</output>
    <pre data-testid="session">{JSON.stringify(paper.session)}</pre>
  </main>;
}
createRoot(document.getElementById('root')).render(<Runner />);
