import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PriceActions } from '../../components/PriceActions';
import { MarketChart, DEFAULT_CHART_INDICATORS } from '../../components/MarketChart';
import { DrawingManager } from 'lightweight-charts-drawing';
const originalAttach = DrawingManager.prototype.attach;
DrawingManager.prototype.attach = function(...args) { window.qaChart=args[0];window.qaSeries=args[1];window.qaManager=this;return originalAttach.apply(this,args); };
const instrument={symbol:'TEST',name:'Test Company',price:110,change:0,exchange:'NSE',instrumentKey:'NSE_EQ|INE002A01018',categories:[]};
function App(){
 const [request,setRequest]=useState(null),[host,setHost]=useState(null),[tasks,setTasks]=useState([]),[theme,setTheme]=useState('light'),[hidden,setHidden]=useState(false),[key,setKey]=useState('NSE_EQ|INE002A01018'),[market,setMarket]=useState(false),[frame,setFrame]=useState("1D"),[tool,setTool]=useState("cursor");
 window.qaFrame=setFrame;window.qaTool=setTool;window.qaTheme=setTheme;window.qaHidden=setHidden;window.qaKey=setKey;window.qaMarket=setMarket;
 window.qaOrder=()=>setRequest({instrument,price:111,mode:'order'});
 return <main className="terminal-shell" data-theme={theme}>
  <button onClick={()=>setTool("horizontal-ray")}>Draw horizontal ray</button><button onClick={()=>setTheme(v=>v==="light"?"neon":"light")}>Theme</button><MarketChart instrument={{...instrument,instrumentKey:key}} timeframe={frame} activeTool={tool} onDrawingComplete={()=>setTool("cursor")} magnet={false} hiddenDrawings={hidden} candlesOnly={hidden} chartTheme={theme} indicators={DEFAULT_CHART_INDICATORS} priceTasks={tasks} onFeedStatus={()=>{}} onPriceAction={(price,mode,drawing)=>setRequest({instrument,price,mode,drawing})}/>
  <div className="permanent-trade-footer"><div className="chart-trade-meta"><button className="chart-footer-pnl positive">+₹0.00</button><button className="chart-positions-trigger"><span>Stocks</span></button><div className="chart-price-actions-slot" ref={setHost}/></div></div>
  <PriceActions triggerHost={host} visible request={request} onClose={()=>setRequest(null)} onTasksChange={setTasks} onCreateAlert={()=>setRequest({instrument,price:110,mode:'alert'})} onFill={(task,price)=>{window.qaFills=(window.qaFills||[]).concat([{task,price}]);return null}} marketOpen={market} intradayOpen onNotice={message=>window.qaNotice=message}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
