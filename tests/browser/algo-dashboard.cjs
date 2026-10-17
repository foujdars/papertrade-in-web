const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.ALGO_QA_OUTPUT_DIR||'work/algo-dashboard-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite');
 const vite=await createServer({configFile:false,cacheDir:'node_modules/.vite-algo-dashboard-qa',root:process.cwd(),appType:'custom',optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react','protobufjs','monaco-editor/esm/vs/editor/editor.api.js','monaco-editor/esm/vs/editor/editor.all.js']},define:{'process.env':'{}'},resolve:{alias:{'@':process.cwd()}},server:{host:'127.0.0.1',port:3291,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'qa-framework',enforce:'pre',resolveId(id){if(['next/image','next/link','next/dynamic','@capacitor/app'].includes(id))return '\0'+id;},load(id){if(id==='\0next/image')return `import React from 'react';export default function Image({fill,priority,unoptimized,fetchPriority,...props}){return React.createElement('img',props)}`;if(id==='\0next/link')return `import React from 'react';export default function Link(props){return React.createElement('a',props)}`;if(id==='\0next/dynamic')return `import React from 'react';export default function dynamic(loader){const C=React.lazy(()=>loader().then(m=>({default:m.default||m})));return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))}`;if(id==='\0@capacitor/app')return `export const App={addListener:async()=>({remove:async()=>{}}),getState:async()=>({isActive:true}),getLaunchUrl:async()=>undefined,exitApp:async()=>{}}`;}},{name:'qa-chart-rebuild' ,configureServer(server){server.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles:[],quotes:{}}));return;}
  if(!req.url?.startsWith('/?')&&req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await server.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/tests/browser/mobile-chart-dashboard.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}}]});
 await vite.listen();
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const [name,width,native,touch] of [['desktop',1440,false,false],['mobile',390,false,true],['native',390,true,true]]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:touch,hasTouch:touch}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
   await page.route('**/api/**',route=>{const url=new URL(route.request().url());return route.fulfill({json:url.pathname==='/api/upstox/candles'?{ok:true,segments:['historical'],candles:Array.from({length:150},(_,i)=>({time:1789712700+i*300,open:100+Math.sin(i/5)*3,close:102+Math.sin(i/5)*3,high:108+Math.sin(i/5)*2,low:94+Math.sin(i/5)*2,volume:1000}))}:{ok:true,quotes:{},underlyings:[],instruments:[],candles:[],items:[],connected:false,rows:[],lists:{gainers:[],losers:[],active:[],volume:[],high52:[],low52:[],upper:[],lower:[]}}});});
   await page.goto('http://127.0.0.1:3291/'+(native?'?native=1':''));await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});
   await page.getByRole('button',{name:'More options',exact:true}).click();
   await page.getByRole('button',{name:'Algo Trading',exact:true}).click();
   const algo=page.getByRole('region',{name:'Algo Trading',exact:true});await algo.waitFor();
   assert.equal(await page.locator('.terminal-shell').getAttribute('data-section'),'algo');
   await algo.getByRole('button',{name:'Try demo',exact:true}).click();
   await algo.getByRole('tab',{name:'Backtest results',exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('.algo-tabs [aria-selected="true"]')?.textContent==='Backtest results');
   await page.screenshot({path:path.join(output,`dashboard-algo-${name}.png`)});
   await page.getByRole('button',{name:'Close Algo Trading',exact:true}).click();await algo.waitFor({state:'detached'});
   assert.equal(await page.locator('.terminal-shell').getAttribute('data-section'),'home');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${name} dashboard fits viewport`);assert.deepEqual(errors,[]);await context.close();console.log(`Actual TradingDashboard ${name}: Home three-dot entry, demo backtest and return to Home passed.`);
  }
 }catch(error){const failed=browser.contexts()[0]?.pages()[0];console.error(await failed?.locator('body').innerText().catch(()=>''));await failed?.screenshot({path:path.join(output,'algo-dashboard-debug.png')});throw error;}finally{await browser.close();await vite.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
