const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.PINE_QA_OUTPUT_DIR||'work/pine-chart-fidelity-qa');fs.mkdirSync(output,{recursive:true});
const script=`//@version=6
indicator("Momentum and price",overlay=false)
plot(ta.ema(close,20),"Price EMA",color.orange,linewidth=2,force_overlay=true)
r=ta.rsi(close,14)
plot(r,"RSI area",color.new(color.purple,65),style=plot.style_area,histbase=50)
plot(ta.sma(r,5),"Stepped signal",color.blue,style=plot.style_stepline,trackprice=true)
hline(50,"Midpoint",color.gray,linestyle=hline.style_dotted,linewidth=2)
plotshape(ta.crossover(r,50),"Bullish turn",shape.triangleup,location.belowbar,color.green,force_overlay=true)
if barstate.islast
    label.new(bar_index-5,high,"Price overlay",force_overlay=true)
    label.new(bar_index-5,70,"Momentum pane")`;
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-pine-chart-fidelity',root:process.cwd(),appType:'custom',optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react','protobufjs','monaco-editor/esm/vs/editor/editor.api.js','monaco-editor/esm/vs/editor/editor.all.js']},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:3270,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'qa-pine-chart',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles:[],quotes:{}}));return;}
  if(req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await vite.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.terminal-shell{display:block!important;height:100dvh}.chart-stack{height:calc(100dvh - 28px)!important}.price-chart-wrap,.price-chart{height:100%!important}</style><div id="root"></div><script type="module" src="/tests/browser/pine-rebuild.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}}]});await server.listen();
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({source})=>{
   if(window.top!==window)return;
   localStorage.setItem('papertrade-pine-active-v2',JSON.stringify({source,name:'Momentum and price',inputs:{}}));
   localStorage.setItem('papertrade-study-drawings:NSE_EQ|INE002A01018',JSON.stringify([{id:'momentum-ray',studyId:'script',tool:'horizontal-ray',a:{time:1700000000+140*300+19800,value:50},b:{time:1700000000+145*300+19800,value:50},presentation:{color:'#2962ff',text:'Momentum 50'}}]));
  },{source:script});
  await page.goto('http://127.0.0.1:3270');
  await page.waitForFunction(()=>window.qaRenderer?.bundles.find(b=>b.id==='script')?.series.length>=3);
  await page.evaluate(()=>window.qaRenderer.chart.timeScale().setVisibleLogicalRange({from:90,to:165}));
  const actual=await page.evaluate(()=>{const b=window.qaRenderer.bundles.find(b=>b.id==='script');return {types:b.series.map(s=>s.seriesType()),panes:b.seriesPanes,labels:b.pine.data.labels.map(l=>l.text),overlay:b.pineOverlay.data.labels.map(l=>l.text),step:b.series[2].options().lineType,track:b.series[2].options().priceLineVisible};});
  assert.deepEqual(actual.types,['Line','Baseline','Line']);assert.deepEqual(actual.panes,[0,2,2]);assert.deepEqual(actual.labels,['Momentum pane']);assert.deepEqual(actual.overlay,['Price overlay']);assert.equal(actual.step,1);assert.equal(actual.track,true);
  const coordinates=await page.evaluate(()=>{const b=window.qaRenderer.bundles.find(b=>b.id==='script'),chart=window.qaRenderer.chart,series=b.series[1],host=document.querySelector('.lightweight-chart').getBoundingClientRect();const pane=chart.panes()[b.pane].getHTMLElement().getBoundingClientRect();return {x:host.left+chart.timeScale().timeToCoordinate(1700000000+150*300+19800),y:pane.top+series.priceToCoordinate(50)};});
  await page.mouse.move(coordinates.x,coordinates.y);await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.chart-oscillator-tag')?.textContent)-50)<1);
  await page.mouse.click(coordinates.x,coordinates.y);
  const toolbar=page.getByRole('toolbar',{name:'Selected drawing actions'});await toolbar.waitFor();
  await toolbar.getByRole('button',{name:'Drawing settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Drawing settings'});await settings.getByRole('tab',{name:'Coordinates',exact:true}).click();
  await settings.getByLabel('Value for point 1',{exact:true}).fill('55');await settings.getByRole('button',{name:'Apply',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|INE002A01018'))[0].a.value),55);
  await toolbar.getByRole('button',{name:'Finish editing drawing',exact:true}).click();
  await page.getByRole('button',{name:'Open Pine Editor',exact:true}).click();await page.locator('.monaco-editor').waitFor();await page.locator('.pine-code-loading').waitFor({state:'hidden'});
  await page.screenshot({path:path.join(output,'mixed-overlay-area-desktop.png')});
  await page.getByRole('button',{name:'Close Pine Editor',exact:true}).click();await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'mixed-overlay-area-mobile.png')});
  await page.evaluate(()=>{const b=window.qaRenderer.bundles.find(b=>b.id==='script');window.qaDetached=[b.pine,b.pineOverlay];});
  await page.getByRole('button',{name:'Remove Pine script',exact:true}).first().click();await page.waitForFunction(()=>!window.qaRenderer.bundles.some(b=>b.id==='script'));
  assert.equal(await page.evaluate(()=>window.qaDetached.every(p=>p.chart===undefined&&Object.keys(p.data).length===0)),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: actual Baseline area, steps/tracking, force_overlay plot/object routing, oscillator crosshair values, editable horizontal ray on correct scale, desktop/mobile canvas and detached primitive cleanup.');
 }catch(error){const page=browser.contexts()[0]?.pages()[0];await page?.screenshot({path:path.join(output,'failure.png')});throw error;}finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
