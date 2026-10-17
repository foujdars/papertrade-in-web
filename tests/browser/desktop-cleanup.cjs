const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.CHART_QA_OUTPUT_DIR||'work/desktop-cleanup-qa');fs.mkdirSync(output,{recursive:true});
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
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());let body={ok:true,quotes:{},candles:[],instruments:[],underlyings:[],items:[],rows:[],connected:false,lists:{gainers:[],losers:[]}};
 if(u.pathname==='/api/upstox/ipos')body={ok:true,fetchedAt:new Date().toISOString(),ipos:Array.from({length:4},(_,i)=>({id:'issue-'+i,symbol:'ISSUE'+i,name:['Bonfiglioli Transmissions IPO','Sahajanand Medical Technologies IPO','Tonbo Imaging India IPO','Long Company Research Technologies IPO'][i],status:'open',issueType:'regular',industry:'Technology',issueSizeCrore:250,minimumPrice:100,maximumPrice:110,biddingStartDate:'2026-10-15',biddingEndDate:'2026-10-30',totalSubscription:2.54,gmpAmount:5,gmpPercent:4.55,details:{allotmentDate:'2026-11-02',listingDate:'2026-11-04'}}))};
 return route.fulfill({json:body});});
 await page.goto('http://127.0.0.1:3286/');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:40000});
 await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.desktopCleanup==='true');
 assert.equal(await page.locator('.top-actions .funds-button').count(),1);assert.equal(await page.locator('.header-wallet-button,.api-button').count(),0);
 await page.getByRole('button',{name:'More options',exact:true}).click();const more=page.locator('.more-menu-panel');await more.waitFor();
 assert.equal(await more.getByRole('button',{name:'Wallet',exact:true}).count(),0);assert.equal(await more.locator('.tools-menu-secondary').count(),0);assert.equal(await more.getByRole('button',{name:'Coach',exact:true}).count(),0);await page.keyboard.press('Escape');
 for(const width of [1024,1440,1920]){
 await page.setViewportSize({width,height:1000});await page.locator('.main-nav').getByRole('button',{name:'Positions',exact:true}).click();
 const positions=page.getByRole('region',{name:'Open positions',exact:true});await positions.waitFor();
 const bounds=await page.locator('.desktop-positions-page').boundingBox(),nav=await page.locator('.main-nav').boundingBox();
 assert.ok(bounds.width>=width-1&&bounds.y>=nav.y+nav.height-2&&bounds.height>700,JSON.stringify({bounds,nav}));assert.equal(await page.locator('.main-nav .nav-active').count(),1);
 await page.keyboard.press('Escape');await positions.waitFor({state:'hidden'});
 await page.locator('.main-nav').getByRole('button',{name:'IPOs',exact:true}).click();await page.locator('.ipo-compact-card').first().waitFor();
 const cards=await page.locator('.ipo-compact-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
 assert.equal(cards.length,4);assert.ok(Math.abs(cards[0].y-cards[1].y)<1);assert.ok(cards[2].y>cards[0].y+cards[0].h);assert.ok(cards[1].x-cards[0].x-cards[0].w>=23);
 const top=await page.locator('.ipo-view-tabs').boundingBox(),controls=await page.locator('.ipo-discovery-controls').boundingBox();assert.ok(Math.abs(top.y-controls.y)<6,JSON.stringify({top,controls}));assert.ok(await page.locator('.ipo-discovery-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:path.join(output,`ipo-${width}.png`)});
 if(width===1440){await page.locator(".theme-toggle").click();await page.waitForFunction(()=>document.querySelector(".terminal-shell")?.dataset.theme==="neon");await page.screenshot({path:path.join(output,"ipo-dark.png")});}
 }
 await page.setViewportSize({width:390,height:900});await page.waitForFunction(()=>!document.querySelector('.terminal-shell')?.dataset.desktopCleanup);
 assert.equal(await page.locator('.header-wallet-button').count(),1,'Mobile header is retained');
 assert.equal(await page.locator('.top-actions .api-button').count(),1,'Mobile broker control is retained');
 assert.deepEqual(errors,[]);console.log('PASS desktop IPO spacing and toolbar at 1024/1440/1920, full-page positions, Escape/nav state and deduplicated header; mobile controls unchanged.');
 }finally{await browser.close();await vite.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
