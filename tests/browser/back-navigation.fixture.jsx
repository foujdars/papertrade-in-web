import React, { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTransientBack } from '../../components/useTransientBack';
import { useNavigationHistory } from '../../components/useNavigationHistory';
import { AppDialog } from '../../components/AppDialog';
import { ChartTimeframeMenu } from '../../components/CompactSelectors';
import { AdvancedChartWorkspace } from '../../components/AdvancedChartWorkspace';
import { BulkDeals } from '../../components/BulkDeals';
function App() {
  const [screen, setScreen] = useState('Home'), [frame, setFrame] = useState('5m');
  const [drawer, setDrawer] = useState(false), [dialog, setDialog] = useState(false), [picker, setPicker] = useState(false);
  const panel = useRef(null);
  const snapshot = useCallback(() => ({ screen, frame, scroll: panel.current?.scrollTop ?? 0 }), [screen, frame]);
  const nav = useNavigationHistory(saved => { setScreen(saved.screen); setFrame(saved.frame); requestAnimationFrame(() => { if (panel.current) panel.current.scrollTop = saved.scroll; }); });
  useEffect(() => { nav.update(snapshot()); }, [nav, snapshot]);
  useTransientBack(drawer, () => setDrawer(false));
  function go(next) { nav.remember(snapshot()); setScreen(next); setDrawer(false); }
  useEffect(() => { window.qaBack = () => { if (window.dispatchEvent(new Event("papertrade:dismiss-layer", { cancelable: true }))) nav.back(); }; return () => { delete window.qaBack; }; }, [nav]);
  return <main className="terminal-shell" data-screen={screen}>
    <h1>{screen} {frame}</h1><div role="navigation">{['Home','Watchlist','News','Analysis','IPO','Bot','P&L','Chart A','Chart B'].map(name => <button key={name} onClick={() => go(name)}>{name}</button>)}</div>
    <button onClick={() => setDrawer(true)}>Drawer</button><button onClick={() => setFrame('1D')}>Daily</button>
    <div ref={panel} className="qa-scroll" style={{height:150,overflow:'auto'}}><div style={{height:500}}>List</div></div>
    {drawer && <section aria-label="Drawer"><button onClick={() => setDrawer(false)}>Close drawer</button><button onClick={() => setDialog(true)}>Dialog</button><button onClick={() => go('Chart A')}>Open chart</button></section>}
    {dialog && <AppDialog className="qa-dialog" label="Nested dialog" onClose={() => setDialog(false)}><button onClick={() => setPicker(true)}>Timeframe</button><button onClick={() => setDialog(false)}>Close dialog</button>{picker && <ChartTimeframeMenu current={frame} onSelect={next => { setFrame(next); setPicker(false); }} onClose={() => setPicker(false)} />}</AppDialog>}
    {screen === 'Home' && <BulkDeals onOpen={symbol => go(`Chart ${symbol}`)} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<StrictMode>{new URL(location.href).searchParams.has("full") ? <AdvancedChartWorkspace initialSymbol="RELIANCE" initialTimeframe="5m" /> : <App />}</StrictMode>);
