const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.CHART_QA_OUTPUT_DIR||'work/chart-browser-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite');
 const vite=await createServer({configFile:false,cacheDir:'node_modules/.vite-chart-rebuild-qa',root:process.cwd(),appType:'custom',optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react','protobufjs','monaco-editor/esm/vs/editor/editor.api.js','monaco-editor/esm/vs/editor/editor.all.js']},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:3274,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'qa-chart-rebuild',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles:[],quotes:{}}));return;}
  if(req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await server.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.terminal-shell{display:block!important;height:100dvh}.price-chart-wrap,.price-chart,.chart-stack{height:780px!important}.qa-controls{height:40px;display:flex;gap:12px;padding:6px 12px;border-bottom:1px solid #e0e3eb}</style><div id="root"></div><script type="module" src="/tests/browser/chart-rebuild.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}}]});
 await vite.listen();
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{const key='papertrade-lwc-drawings-v1:NSE_EQ|CHART_REBUILD';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify([{id:'fib-qa',type:'fib-retracement',anchors:[{time:1700000000+50*300,price:110},{time:1700000000+110*300,price:130}],style:{lineColor:'#2962ff',lineWidth:1},options:{visible:true,locked:false,anchorTimeOffset:0}},{id:'reg-qa',type:'regression-trend',anchors:[{time:1700000000+60*300,price:110},{time:1700000000+130*300,price:130}],style:{lineColor:'#f23645',lineWidth:1},options:{visible:true,locked:false,anchorTimeOffset:0}}]));});
  await page.goto('http://127.0.0.1:3274');await page.waitForFunction(()=>window.qaRenderer?.data.length===180&&window.qaManager?.getAllDrawings().length===2);
  const settings=page.getByRole('dialog',{name:'Chart settings',exact:true});
  await page.getByRole('button',{name:'Chart settings',exact:true}).click();
  const original=await page.evaluate(()=>window.qaSeries.options().upColor);
  await settings.getByLabel('Up candle color',{exact:true}).fill('#123456');await settings.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.qaSeries.options().upColor),original);
  await page.getByRole('button',{name:'Chart settings',exact:true}).click();await settings.getByLabel('Up candle color',{exact:true}).fill('#123456');await settings.getByLabel('Show wicks',{exact:true}).uncheck();
  await settings.getByRole('tab',{name:'Scales and lines',exact:true}).click();await settings.getByLabel('Price scale mode',{exact:true}).selectOption('log');await settings.getByLabel('Invert scale',{exact:false}).check();await settings.getByLabel('Top scale margin',{exact:true}).fill('22');
  await settings.getByRole('tab',{name:'Canvas',exact:true}).click();await settings.getByLabel('Chart background color',{exact:true}).fill('#fffaf0');await settings.getByLabel('Vertical grid lines',{exact:true}).uncheck();await settings.getByRole('button',{name:'OK',exact:true}).click();
  await page.waitForFunction(()=>window.qaSeries.options().upColor==='#123456');
  assert.deepEqual(await page.evaluate(()=>{const s=window.qaSeries.options(),c=window.qaChart.options();return[s.wickVisible,c.layout.background.color,c.grid.vertLines.visible,c.rightPriceScale.mode,c.rightPriceScale.invertScale,c.rightPriceScale.scaleMargins.top];}),[false,'#fffaf0',false,1,true,.22]);
  await page.reload();await page.waitForFunction(()=>window.qaSeries?.options().upColor==='#123456');
  await page.getByRole('button',{name:'Chart settings',exact:true}).click();await settings.getByRole('button',{name:'Defaults',exact:true}).click();await settings.getByRole('button',{name:'OK',exact:true}).click();
  await page.getByRole('button',{name:'Data window',exact:true}).click();const data=page.getByRole('complementary',{name:'Chart data window'});await data.waitFor();
  const canvas=await page.locator('.price-chart').boundingBox(),panel=await data.boundingBox();assert.ok(canvas.x+canvas.width<=panel.x+1,'data panel must reserve chart width');assert.match(await data.innerText(),/Latest candle/);assert.match(await data.innerText(),/EMA 21/);assert.match(await data.innerText(),/RSI/);
  await page.evaluate(()=>window.qaChart.timeScale().fitContent());
  await page.waitForFunction(()=>window.qaChart.timeScale().timeToCoordinate(window.qaSeries.data()[145].time)>0);
  const selected=await page.evaluate(()=>{const candle=window.qaRenderer.data[145],pane=window.qaChart.panes()[0].getHTMLElement().getBoundingClientRect();return{x:pane.x+window.qaChart.timeScale().timeToCoordinate(window.qaSeries.data()[145].time),y:pane.y+window.qaSeries.priceToCoordinate(candle.close),close:candle.close};});
  await page.mouse.move(selected.x,selected.y);await page.waitForFunction(()=>document.querySelector('.desktop-chart-data')?.textContent.includes('Selected candle'));assert.ok((await data.innerText()).includes(new Intl.NumberFormat('en-IN',{maximumFractionDigits:8}).format(selected.close)));
  await page.screenshot({path:path.join(output,'advanced-chart-data-window.png')});
  await page.getByRole('button',{name:'Object tree',exact:true}).click();const tree=page.getByRole('dialog',{name:'Drawing object tree'});await tree.getByLabel('Search drawing objects',{exact:true}).fill('Fib');assert.equal(await tree.locator('.drawing-object-row').count(),1);
  await tree.getByRole('button',{name:'Hide matching drawings',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaManager.getAllDrawings().find(d=>d.id==='fib-qa').options.userHidden),true);await tree.getByRole('button',{name:'Show matching drawings',exact:true}).click();
  await tree.getByRole('button',{name:/Settings for Fib/}).click();const drawing=page.getByRole('dialog',{name:'Drawing settings',exact:true});await drawing.getByRole('tab',{name:'Levels',exact:true}).click();await drawing.getByLabel('Fibonacci level 2',{exact:true}).fill('0.25');await drawing.getByLabel('Reverse Fibonacci levels',{exact:true}).check();await drawing.getByLabel('Show Fibonacci prices',{exact:true}).check();await page.screenshot({path:path.join(output,'advanced-chart-fibonacci-settings.png')});await drawing.getByRole('button',{name:'Apply',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.qaManager.getAllDrawings().find(d=>d.id==='fib-qa').getPriceAtLevel(.25)),125);
  await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().find(d=>d.id==='fib-qa')?.fibOptions.reverseDirection===true);assert.equal(await page.evaluate(()=>window.qaManager.getAllDrawings().find(d=>d.id==='fib-qa').fibOptions.levels.includes(.25)),true);
  await page.getByRole('button',{name:'Functions',exact:true}).click();const functions=page.getByRole('dialog',{name:'Functions',exact:true});await functions.getByRole('button',{name:'Templates',exact:true}).click();await page.screenshot({path:path.join(output,'advanced-chart-indicator-templates.png')});await functions.getByRole('button',{name:'Close functions',exact:true}).click();
  await page.getByRole('button',{name:'Theme',exact:true}).click();await page.getByRole('button',{name:'Chart settings',exact:true}).click();await settings.getByRole('tab',{name:'Canvas',exact:true}).click();await page.screenshot({path:path.join(output,'advanced-chart-settings-dark.png')});await settings.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.chart-stack').dataset.desktopTools==='false');assert.equal(await page.getByRole('button',{name:'Chart settings',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Data window',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Object tree',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.qaSeries.options().wickVisible),true);assert.equal(await page.evaluate(()=>window.qaChart.options().layout.background.color),'#0c142b');await page.screenshot({path:path.join(output,'advanced-chart-mobile-preserved.png')});
  await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>window.qaPlatform('android'));await page.waitForFunction(()=>document.querySelector('.chart-stack').dataset.desktopTools==='false');assert.equal(await page.getByRole('button',{name:'Chart settings',exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log('Integrated chart rebuild passed: real series/settings mapping, cancel/reload, data dock and hovered studies, Fibonacci geometry/persistence, object actions, templates, dark theme and mobile/native preservation.');
 }catch(error){const failed=browser.contexts()[0]?.pages()[0];console.error(await failed?.locator('body').innerText().catch(()=>''));await failed?.screenshot({path:path.join(output,'advanced-chart-debug.png')});throw error;}finally{await browser.close();await vite.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
