import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { PsbbMarks } from '../../components/PsbbMarks';
import { ChartStudyRenderer } from '../../lib/chart-study-renderer';
import { studyDefaults } from '../../lib/indicator-catalog';
import { psbbAnalysis } from '../../lib/psbb';

const seconds = { '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 };
const config = { ...studyDefaults('psbb'), inputs: { ...studyDefaults('psbb').inputs, length: 2, left: 1, oversold: 1, overbought: 99 } };
const pattern = [[110, 90, 108], [120, 95, 100], [130, 100, 110], [125, 99, 105], [118, 90, 94], [122, 96, 115], [116, 94, 100], [112, 85, 88], [110, 85, 95]];

function Fixture({ view }) {
  const [ready, setReady] = useState(null);
  const host = useRef(null), renderer = useRef(null), refresh = useRef(null);
  const timeframe = view.timeframe;
  useEffect(() => {
    const rows = [...Array.from({ length: 20 }, () => [100, 90, 95]), ...pattern].slice(0, view.count);
    const candles = rows.map(([high, low, close], i) => ({
      time: 1700000000 + i * seconds[timeframe], high: view.long ? 200 - low : high,
      low: view.long ? 200 - high : low, open: view.long ? 200 - close : close,
      close: view.long ? 200 - close : close, volume: 100,
    }));
    const time = (epoch) => epoch + (timeframe === '1D' ? 0 : 19800);
    const chart = createChart(host.current, { width: host.current.clientWidth, height: 680, layout: { attributionLogo: false }, timeScale: { timeVisible: true }, rightPriceScale: { minimumWidth: 55 } });
    const series = chart.addSeries(CandlestickSeries);
    series.setData(candles.map((c) => ({ ...c, time: time(c.time) })));
    renderer.current = new ChartStudyRenderer(chart, time);
    renderer.current.sync({ rsi: true }, { rsi: { ...studyDefaults('rsi'), inputs: { ...studyDefaults('rsi').inputs, length: 2 }, smoothing: 'None' } }, timeframe, candles);
    renderer.current.fit(680);
    chart.timeScale().fitContent();
    chart.priceScale('right').setAutoScale(false);
    chart.priceScale('right').setVisibleRange({ from: 30, to: 175 });
    window.psbbQa = { chart, series, candles, analysis: psbbAnalysis(candles, config.inputs, timeframe) };
    setReady({ chart, series, candles });
    return () => { renderer.current = null; chart.remove(); };
  }, [view, timeframe]);
  return <div className="terminal-shell" data-theme="light"><div style={{ position: 'relative', width: '100%', height: 680 }}>
    <div ref={host} />
    {ready && <PsbbMarks key={`${view.timeframe}:${view.count}:${view.long}`} {...ready} timeframe={timeframe} config={config} studyRenderer={renderer} refreshRef={refresh} />}
  </div></div>;
}
function App() {
  const [view, setView] = useState({ timeframe: '5m', count: 22, long: false });
  window.psbbView = setView;
  return <Fixture key={`${view.timeframe}:${view.count}:${view.long}`} view={view} />;
}
createRoot(document.getElementById('root')).render(<App />);
