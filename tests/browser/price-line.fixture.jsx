import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DrawingManager} from 'lightweight-charts-drawing';
import {MarketChart} from '../../components/MarketChart';
const attach=DrawingManager.prototype.attach;DrawingManager.prototype.attach=function(...args){window.qaChart=args[0];window.qaSeries=args[1];window.qaManager=this;return attach.apply(this,args);};
const instrument={symbol:'TEST',name:'Price line test',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|TEST',categories:[]};
function App(){const [theme,setTheme]=useState('light'),[undo,setUndo]=useState(0),[redo,setRedo]=useState(0),[tool,setTool]=useState('cursor');useEffect(()=>{window.qaTool=setTool;},[]);
 return <main className="terminal-shell" data-theme={theme} style={{display:'block',height:'100dvh'}}><style>{'.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}'}</style><header style={{height:44}}><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button><button onClick={()=>setUndo(v=>v+1)}>Undo</button><button onClick={()=>setRedo(v=>v+1)}>Redo</button></header><div style={{height:'calc(100dvh - 44px)'}}><MarketChart instrument={instrument} timeframe="5m" activeTool={tool} undoSignal={undo} redoSignal={redo} indicators={{rsi:true}} chartTheme={theme} onFeedStatus={()=>{}} onDrawingComplete={()=>setTool('cursor')}/></div></main>;
}createRoot(document.getElementById('root')).render(<App/>);
