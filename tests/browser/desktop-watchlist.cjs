const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.CHART_QA_OUTPUT_DIR||'work/desktop-watchlist-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite');
 const vite=await createServer({configFile:false,cacheDir:'node_modules/.vite-mobile-dashboard-qa',root:process.cwd(),appType:'custom',optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react','protobufjs','monaco-editor/esm/vs/editor/editor.api.js','monaco-editor/esm/vs/editor/editor.all.js']},define:{'process.env':'{}'},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:3286,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'qa-framework',enforce:'pre',resolveId(id){if(['next/image','next/link','next/dynamic','@capacitor/app'].includes(id))return '\0'+id;},load(id){if(id==='\0next/image')return `import React from 'react';export default function Image({fill,priority,unoptimized,fetchPriority,...props}){return React.createElement('img',props)}`;if(id==='\0next/link')return `import React from 'react';export default function Link(props){return React.createElement('a',props)}`;if(id==='\0next/dynamic')return `import React from 'react';export default function dynamic(loader){const C=React.lazy(()=>loader().then(m=>({default:m.default||m})));return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}`;if(id==='\0@capacitor/app')return `export const App={addListener:async()=>({remove:async()=>{}}),getState:async()=>({isActive:true}),getLaunchUrl:async()=>undefined,exitApp:async()=>{}}`;}},{name:'qa-chart-rebuild' ,configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles:[],quotes:{}}));return;}
  if(!req.url?.startsWith('/?')&&req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await server.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/tests/browser/mobile-chart-dashboard.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}}]});
 await vite.listen();

 const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;
 const browser=await chromium.launch({headless:true,executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process')});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);

 await page.route('**/api/**',route=>{const u=new URL(route.request().url()),now=new Date().toISOString();
 const instruments=[{symbol:'RELIANCE',name:'Reliance Industries',instrumentKey:'NSE_EQ|INE002A01018',exchange:'NSE',assetType:'EQUITY',categories:['NIFTY 50'],price:100,change:1},{symbol:'INFY',name:'Infosys',instrumentKey:'NSE_EQ|INE009A01021',exchange:'NSE',assetType:'EQUITY',categories:['NIFTY 50'],price:100,change:-1}];
 let body={ok:true,quotes:Object.fromEntries(instruments.flatMap(i=>{const q={instrumentKey:i.instrumentKey,symbol:i.symbol,lastPrice:100,netChange:1,changePercent:1,open:98,high:105,low:95,previousClose:99,lastTradeAt:now,updatedAt:now,volume:10000,changeAvailable:true};return [[i.instrumentKey,q],[i.symbol,q]];})),instruments,underlyings:[{symbol:'NIFTY',name:'Nifty 50',instrumentKey:'NSE_INDEX|Nifty 50',underlyingType:'INDEX',optionContracts:1,futureContracts:0},{symbol:'RELIANCE',name:'Reliance Industries',instrumentKey:'NSE_EQ|INE002A01018',underlyingType:'EQUITY',optionContracts:1,futureContracts:0}],candles:[],items:[],rows:[],connected:false,lists:{gainers:[],losers:[]}};
 if(u.pathname==='/api/upstox/candles')body={ok:true,candles:Array.from({length:60},(_,i)=>({time:Date.parse('2026-10-16T03:45:00Z')/1000+i*300,open:100,high:105,low:95,close:100+Math.sin(i/5)*3,volume:1000})),segments:['historical','intraday']};
 return route.fulfill({json:body});});
 await page.goto('http://127.0.0.1:3286/');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});
 await page.locator('.terminal-shell').evaluate(el=>el.dataset.motion='full');
 const depthCard=page.locator('.home-index-card').first();
 await depthCard.hover();await page.waitForTimeout(220);
 assert.notEqual(await depthCard.evaluate(el=>getComputedStyle(el).transform),'none','Desktop cards lift on hover');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await depthCard.evaluate(el=>getComputedStyle(el).transform),'none','Reduced motion removes the card lift');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.main-nav').getByRole('button',{name:'Watchlist',exact:true}).click();
 const list=page.locator('.workspace.section-watchlist');await list.locator('.instrument-row').first().waitFor();
 const reliance=list.locator('.instrument-row').filter({has:page.locator('.instrument-name b').filter({hasText:/^RELIANCE$/})});
 await reliance.locator('.desktop-watchlist-trend svg').waitFor();
 // Desktop depth must respect both the app motion preference and the OS preference.
 await page.locator('.terminal-shell').evaluate(el=>el.dataset.motion='full');
 await reliance.hover();
 await page.waitForTimeout(220);
 assert.notEqual(await reliance.evaluate(el=>getComputedStyle(el).boxShadow),'none','Hovered list rows have subtle depth');
 assert.match(await reliance.evaluate(el=>getComputedStyle(el).transitionProperty),/box-shadow/);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.ok(!await reliance.evaluate(el=>getComputedStyle(el).transitionProperty.includes('box-shadow')),'OS reduced motion disables added transitions');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.terminal-shell').evaluate(el=>el.dataset.motion='reduced');
 assert.ok(!await reliance.evaluate(el=>getComputedStyle(el).transitionProperty.includes('box-shadow')),'App reduced motion disables added transitions');
 await page.locator('.terminal-shell').evaluate(el=>el.dataset.motion='full');
 assert.match(await reliance.locator('.desktop-watchlist-facts').textContent(),/Open98Day range95 – 105Prev\. close99Volume/);
 assert.equal(await page.locator('.desktop-price-line small').count(),0,'No session timestamps or guidance captions');
 for(const width of [1024,1440,1920]){
 await page.setViewportSize({width,height:1000});
 const boxes=await reliance.evaluate(el=>{const box=s=>{const r=el.querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};};return {name:box('.instrument-name'),chart:box('.desktop-watchlist-trend'),facts:box('.desktop-watchlist-facts'),price:box('.instrument-price')};});
 assert.ok(boxes.chart.x>=boxes.name.right&&boxes.facts.x>=boxes.chart.right&&boxes.price.x>=boxes.facts.right,JSON.stringify(boxes));
 assert.ok(await list.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Watchlist fits');
 if(width===1440)await page.locator('.theme-toggle').click();
 await page.screenshot({path:path.join(output,`watchlist-${width}.png`)});
 }
 await page.getByRole('tab',{name:/^Indices/}).click();
 await list.locator('.fno-symbol-row .desktop-watchlist-trend svg').first().waitFor();
 assert.equal(await list.locator('.fno-symbol-row .desktop-watchlist-facts').count(),1,'Indices have the same quote facts');
 await page.getByRole('tab',{name:/^F&O stocks/}).click();
 await list.locator('.fno-symbol-row .desktop-watchlist-trend svg').first().waitFor();
 await page.getByRole('tab',{name:/^NIFTY 50(?:\s|$)/}).click();
 await reliance.locator('.instrument-name').click();await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='trade');
 await page.setViewportSize({width:390,height:900});await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Watchlist',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='watchlist');
 assert.equal(await page.locator('.desktop-watchlist-trend,.desktop-watchlist-facts').count(),0,'Mobile row unchanged');
 assert.deepEqual(errors,[]);console.log('PASS desktop watchlist: central observed price lines, quote facts, 1024/1440/1920px, themes, chart navigation, no session captions and unchanged mobile rows.');
 }finally{await browser.close();await vite.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
