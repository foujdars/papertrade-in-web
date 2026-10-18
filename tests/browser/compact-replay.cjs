const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.CHART_QA_OUTPUT_DIR||'work/compact-replay-qa');fs.mkdirSync(output,{recursive:true});
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
 if(u.pathname==='/api/upstox/candles')body={ok:true,candles:Array.from({length:9},(_,i)=>({time:Date.parse('2026-10-16T03:45:00Z')/1000+i*300,open:100,high:105,low:95,close:100+Math.sin(i/5)*3,volume:1000})),segments:['historical','intraday']};
 return route.fulfill({json:body});};
 await page.route('**/api/**',mockApi);


 await page.goto('http://127.0.0.1:3286/');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});
 await page.locator('.main-nav').getByRole('button',{name:'Charts',exact:true}).click();await page.locator('.price-chart canvas').first().waitFor();
 await page.locator('.chart-statusbar-replay').click();const bar=page.getByRole('toolbar',{name:'Bar replay',exact:true}),transport=bar.getByRole('group',{name:'Replay playback'});
 await bar.getByText('1 / 8',{exact:true}).waitFor();assert.equal(await bar.getAttribute('data-compact'),'true');assert.equal(await transport.getByRole('button').count(),5);
 for(const button of await transport.getByRole('button').all()){assert.equal((await button.textContent()).trim(),'');assert.equal(await button.locator('svg').count(),1);assert.ok(await button.getAttribute('aria-label'));assert.ok(await button.getAttribute('title'));assert.ok((await button.boundingBox()).width<=28.1);}
 for(const speed of ['0.5×','1×','2×','4×','8×','10×']){const button=bar.getByRole('button',{name:speed,exact:true});await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');}await bar.getByRole('button',{name:'1×',exact:true}).click();
 assert.equal(await transport.getByRole('button',{name:'Previous candle',exact:true}).isDisabled(),true);assert.equal(await transport.getByRole('button',{name:'Restart replay',exact:true}).isDisabled(),true);
 await transport.getByRole('button',{name:'Next candle',exact:true}).click();await bar.getByText('2 / 8',{exact:true}).waitFor();
 await transport.getByRole('button',{name:'Previous candle',exact:true}).click();await bar.getByText('1 / 8',{exact:true}).waitFor();
 for(let i=0;i<7;i++)await transport.getByRole('button',{name:'Next candle',exact:true}).click();await bar.getByText('8 / 8',{exact:true}).waitFor();assert.equal(await transport.getByRole('button',{name:'Play replay',exact:true}).isDisabled(),true);assert.equal(await transport.getByRole('button',{name:'Next candle',exact:true}).isDisabled(),true);for(let i=0;i<7;i++)await transport.getByRole('button',{name:'Previous candle',exact:true}).click();await bar.getByText('1 / 8',{exact:true}).waitFor();
 await transport.getByRole('button',{name:'Play replay',exact:true}).click();await transport.getByRole('button',{name:'Pause replay',exact:true}).waitFor();await bar.getByText('2 / 8',{exact:true}).waitFor();await transport.getByRole('button',{name:'Pause replay',exact:true}).click();
 await transport.getByRole('button',{name:'Next candle',exact:true}).click();await bar.getByText('3 / 8',{exact:true}).waitFor();await transport.getByRole('button',{name:'Previous candle',exact:true}).click();await bar.getByText('2 / 8',{exact:true}).waitFor();
 await transport.getByRole('button',{name:'Restart replay',exact:true}).click();await bar.getByText('1 / 8',{exact:true}).waitFor();await transport.getByRole('button',{name:'Pause replay',exact:true}).click();
 for(const width of [941,1024,1440,1920]){await page.setViewportSize({width,height:900});assert.ok((await bar.boundingBox()).height<=38,'Replay uses one slim row');assert.ok(await bar.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Replay fits horizontally');await page.screenshot({path:path.join(output,`replay-${width}.png`)});}
 await page.setViewportSize({width:1024,height:768});await page.getByRole('button',{name:'Toggle paper trade ticket',exact:true}).click();assert.ok(await bar.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Replay fits beside trade ticket');await page.getByRole('button',{name:'Toggle paper trade ticket',exact:true}).click();
 await page.locator('.theme-toggle').click();await page.screenshot({path:path.join(output,'replay-dark.png')});
 await bar.getByRole('button',{name:'10×',exact:true}).click();await transport.getByRole('button',{name:'Play replay',exact:true}).click();await bar.getByText('Replay complete',{exact:true}).waitFor();assert.equal(await transport.getByRole('button',{name:'Play replay',exact:true}).isDisabled(),true);assert.equal(await transport.getByRole('button',{name:'Next candle',exact:true}).isDisabled(),true);
 await bar.getByRole('button',{name:'1×',exact:true}).click();
 await transport.getByRole('button',{name:'Restart replay',exact:true}).click();await bar.getByText('1 / 8',{exact:true}).waitFor();await transport.getByRole('button',{name:'Pause replay',exact:true}).click();
 await transport.getByRole('button',{name:'Exit replay',exact:true}).click();await bar.waitFor({state:'hidden'});await page.locator('.price-chart canvas').first().waitFor();
 await page.setViewportSize({width:390,height:844});await page.locator('.chart-statusbar-replay').click();await bar.getByText('1 / 8',{exact:true}).waitFor();assert.equal(await bar.getAttribute('data-compact'),null);assert.equal(await transport.getByRole('button',{name:'Restart replay',exact:true}).innerText(),'Again');assert.equal(await transport.getByRole('button',{name:'Exit replay',exact:true}).innerText(),'Exit');
 await transport.getByRole('button',{name:'Exit replay',exact:true}).click();assert.deepEqual(errors,[]);
 console.log('PASS compact replay: five icon controls, play/pause, stepping, restart, completion, exit, all speeds, 941–1920px, ticket, themes and retained mobile presentation.');
 }catch(error){await browser.contexts()[0]?.pages()[0]?.screenshot({path:path.join(output,'failure.png')});throw error;}finally{await browser.close();await vite.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
