const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const {createServer}=await import('vite');
 const vite=await createServer({configFile:false,cacheDir:'node_modules/.vite-chart-appearance-qa',root:process.cwd(),appType:'custom',optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react','protobufjs']},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:3275,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'appearance-regressions',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles:[],quotes:{}}));return;}
  if(req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await server.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.terminal-shell{display:block!important;height:100dvh}.price-chart-wrap,.price-chart,.chart-stack{height:700px!important}</style><div id="root"></div><script type="module" src="/tests/browser/chart-appearance.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}}]});await vite.listen();const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:3275');await page.waitForFunction(()=>window.qaSeries?.data().length===180);
  await page.evaluate(()=>window.qaAppearance({upColor:'#0000ff',wickUpColor:'#00ff00',borderUpColor:'#ff00ff',lineColor:'#abcdef',backgroundColor:'#fffaf0',textColor:'#121212',verticalGrid:false,horizontalGrid:false,crosshairVisible:false,scaleMode:'log',invertScale:true,scaleMarginTop:27,scaleMarginBottom:3}));
  await page.waitForFunction(()=>window.qaChart.options().layout.background.color==='#fffaf0');
  await page.evaluate(()=>{window.qaChart.timeScale().setVisibleLogicalRange({from:20,to:90});window.qaChart.priceScale('right').setAutoScale(false);window.qaChart.priceScale('right').setVisibleRange({from:60,to:170});});
  const before=await page.evaluate(()=>({time:window.qaChart.timeScale().getVisibleLogicalRange(),price:window.qaChart.priceScale('right').getVisibleRange()}));
  await page.evaluate(()=>window.qaAppearance({backgroundColor:'#fefefd'}));await page.waitForFunction(()=>window.qaChart.options().layout.background.color==='#fefefd');
  const after=await page.evaluate(()=>({time:window.qaChart.timeScale().getVisibleLogicalRange(),price:window.qaChart.priceScale('right').getVisibleRange(),auto:window.qaChart.priceScale('right').options().autoScale}));
  assert.deepEqual(after.time,before.time,'appearance edits preserve the historical viewport');assert.equal(after.auto,false);assert.deepEqual(after.price,before.price,'appearance edits preserve manual price zoom');
  await page.evaluate(()=>window.qaTick());await page.waitForFunction(()=>window.qaChart.priceScale('right').options().scaleMargins.top===.27);assert.equal(await page.evaluate(()=>window.qaChart.priceScale('right').options().scaleMargins.bottom),.03);
  await page.evaluate(()=>window.qaOrder(true));await page.waitForFunction(()=>window.qaChart.priceScale('right').options().scaleMargins.bottom===.15);assert.equal(await page.evaluate(()=>window.qaChart.priceScale('right').options().scaleMargins.top),.27);
  await page.evaluate(()=>window.qaOrder(false));await page.waitForFunction(()=>window.qaChart.priceScale('right').options().scaleMargins.bottom===.03);
  await page.evaluate(()=>window.qaCompare(true));await page.waitForFunction(()=>window.qaChart.priceScale('right').options().mode===2);await page.evaluate(()=>window.qaCompare(false));await page.waitForFunction(()=>window.qaChart.priceScale('right').options().mode===1);
  await page.evaluate(()=>window.qaStyle('line'));await page.waitForFunction(()=>window.qaSeries.seriesType()==='Line'&&window.qaSeries.options().color==='#abcdef');
  await page.evaluate(()=>window.qaPrimary('#00ccaa'));await page.waitForFunction(()=>window.qaSeries.options().color==='#abcdef');
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.chart-stack').dataset.desktopTools==='false');
  assert.deepEqual(await page.evaluate(()=>{const chart=window.qaChart.options();return[chart.layout.background.color,chart.layout.textColor,window.qaSeries.options().color,chart.grid.vertLines.visible,chart.grid.horzLines.visible,chart.crosshair.vertLine.visible,chart.rightPriceScale.invertScale];}),['#ffffff','#65708a','#00ccaa',true,true,true,false]);
  await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>window.qaChart.options().layout.background.color==='#fefefd');await page.evaluate(()=>window.qaPlatform('android'));await page.waitForFunction(()=>document.querySelector('.chart-stack').dataset.desktopTools==='false');assert.equal(await page.evaluate(()=>window.qaSeries.options().color),'#00ccaa');assert.equal(await page.evaluate(()=>window.qaChart.options().layout.background.color),'#ffffff');
  await page.evaluate(()=>window.qaPlatform('web'));await page.waitForFunction(()=>window.qaChart.options().layout.background.color==='#fefefd');await page.evaluate(()=>window.qaStyle('volume-candles'));await page.waitForFunction(()=>window.qaSeries.seriesType()==='Candlestick'&&window.qaSeries.data()[0]?.color==='#b8b8ff');
  assert.deepEqual(await page.evaluate(()=>{const point=window.qaSeries.data()[0];return[point.color,point.wickColor,point.borderColor];}),['#b8b8ff','#b8ffb8','#ffb8ff']);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.chart-stack').dataset.desktopTools==='false');assert.notEqual(await page.evaluate(()=>window.qaSeries.data()[0]?.color),'#b8b8ff');assert.deepEqual(errors,[]);
  console.log('Chart appearance regression passed: manual viewport/scale preservation, live/bracket margins, comparison scale restoration, custom line precedence, volume tint, mobile and native restoration.');
 }finally{await browser.close();await vite.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
