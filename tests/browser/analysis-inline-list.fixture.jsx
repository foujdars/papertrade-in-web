import React from 'react';
import { createRoot } from 'react-dom/client';
import { FundamentalWorkspace } from '../../components/FundamentalWorkspace';
import { evaluateScreenerCsv } from '../../lib/fundamental-screener';
import { saveLocalRun } from '../../lib/fundamental-store';

const run = evaluateScreenerCsv('Name,NSE Code,BSE Code\nCompany,COMPANY,123456');
run.missingColumns = [];
run.results = Array.from({ length: 408 }, (_, i) => ({ ...run.results[0], id: `company-${i}`, name: `Company ${String(i).padStart(3, '0')}`, nseCode: `STOCK${i}`, gateStatus: i < 302 ? 'review' : 'rejected' }));
const instruments = run.results.map(result => ({ symbol: result.nseCode, name: result.name, instrumentKey: `NSE_EQ|fixture-${result.id}`, exchange: 'NSE', segment: 'EQ', lastPrice: 100 }));
saveLocalRun('inline-list-test', run, new File(['fixture'], 'fixture.csv')).then(() => {
  createRoot(document.getElementById('root')).render(<FundamentalWorkspace ownerId="inline-list-test" instruments={instruments} balance={0} onSimulate={() => {}} onClose={() => {}} onOpenChart={instrument => { window.qaChartSymbol = instrument.symbol; }} />);
});
