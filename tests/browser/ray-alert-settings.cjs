const {setChartColor}=require('./chart-color-helper.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.RAY_QA_OUTPUT_DIR||'work/ray-alert-browser-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
const {createServer}=await import('vite');
const port=Number(process.env.RAY_QA_PORT)||3281;
const candles=Array.from({length:80},(_,i)=>({time:1782000000+i*86400,open:110,high:118,low:98,close:112,volume:1000}));
const cloudMock=`import {useState} from 'react';import {technicalConfigError} from '/lib/technical-alerts.ts';export function useCloudTechnicalAlerts(){const [rules,setRules]=useState(()=>JSON.parse(localStorage.getItem('qa-saved-rules')||'[]'));window.qaSavedRules=rules;return {rules,events:[],states:{},error:'',ready:true,message:'Server monitoring online',enablePush:async()=>null,save:async(config,instrument,editing)=>{if(window.qaSaveFailure)return 'Service unavailable. Nothing was saved.';const error=technicalConfigError(config);if(error)return error;const now=Date.now();const rule={...config,instrument,id:editing?.id||crypto.randomUUID(),revision:crypto.randomUUID(),createdAt:now,armedAt:now,expiresAt:now+config.days*86400000,status:'active'};setRules(old=>{const next=[rule,...old.filter(r=>r.id!==rule.id)];localStorage.setItem('qa-saved-rules',JSON.stringify(next));return next});return null;},toggle:async()=>null,remove:async()=>null,refresh:async()=>{}}}`;
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-ray-alert-rebuild-qa',root:process.cwd(),appType:'custom',resolve:{alias:{'@':process.cwd()}},optimizeDeps:{include:['react','react-dom/client','react-dom','react/jsx-dev-runtime','@capacitor/core','lightweight-charts-drawing','lightweight-charts','lucide-react']},server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/*']}},plugins:[{
 name:'deterministic-ray-services',enforce:'pre',
 resolveId(id){if(/upstox-live-feed(?:\.tsx?)?$/.test(id))return '\0qa-feed';if(/useCloudTechnicalAlerts(?:\.tsx?)?$/.test(id))return '\0qa-cloud';},
 load(id){if(id==='\0qa-feed')return 'export async function openUpstoxLiveFeed(){return ()=>{}}';if(id==='\0qa-cloud')return cloudMock;},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,candles,quotes:{}}));return;}
  if(req.url!=='/')return next();
  const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,file])=>fs.readFileSync('app/'+file,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const html=await vite.transformIndexHtml('/',`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.terminal-shell{display:block!important;height:100dvh}.price-chart-wrap,.price-chart,.chart-stack{height:650px!important}</style><div id="root"></div><script type="module" src="/tests/browser/ray-alert-settings.fixture.jsx"></script>`);
  res.setHeader('Content-Type','text/html');res.end(html);
 });}
}]});
await server.listen();
const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['notifications']}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const key='papertrade-lwc-drawings-v1:NSE_EQ|INE002A01018';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify([{id:'ray-test',type:'horizontal-ray',anchors:[{time:1782000000+55*86400,price:111.25}],style:{lineColor:'#6657ee',lineWidth:2},options:{visible:true,locked:false,anchorTimeOffset:0}}]));});
 await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1);
 const select=()=>page.evaluate(()=>window.qaManager.selectDrawing('ray-test'));
 await select();await page.getByRole('button',{name:'Drawing settings',exact:true}).click();const settings=page.getByRole('dialog',{name:'Drawing settings',exact:true});
 await settings.getByLabel('Line opacity',{exact:true}).fill('55');await settings.getByRole('button',{name:'Ray direction',exact:true}).click();await page.getByRole('option',{name:'Left',exact:true}).click();
 await settings.getByRole('tab',{name:'Text',exact:true}).click();await settings.getByLabel('Drawing text').fill('Resistance');await setChartColor(page,settings,'Text colour','#008800');await settings.getByRole('button',{name:'Bold text'}).click();await settings.getByRole('button',{name:'Italic text'}).click();await settings.getByRole('button',{name:'Font size',exact:true}).click();await page.getByRole('option',{name:'18 px',exact:true}).click();
 await settings.getByRole('tab',{name:'Coordinates',exact:true}).click();await settings.getByLabel('Price for point 1',{exact:true}).fill('113.50');await settings.getByRole('tab',{name:'Visibility',exact:true}).click();await settings.getByLabel('Visible on 5m',{exact:true}).uncheck();
 await page.screenshot({path:path.join(output,'ray-settings-visibility.png')});await settings.getByRole('button',{name:'Apply',exact:true}).click();
 const saved=()=>page.evaluate(()=>window.qaManager.getAllDrawings()[0].toJSON());let ray=await saved();assert.equal(ray.anchors[0].price,113.5);assert.equal(ray.options.opacity,55);assert.equal(ray.options.bold,true);assert.equal(ray.options.italic,true);assert.equal(ray.options.fontSize,18);assert.equal(ray.options.direction,'left');assert.equal(ray.options.textColor,'#008800');
 await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1);ray=await saved();assert.equal(ray.options.text,'Resistance');assert.equal(ray.options.visibilityMode,'selected');assert.equal(ray.options.timeframes.includes('5m'),false);
 await select();await page.getByRole('button',{name:'Create alert on drawing'}).click();const dialog=page.getByRole('dialog',{name:'Price action',exact:true});await dialog.getByRole('tab',{name:'Settings',exact:true}).waitFor();assert.equal(await dialog.getByLabel('Drawing alert price').inputValue(),'113.5');
 await dialog.getByRole('button',{name:'Condition',exact:true}).click();await page.getByRole('option',{name:'Crossing up',exact:true}).click();await dialog.getByRole('button',{name:'Trigger',exact:true}).click();await page.getByRole('option',{name:'Every new crossing',exact:true}).click();await dialog.getByLabel('Alert cooldown').fill('3');await dialog.getByRole('button',{name:'Expiration',exact:true}).click();await page.getByRole('option',{name:'After 30 days',exact:true}).click();
 await dialog.getByRole('tab',{name:'Message',exact:true}).click();await dialog.getByLabel('Alert name',{exact:true}).fill('Resistance break');await dialog.getByLabel('Alert message',{exact:true}).fill('Watch the resistance level');await dialog.getByRole('tab',{name:'Notifications',exact:true}).click();await dialog.getByRole('button',{name:'Enable notifications on this device'}).click();await page.getByText('Notification permission is enabled on this device.',{exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'ray-alert-notifications.png')});await dialog.getByRole('tab',{name:'Settings',exact:true}).click();await page.screenshot({path:path.join(output,'ray-create-alert.png')});
 await page.evaluate(()=>window.qaSaveFailure=true);await dialog.getByRole('button',{name:'Create alert',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.qaSavedRules.length),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-price-tasks-v1:local')||'[]').length),0);
 await page.evaluate(()=>window.qaSaveFailure=false);await dialog.getByRole('button',{name:'Create alert',exact:true}).click();await page.getByRole('dialog',{name:'Alerts',exact:true}).waitFor();const rule=await page.evaluate(()=>window.qaSavedRules[0]);assert.equal(rule.threshold,113.5);assert.equal(rule.condition,'crossingUp');assert.equal(rule.repeat,'repeat');assert.equal(rule.cooldown,3);assert.equal(rule.days,30);assert.equal(rule.alertName,'Resistance break');assert.equal(rule.message,'Watch the resistance level');assert.equal((await saved()).options.text,'Resistance');
 await page.reload();await page.waitForFunction(()=>window.qaSavedRules.length===1&&window.qaManager?.getAllDrawings().length===1);await select();await page.getByRole('button',{name:'Drawing settings',exact:true}).click();await settings.getByRole('tab',{name:'Text',exact:true}).click();await settings.getByLabel('Drawing text').fill('Discarded');await settings.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await saved()).options.text,'Resistance');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});await select();await page.getByRole('button',{name:'Drawing settings',exact:true}).click();await settings.getByRole('tab',{name:'Text',exact:true}).click();const b=await settings.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);assert.equal(await settings.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);if(width===390)await page.screenshot({path:path.join(output,'ray-settings-text.png')});await settings.getByRole('button',{name:'Cancel',exact:true}).click();}
 await page.getByRole('button',{name:'Theme',exact:true}).click();await select();await page.getByRole('button',{name:'Drawing settings',exact:true}).click();await settings.getByRole('tab',{name:'Style',exact:true}).click();await page.screenshot({path:path.join(output,'ray-settings-dark.png')});await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Draw horizontal ray',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.drawing-crosshair').hidden);const bounds=await page.locator('.lightweight-chart').boundingBox();await page.mouse.click(bounds.x+100,bounds.y+200);await page.waitForFunction(()=>window.qaManager.getAllDrawings().length===2);assert.equal(await page.evaluate(()=>window.qaManager.getAllDrawings().filter(d=>d.type==='horizontal-ray'&&d.anchors.length===1).length),2);
 await page.evaluate(()=>window.qaFrame('5m'));await page.waitForFunction(()=>{const drawing=window.qaManager?.getAllDrawings().find(d=>d.id==='ray-test');const viewport=drawing?.getViewport();return viewport&&drawing.getControlPoints(viewport).length===0;});
 const desktop=await browser.newPage({viewport:{width:1440,height:960},permissions:['notifications']});
 desktop.on('pageerror',error=>errors.push(error.message));
 await desktop.addInitScript(()=>localStorage.setItem('papertrade-lwc-drawings-v1:NSE_EQ|INE002A01018',JSON.stringify([{id:'ray-desktop',type:'horizontal-ray',anchors:[{time:1782000000+55*86400,price:111.25}],style:{lineColor:'#2962ff',lineWidth:2},options:{visible:true,locked:false,anchorTimeOffset:0}}])));
 await desktop.goto(`http://127.0.0.1:${port}`);await desktop.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1);
 await desktop.evaluate(()=>{const shell=document.querySelector('.terminal-shell');shell.dataset.platform='web';shell.dataset.section='trade';});
 await desktop.waitForFunction(()=>document.querySelector('.chart-stack')?.dataset.desktopTools==='true');
 await desktop.evaluate(()=>window.qaManager.selectDrawing('ray-desktop'));
 await desktop.getByRole('button',{name:'Drawing settings',exact:true}).click();
 const desktopSettings=desktop.getByRole('dialog',{name:'Drawing settings',exact:true});
 await desktopSettings.getByLabel('Line opacity',{exact:true}).fill('70');
 await desktopSettings.getByRole('tab',{name:'Coordinates',exact:true}).click();await desktopSettings.getByLabel('Price for point 1',{exact:true}).fill('114.75');
 await desktopSettings.getByRole('button',{name:'Apply',exact:true}).click();
 await desktop.evaluate(()=>window.qaManager.selectDrawing('ray-desktop'));
 await desktop.getByRole('button',{name:'Create alert on drawing',exact:true}).click();
 const desktopAlert=desktop.getByRole('dialog',{name:'Price action',exact:true});
 assert.equal(await desktopAlert.getByLabel('Drawing alert price').inputValue(),'114.75');
 await desktopAlert.getByRole('button',{name:'Create alert',exact:true}).click();
 await desktop.waitForFunction(()=>window.qaSavedRules?.length===1);
 assert.equal(await desktop.evaluate(()=>window.qaSavedRules[0].threshold),114.75);
 assert.equal(await desktop.evaluate(()=>window.qaManager.getAllDrawings()[0].options.opacity),70);
 await desktop.screenshot({path:path.join(output,'ray-desktop-created-alert.png')});
 assert.deepEqual(errors,[]);console.log('Ray settings + alert browser checks pass: style/text/coordinates/visibility persistence, exact edited level, condition/repeat/cooldown/expiry/message, save failure without fallback, manager/reload, cancellation, four widths, dark theme and rebuilt desktop exact-level alert creation.');
}catch(error){const failed=browser.contexts()[0]?.pages()[0];await failed?.screenshot({path:path.join(output,'ray-alert-debug.png')}).catch(()=>{});console.error(await failed?.locator('[role=dialog]').allTextContents().catch(()=>[]));throw error;}finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
