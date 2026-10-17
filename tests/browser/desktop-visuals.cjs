const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path'),esbuild=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const {PNG}=require('pngjs');
function samePixels(a,b,label){const left=PNG.sync.read(a),right=PNG.sync.read(b);assert.equal(left.width,right.width);assert.equal(left.height,right.height);let changed=0;for(let i=0;i<left.data.length;i++)if(Math.abs(left.data[i]-right.data[i])>1)changed++;assert.equal(changed,0,label+' (one-level GPU rounding tolerance)');}
(async()=>{
 const files=['HomeWorkspace','HomeDerivatives','MarketMovers','EquityWatch'];
 const config={entryPoints:['tests/browser/desktop-visuals.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}};
 const after=await esbuild.build(config),before=await esbuild.build({...config,plugins:[{name:'baseline',setup(b){b.onLoad({filter:/components\/(HomeWorkspace|HomeDerivatives|MarketMovers|EquityWatch)\.tsx$/},args=>({contents:cp.execFileSync('git',['show',`origin/main:components/${path.basename(args.path)}`],{encoding:'utf8'}),loader:'tsx',resolveDir:path.dirname(args.path)}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const now=Date.parse('2026-10-16T09:00:00Z'),iso=new Date(now).toISOString(),start=Date.parse('2026-10-16T03:45:00Z')/1000;
 const gain={symbol:'BHARTIARTL',name:'Bharti Airtel',price:1785.4,change:3.28,volume:120000,instrumentKey:'NSE_EQ|TEST',previousClose:1750,quoteAt:iso,source:'upstox'},loss={...gain,symbol:'RELIANCE',change:-2.12,instrumentKey:'NSE_EQ|LOSS'};
 let historyCalls=0;
 const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');
 if(u.pathname.startsWith('/api/')){
 res.setHeader('Content-Type','application/json');let body={ok:false};
 if(u.pathname==='/api/upstox/candles'){historyCalls++;const key=u.searchParams.get('instrumentKey'),base=key.includes('Nifty Bank')?56200:key.includes('SENSEX')?81000:key.includes('Nifty 50')?24700:1750;body={ok:true,candles:Array.from({length:60},(_,i)=>({time:start+i*300,close:base+Math.sin(i/5)*20+i/5,open:base,high:base+50,low:base-50}))};}
 if(u.pathname.includes('/market/movers'))body={ok:true,status:'verified',asOf:iso,lists:{gainers:[gain,{...gain,symbol:'NOHISTORY',instrumentKey:undefined}],losers:[loss],high52:[gain],active:[gain]}};
 if(u.pathname.includes('/equity-watch'))body={ok:true,rows:[gain,loss,{...gain,change:0}]};
 if(u.pathname.includes('/india-pulse'))body={ok:true,breadth:{advance:2000,decline:1000},tape:Array.from({length:40},(_,i)=>({t:(start+i*300)*1000,advance:1500+i*10,decline:1200-i*5})),vix:{price:13.6,change:-1,changePercent:-7},vixCheckedAt:now,flows:[{date:'2026-10-15',fii:-1200,dii:1500},{date:'2026-10-16',fii:500,dii:400}],sessionLive:true};
 if(u.pathname.includes('/sector-heat'))body={ok:true,sectors:[{id:'bank',label:'Bank',change:.8,watch:'bank'},{id:'it',label:'IT',change:-.4,watch:'it'}]};
 if(u.pathname.includes('/option-chain'))body={ok:true,expiries:['2026-10-22'],fetchedAt:iso,rows:[{strikePrice:25000,expiry:'2026-10-22',call:{marketData:{oi:100000,ltp:100}},put:{marketData:{oi:150000,ltp:90}}}]};
 return res.end(JSON.stringify(body));
 }
 if(u.pathname.startsWith('/qa-')){res.setHeader('Content-Type','application/javascript');return res.end(u.pathname==='/qa-before.js'?before.outputFiles[0].text:after.outputFiles[0].text);}
 res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}*{animation:none!important;transition:none!important}</style><div id="root"></div><script src="/qa-${u.searchParams.has('baseline')?'before':'after'}.js"></script>`);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;browser=await chromium.launch({headless:true,executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process')});
 const url=`http://127.0.0.1:${server.address().port}`;fs.mkdirSync('outputs',{recursive:true});
 for(const width of (process.env.NATIVE_ONLY?[]:[390,768,1024,1440,1920])){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date(now)});await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 const beforeCalls=historyCalls;await page.goto(url);await page.getByText('BHARTIARTL',{exact:true}).first().waitFor();
 if(width<941){await page.clock.runFor(600);assert.equal(await page.locator('.desktop-price-line,.desktop-percent-gauge').count(),0);assert.equal(historyCalls,beforeCalls,'Mobile adds no history requests');const afterImage=await page.screenshot();await page.goto(url+'/?baseline');await page.getByText('BHARTIARTL',{exact:true}).first().waitFor();await page.clock.runFor(600);samePixels(await page.screenshot(),afterImage,`Mobile ${width}px matches baseline pixels`);}
 else{
 await page.waitForFunction(()=>document.querySelectorAll('.home-index-card .desktop-price-line svg').length===3);
 assert.ok(await page.locator('.desktop-stock-row .desktop-price-line svg').count()>0);
 const dimensions=await page.locator('.home-index-card').first().evaluate(el=>({card:el.getBoundingClientRect().width,span:el.querySelector('.desktop-price-line').getBoundingClientRect().width,svg:el.querySelector('.desktop-price-line svg').getBoundingClientRect().width,display:getComputedStyle(el.querySelector('.desktop-price-line')).display}));assert.ok(dimensions.svg>dimensions.card*.75,'Price line fills its card');
 assert.ok(await page.getByText('History unavailable',{exact:true}).count()>0,'Unknown history is never invented');
 for(const theme of ['light','neon']){
 if(theme==='neon')await page.getByRole('button',{name:'Theme',exact:true}).click();
 assert.ok(await page.locator('.home-dashboard-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Desktop fits the viewport');
 await page.screenshot({path:`outputs/desktop-visuals-${width}-${theme}.png`});
 }
 await page.getByRole('tab',{name:'Breadth & sectors',exact:true}).click();await page.getByRole('img',{name:/Nifty 50 rising share/}).waitFor();
 await page.getByRole('tab',{name:'F&O insights',exact:true}).click();await page.locator('.desktop-derivative-gauges svg').first().waitFor();assert.equal(await page.locator('.desktop-derivative-gauges svg').count(),2);
 }
 assert.deepEqual(errors,[]);await page.close();
 }
 for(const native of ['android','ios']){
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.clock.install({time:new Date(now)});await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
 const calls=historyCalls;await page.goto(url+'/?native='+native);await page.getByText('BHARTIARTL',{exact:true}).first().waitFor();await page.clock.runFor(600);
 assert.equal(await page.locator('.desktop-price-line,.desktop-percent-gauge,.desktop-derivative-gauges').count(),0);assert.equal(historyCalls,calls,'Native adds no desktop requests');const afterImage=await page.screenshot();
 await page.goto(url+'/?native='+native+'&baseline');await page.getByText('BHARTIARTL',{exact:true}).first().waitFor();await page.clock.runFor(600);const beforeImage=await page.screenshot();fs.writeFileSync(`outputs/${native}-before.png`,beforeImage);fs.writeFileSync(`outputs/${native}-after.png`,afterImage);samePixels(beforeImage,afterImage,`${native} matches baseline pixels`);await page.close();
 }
 console.log('PASS desktop real-history charts and gauges at 1024/1440/1920px in both themes; mobile 390/768 and Android/iOS remain visually equivalent with zero extra history requests.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
