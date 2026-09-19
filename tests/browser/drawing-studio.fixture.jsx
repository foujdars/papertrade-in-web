import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DrawingManager } from 'lightweight-charts-drawing';
import { MarketChart, DEFAULT_CHART_INDICATORS } from '../../components/MarketChart';
import { DrawingToolLibrary } from '../../components/DrawingToolLibrary';
import { ChartDrawingToolbar } from '../../components/ChartDrawingToolbar';
import { NativeViewportGuard } from '../../components/NativeViewportGuard';
const attach = DrawingManager.prototype.attach;
DrawingManager.prototype.attach = function (...args) { window.qaChart = args[0]; window.qaSeries = args[1]; window.qaManager = this; return attach.apply(this,args); };
const instrument = { symbol:'TEST',name:'Drawing studio test',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|TEST',categories:[] };
function App() {
  const [open,setOpen]=useState(false),[tool,setTool]=useState('cursor'),[signal,setSignal]=useState(0),[hidden,setHidden]=useState(false),[theme,setTheme]=useState('light');
  const select=id=>{setTool(id);setSignal(s=>s+1);};
  return <main className="terminal-shell" data-theme={theme} style={{display:'block',height:'100dvh'}}><NativeViewportGuard />
    <header style={{display:'flex',alignItems:'center',gap:10,padding:10}}><button onClick={()=>setOpen(true)} aria-label="Open drawing tools">Tools</button><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button><span data-active>{tool}</span></header>
    <div style={{display:'flex',height:'calc(100dvh - 60px)'}}><ChartDrawingToolbar activeTool={tool} magnet={false} locked={false} hidden={hidden} libraryInHeader onSelect={select} onAllTools={()=>setOpen(true)} onToggleMagnet={()=>{}} onUndo={()=>{}} onRedo={()=>{}} onToggleLock={()=>{}} onToggleHidden={()=>setHidden(v=>!v)} onClear={()=>{}} />
      <MarketChart instrument={instrument} timeframe="5m" activeTool={tool} toolSignal={signal} hiddenDrawings={hidden} indicators={DEFAULT_CHART_INDICATORS} onFeedStatus={()=>{}} onPrice={()=>{}} onDrawingComplete={()=>setTool('cursor')} />
    </div>
    {open&&<DrawingToolLibrary activeTool={tool} onSelect={select} onClose={()=>setOpen(false)} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
