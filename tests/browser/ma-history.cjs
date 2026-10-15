/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),http=require('node:http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const bundle=await esbuild.build({entryPoints:['tests/browser/indicator-studio.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'feed',setup(b){b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const start=Date.parse('2025-01-01T00:00:00Z')/1000;
 const bars=Array.from({length:600},(_,i)=>({time:start+i*86400,open:100+i*.2,high:102+i*.2,low:99+i*.2,close:101+i*.2,volume:1000}));
 let requests=0;
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://localhost'),before=Number(url.searchParams.get('before'));
   if(before){requests++;const older=bars.filter(c=>c.time<before).slice(-240);return res.end(JSON.stringify({ok:true,candles:older,history:{nextBefore:older[0]?.time,hasMore:older[0]?.time>start},segments:['historical']}));}
   return res.end(JSON.stringify({ok:true,candles:bars.slice(-240),segments:['historical']}));
  }
  res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script src="/qa.js"></script>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(()=>localStorage.setItem('papertrade-indicator-settings-v1',JSON.stringify({settings:{ma:{inputs:{length:200}}}})));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.qaCandles?.data().length===240);
  await page.evaluate(()=>window.qaTimeframe('1D'));
  await page.waitForTimeout(300);
  await page.evaluate(()=>window.qaChart.timeScale().setVisibleLogicalRange({from:60,to:239}));
  await page.getByRole('button',{name:'Functions',exact:true}).click();await page.getByLabel('Search indicators').fill('moving average');
  assert.equal(await page.locator('.indicator-card-name').first().getAttribute('aria-label'),'Apply Moving Average');
  const before=await page.evaluate(()=>window.qaChart.timeScale().getVisibleRange());
  const calls=requests;
  await page.getByRole('button',{name:'Apply Moving Average',exact:true}).click();await page.getByRole('button',{name:'Close functions',exact:true}).click();
  await page.waitForFunction(()=>window.qaCandles.data().length>240);
  assert.ok(requests>calls,'Warmup requests older data without a left scroll');
  await page.waitForTimeout(200);
  const result=await page.evaluate(()=>{const range=window.qaChart.timeScale().getVisibleRange(),ma=window.qaStudies.bundles.find(b=>b.id==='ma').series[0].data();return{range,first:ma[0].time,last:ma.at(-1).time};});
  assert.deepEqual(result.range,before,'Warmup preserves visible dates');
  assert.ok(result.first<=result.range.from,'200 MA spans the visible left edge once older data arrives');
  await page.waitForTimeout(400);assert.equal(requests,calls+1,'Stops fetching once visible warmup is covered');
  await page.close();
 }console.log('PASS: exact indicator search first, MA200 auto history, full visible coverage, preserved viewport and bounded fetch at phone/desktop widths');}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
