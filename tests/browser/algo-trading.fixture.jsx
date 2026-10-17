import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { AlgoTradingWorkspace } from '../../components/AlgoTradingWorkspace';
const params = new URLSearchParams(location.search), native = params.has('native');
Capacitor.isNativePlatform = () => native;
Capacitor.getPlatform = () => native ? 'android' : 'web';
const instruments = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', instrumentKey: 'NSE_EQ|INE002A01018', price: 1200, change: 0, categories: [], assetType: 'EQUITY' },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', instrumentKey: 'NSE_EQ|INE062A01020', price: 800, change: 0, categories: [], assetType: 'EQUITY' },
];
const underlyings = [{ symbol: 'NIFTY', name: 'Nifty 50', instrumentKey: 'NSE_INDEX|Nifty 50', underlyingType: 'INDEX', optionContracts: 2, futureContracts: 0 }];
createRoot(document.getElementById('root')).render(<main className="terminal-shell" data-theme={params.get('theme') || 'light'} data-platform={native ? 'native' : 'web'}><AlgoTradingWorkspace instruments={instruments} underlyings={underlyings} ownerId={params.get('owner') || 'qa-user'} onClose={() => { window.closedAlgo = true; }} /></main>);
