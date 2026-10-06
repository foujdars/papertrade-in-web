/* eslint-disable @typescript-eslint/no-require-imports -- Browser harness uses externally installed packages. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const rows = ['Bulk','Bulk','Bulk','Block','Block'].map((kind,i) => ({symbol:i<3?'ACC':'RELIANCE',name:i<3?'ACC':'Reliance',isin:'INE002A01018',client:`Client ${i}`,side:i%2?'Sell':'Buy',kind,qty:1000,price:100,value:100000,date:'2026-10-06'}));
  const css = [...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const bundle = await esbuild.build({entryPoints:['tests/browser/back-navigation.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'native-back-test',setup(build){build.onResolve({filter:/^next\/(image|link)$/},args=>({path:args.path,namespace:'qa-next'}));build.onLoad({filter:/.*/,namespace:'qa-next'},args=>({contents:`import React from 'react';export default function Adapter({children,unoptimized,priority,fill,...props}){return React.createElement('${args.path==='next/link'?'a':'img'}',props,children);}`,loader:'js',resolveDir:process.cwd()}));build.onResolve({filter:/^@capacitor\/core$/},()=>({path:'capacitor',namespace:'qa'}));build.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export class WebPlugin {} export const registerPlugin=()=>({addListener:async()=>({remove:async()=>{}})}); export const Capacitor={isNativePlatform:()=>new URL(location.href).searchParams.has("native"),getPlatform:()=>"web"};`,loader:'js'}));}}]});
  const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,rows,date:'2026-10-06',candles:[],instruments:[],quotes:{}}));}res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{overflow:auto}.terminal-shell{display:block;height:auto}.qa-dialog{width:340px}</style><div id="root"></div><script>window.process={env:{}};</script><script src="/qa.js"></script>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;launch.executablePath=await c.executablePath();launch.args=c.args;}
    browser=await chromium.launch(launch);
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    for(const native of [false,true]) {
      errors.length=0;page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(6000);
      if(process.env.TRACE_BACK){page.on('console',m=>{if(m.text().startsWith('TRACE'))console.log(native,m.text());});await page.addInitScript(()=>{for(const name of ['pushState','replaceState']){const old=history[name].bind(history);history[name]=(...args)=>{console.log('TRACE '+name+' '+JSON.stringify(args[0]));return old(...args);};}window.addEventListener('popstate',e=>console.log('TRACE pop '+JSON.stringify(e.state)),true);});}
      await page.goto(`http://127.0.0.1:${server.address().port}/${native?'?native':''}`);
      const screen=async name=>page.waitForFunction(name=>document.querySelector('main')?.dataset.screen===name,name);
      const back=async()=>{if(native)await page.evaluate(()=>window.qaBack());else await page.goBack();};
      const tab=name=>page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
      await page.getByRole('button',{name:'Open bulk deals, 3 deals',exact:true}).waitFor();
      assert.equal(await page.locator('.home-deal-count svg').count(),4,'Each count has its own symbol and arrow');
      await tab('Watchlist');await page.locator('.qa-scroll').evaluate(el=>el.scrollTop=225);
      await tab('Chart A');await page.getByRole('button',{name:'Daily',exact:true}).click();await tab('Chart B');
      await back();await screen('Chart A');assert.match(await page.locator('h1').textContent(),/1D/);
      await back();await screen('Watchlist');await page.waitForFunction(()=>document.querySelector('.qa-scroll').scrollTop===225);
      if(!native){await page.goForward();await screen('Chart A');await back();await screen('Watchlist');}
      await back();await screen('Home');
      for(const name of ['News','Analysis','IPO','Bot','P&L']){await tab(name);await back();await screen('Home');}
      // Back and Escape close only the latest popup, including a menu above a native dialog.
      for(const mode of ['back','escape']){
        await page.getByRole('button',{name:'Drawer',exact:true}).click();await page.getByRole('button',{name:'Dialog',exact:true}).click();
        await page.getByRole('button',{name:'Timeframe',exact:true}).click();await page.locator('.timeframe-menu').waitFor();
        const dismiss=async()=>{if(mode==='escape')await page.keyboard.press('Escape');else await back();};
        await dismiss();await page.locator('.timeframe-menu').waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog',{name:'Nested dialog'}).count(),1);
        await dismiss();await page.getByRole('dialog',{name:'Nested dialog'}).waitFor({state:'hidden'});assert.equal(await page.getByRole('region',{name:'Drawer'}).count(),1);
        await dismiss();await page.getByRole('region',{name:'Drawer'}).waitFor({state:'hidden'});await screen('Home');
      }
      // Manual close cleans history, including StrictMode's effect replay.
      await tab('Watchlist');await page.getByRole('button',{name:'Drawer',exact:true}).click();await page.getByRole('button',{name:'Close drawer',exact:true}).click();
      await page.waitForFunction(()=>!history.state?.papertradeLayer);await back();await screen('Home');
      await page.getByRole('button',{name:'Open block deals, 2 deals',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Block',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.home-deal-group').count(),1);
      await page.getByRole('button',{name:'Show RELIANCE deals',exact:true}).click();assert.equal(await page.locator('.home-deal-row').count(),2);
      await back();await page.locator('.home-deal-row').waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog',{name:'Bulk and block deals',exact:true}).count(),1);
      await page.getByRole('button',{name:'Open RELIANCE chart',exact:true}).click();await screen('Chart RELIANCE');await back();await screen('Home');assert.equal(await page.getByRole('dialog').count(),0,'Leaving a drawer never resurrects it');
      await tab('Watchlist');await page.getByRole('button',{name:'Drawer',exact:true}).click();await page.getByRole('button',{name:'Open chart',exact:true}).click();await screen('Chart A');await back();await screen('Watchlist');await back();await screen('Home');
      assert.deepEqual(errors,[]);
    }
    await page.setViewportSize({width:1280,height:900});
    await page.goto(`http://127.0.0.1:${server.address().port}/?full&symbol=RELIANCE&timeframe=5m`);
    await page.locator('.advanced-symbol-picker > button').click();await page.getByPlaceholder('Search NSE symbols').fill('INFY');await page.locator('.advanced-symbol-menu').getByRole('button').first().click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('symbol')==='INFY'&&!history.state?.papertradeLayer);
    await page.locator('.advanced-timeframes').getByRole('button',{name:'1D',exact:true}).click();
    await page.getByRole('button',{name:'Bar replay for INFY',exact:true}).click();await page.locator('.bar-replay-tools > button').first().click();
    await page.goBack();await page.getByRole('dialog',{name:'Choose chart timeframe',exact:true}).waitFor({state:'hidden'});await page.getByRole('dialog',{name:'Bar replay',exact:true}).waitFor();
    await page.goBack();await page.getByRole('dialog',{name:'Bar replay',exact:true}).waitFor({state:'hidden'});assert.ok(new URL(page.url()).searchParams.has('full'));
    await page.getByTitle('Open buy paper order').click();await page.getByRole('dialog',{name:'Place buy paper order',exact:true}).waitFor();await page.goBack();await page.getByRole('dialog',{name:'Place buy paper order',exact:true}).waitFor({state:'hidden'});assert.ok(new URL(page.url()).searchParams.has('full'));
    await page.getByRole('link',{name:'Back to trading dashboard',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('full')&&url.searchParams.get('symbol')==='INFY'&&url.searchParams.get('timeframe')==='1D');
    assert.deepEqual(errors,[]);
    console.log('PASS: Browser/Android event Back, Forward, nested dialogs/menus, Escape, manual close, StrictMode, chart/timeframe/list restoration, all sections, exact deal counts and filtered drawers; standalone fullscreen chart menus, order ticket and return with the selected symbol/timeframe.');
  } finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
