const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.CHART_QA_OUTPUT_DIR||'work/desktop-chart-space-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite');
 const vite=await createServer({configFile:false,cacheDir:'node_modules/.vite-mobile-dashboard-qa',root:process.cwd(),appType:'custom',optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react','protobufjs','monaco-editor/esm/vs/editor/editor.api.js','monaco-editor/esm/vs/editor/editor.all.js']},define:{'process.env':'{}'},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:3286,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'qa-framework',enforce:'pre',resolveId(id){if(['next/image','next/link','next/dynamic','@capacitor/app'].includes(id))return '\0'+id;},load(id){if(id==='\0next/image')return `import React from 'react';export default function Image({fill,priority,unoptimized,fetchPriority,...props}){return React.createElement('img',props)}`;if(id==='\0next/link')return `import React from 'react';export default function Link(props){return React.createElement('a',props)}`;if(id==='\0next/dynamic')return `import React from 'react';export default function dynamic(loader){const C=React.lazy(()=>loader().then(m=>({default:m.default||m})));return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}`;if(id==='\0@capacitor/app')return `export const App={addListener:async()=>({remove:async()=>{}}),getState:async()=>({isActive:true}),getLaunchUrl:async()=>undefined,exitApp:async()=>{}}`;}},{name:'qa-chart-rebuild' ,configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles:[],quotes:{}}));return;}
  if(!req.url?.startsWith('/?')&&req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].filter(([,f])=>f!=='desktop-chart-space.css').map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await server.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style id="chart-space-css">${fs.readFileSync("app/desktop-chart-space.css","utf8")}</style><div id="root"></div><script type="module" src="/tests/browser/mobile-chart-dashboard.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}}]});
 await vite.listen();

 const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;
 const browser=await chromium.launch({headless:true,executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process')});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);

 const mockApi=route=>{const u=new URL(route.request().url()),now=new Date().toISOString();
 const instruments=[{symbol:'RELIANCE',name:'Reliance Industries',instrumentKey:'NSE_EQ|INE002A01018',exchange:'NSE',assetType:'EQUITY',categories:['NIFTY 50'],price:100,change:1},{symbol:'INFY',name:'Infosys',instrumentKey:'NSE_EQ|INE009A01021',exchange:'NSE',assetType:'EQUITY',categories:['NIFTY 50'],price:100,change:-1}];
 let body={ok:true,quotes:Object.fromEntries(instruments.flatMap(i=>{const q={instrumentKey:i.instrumentKey,symbol:i.symbol,lastPrice:100,netChange:1,changePercent:1,open:98,high:105,low:95,previousClose:99,lastTradeAt:now,updatedAt:now,volume:10000,changeAvailable:true};return [[i.instrumentKey,q],[i.symbol,q]];})),instruments,underlyings:[{symbol:'NIFTY',name:'Nifty 50',instrumentKey:'NSE_INDEX|Nifty 50',underlyingType:'INDEX',optionContracts:1,futureContracts:0},{symbol:'RELIANCE',name:'Reliance Industries',instrumentKey:'NSE_EQ|INE002A01018',underlyingType:'EQUITY',optionContracts:1,futureContracts:0}],candles:[],items:[],rows:[],connected:false,lists:{gainers:[],losers:[]}};
 if(u.pathname==='/api/upstox/candles')body={ok:true,candles:Array.from({length:60},(_,i)=>({time:Date.parse('2026-10-16T03:45:00Z')/1000+i*300,open:100,high:105,low:95,close:100+Math.sin(i/5)*3,volume:1000})),segments:['historical','intraday']};
 return route.fulfill({json:body});};
 await page.route('**/api/**',mockApi);

 await page.goto('http://127.0.0.1:3286/');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});
 await page.locator('.main-nav').getByRole('button',{name:'Charts',exact:true}).click();
 await page.locator('.price-chart canvas').first().waitFor();
 const metrics=()=>page.evaluate(()=>{const box=s=>{const el=document.querySelector(s),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};};return {chart:box('.price-chart-wrap'),rail:box('.chart-body>.drawing-toolbar'),status:box('.chart-statusbar'),footer:box('.permanent-trade-footer'),header:box('.topbar'),area:box('.chart-area'),nav:box('.main-nav')};});
 const toggle=enabled=>page.evaluate(v=>document.querySelector('#chart-space-css').sheet.disabled=!v,enabled);
 for(const [width,height] of [[1024,768],[1280,800],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await toggle(false);await page.waitForTimeout(150);const before=await metrics();
  await toggle(true);await page.waitForTimeout(150);const after=await metrics();
  console.log(`Chart ${width}px: ${before.chart.height} → ${after.chart.height}px usable height`);
  assert.ok(after.chart.height>before.chart.height+25,'Chart gains usable height');
  assert.ok(after.rail.width<=42&&after.rail.scrollWidth<=after.rail.clientWidth,'Drawing rail stays narrow with no horizontal scroll');
  assert.ok(Math.abs(after.status.y-after.footer.y)<1,'Bottom controls share one row');
  assert.ok(after.area.right<=width&&after.area.bottom<=height+1,'Chart fits the viewport');
  assert.ok(after.nav.scrollWidth<=after.nav.clientWidth+1,'All main tabs fit');
  await page.screenshot({path:path.join(output,`chart-${width}.png`)});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Open Pine Editor',exact:true}).click();const editor=page.locator('.pine-editor');
 await editor.locator('.monaco-editor').waitFor();await editor.locator('.pine-code-loading').waitFor({state:'hidden'});
 assert.equal(await editor.getAttribute('data-layout'),'right','New wide desktop editor opens beside chart');
 let chart=await page.locator('.price-chart-wrap').boundingBox(),edit=await editor.boundingBox(),code=await editor.locator('.pine-content').boundingBox();
 assert.ok(chart.width>500&&edit.width>500&&code.height>300,'Both chart and code retain useful space');
 assert.equal(await page.locator('.chart-controls>.chart-floating-favourite').count(),1,'Favourite belongs in the toolbar, clear of the editor');
 await page.screenshot({path:path.join(output,'pine-right.png')});
 await editor.getByRole('button',{name:'Dock editor below chart'}).click();
 chart=await page.locator('.price-chart-wrap').boundingBox();edit=await editor.boundingBox();code=await editor.locator('.pine-content').boundingBox();
 assert.ok(chart.height>=250&&code.height>=140,'Bottom dock keeps readable code and chart');
 const splitter=page.getByRole('separator',{name:'Resize Pine Editor'}),value=Number(await splitter.getAttribute('aria-valuenow'));
 await splitter.focus();await page.keyboard.press('ArrowUp');assert.ok(Number(await splitter.getAttribute('aria-valuenow'))>value);
 await editor.getByRole('button',{name:'Compile',exact:true}).click();await editor.getByText('Compiled successfully. Select Add to chart to apply.',{exact:true}).waitFor({timeout:30000});
 await page.screenshot({path:path.join(output,'pine-bottom.png')});
 await editor.getByRole('button',{name:'Maximize editor'}).click();assert.equal(await editor.getAttribute('data-layout'),'fullscreen');
 await editor.getByRole('button',{name:'Restore editor size'}).click();await editor.getByRole('button',{name:'Close Pine Editor'}).click();
 await page.getByRole('button',{name:'Toggle paper trade ticket',exact:true}).click();assert.ok((await page.locator('.order-ticket').boundingBox()).width>=290,'Trade ticket keeps its space');
 await page.getByRole('button',{name:'Toggle paper trade ticket',exact:true}).click();
 await page.locator('.theme-toggle').click();await page.screenshot({path:path.join(output,'chart-dark.png')});
 await page.getByRole('button',{name:'Open Pine Editor',exact:true}).click();await editor.locator('.monaco-editor').waitFor();await page.screenshot({path:path.join(output,'pine-dark.png')});await editor.getByRole('button',{name:'Close Pine Editor'}).click();
 await page.reload();await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});await page.locator('.main-nav').getByRole('button',{name:'Charts',exact:true}).click();
 await page.getByRole('button',{name:'Open Pine Editor',exact:true}).click();await editor.locator('.monaco-editor').waitFor();assert.equal(await editor.getAttribute('data-layout'),'bottom','Saved docking choice survives reload');
 await editor.getByRole('button',{name:'Dock editor beside chart'}).click();await page.setViewportSize({width:1024,height:768});
 assert.ok(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Narrow desktop editor has no outer horizontal overflow');
 await editor.getByRole('tab',{name:'Help',exact:true}).click();await editor.getByRole('tab',{name:'Editor',exact:true}).click();
 await editor.getByRole('button',{name:'Close Pine Editor'}).click();
 await page.locator('.drawing-toolbar').getByRole('button',{name:'Delete drawings',exact:true}).scrollIntoViewIfNeeded();
 assert.ok(await page.locator('.drawing-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth),'All drawing tools scroll vertically without horizontal overflow');
 await page.evaluate(()=>localStorage.removeItem('papertrade.pine-editor.dock.v1'));await page.reload();await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});await page.locator('.main-nav').getByRole('button',{name:'Charts',exact:true}).click();
 await page.getByRole('button',{name:'Open Pine Editor',exact:true}).click();await editor.locator('.monaco-editor').waitFor();assert.equal(await editor.getAttribute('data-layout'),'bottom','New laptop layout defaults below chart');
 assert.ok((await editor.locator('.pine-content').boundingBox()).height>150,'Laptop default keeps usable code height');await editor.getByRole('button',{name:'Close Pine Editor'}).click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);const mobileAfter=await metrics();await toggle(false);const mobileBefore=await metrics();assert.deepEqual(mobileAfter,mobileBefore,'Mobile geometry remains unchanged');
 await toggle(true);await page.getByRole('button',{name:'Open Pine Editor',exact:true}).click();assert.equal(await editor.getAttribute('data-presentation'),'overlay');await editor.getByRole('button',{name:'Close Pine Editor'}).click();
 await page.goto('http://127.0.0.1:3286/?native=1');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Charts',exact:true}).click();await page.locator('.price-chart canvas').first().waitFor();
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(150);assert.equal(await page.locator('.terminal-shell').getAttribute('data-desktop-cleanup'),null);
 const nativeAfter=await metrics();await toggle(false);const nativeBefore=await metrics();assert.deepEqual(nativeAfter,nativeBefore,'Native app geometry stays unchanged even at desktop width');
 const touchContext=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true});const touchPage=await touchContext.newPage();touchPage.on('pageerror',e=>errors.push(e.message));await touchPage.route('**/api/**',mockApi);
 await touchPage.goto('http://127.0.0.1:3286/');await touchPage.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});await touchPage.locator('.main-nav').getByRole('button',{name:'Charts',exact:true}).click();await touchPage.locator('.price-chart canvas').first().waitFor();
 assert.equal(await touchPage.locator('.chart-body>.chart-floating-favourite').count(),1,'Touch desktop keeps its existing favourite position');assert.equal(await touchPage.locator('.chart-controls>.chart-floating-favourite').count(),0);
 const touchMetrics=()=>touchPage.evaluate(()=>['.chart-area','.drawing-toolbar','.chart-statusbar'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 const touchAfter=await touchMetrics();await touchPage.evaluate(()=>document.querySelector('#chart-space-css').sheet.disabled=true);assert.deepEqual(await touchMetrics(),touchAfter,'Coarse-pointer layout remains unchanged');await touchContext.close();
 assert.deepEqual(errors,[]);console.log('PASS desktop chart space: larger chart, slim scroll rail, one-row controls, responsive Pine docking/resizing/compile, trade ticket, themes and unchanged mobile, native and touch geometry.');
 }catch(error){await browser.contexts()[0]?.pages()[0]?.screenshot({path:path.join(output,'failure.png')});throw error;}finally{await browser.close();await vite.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
