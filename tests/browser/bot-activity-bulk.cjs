/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const source = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BotActivity}from'./components/BotActivity';import{readGlobalAccount}from'./lib/global-order-engine';
  function App(){const[account,setAccount]=useState(()=>({...readGlobalAccount(null),events:Array.from({length:25},(_,i)=>({id:'entry-'+i,botId:'BTCUSD',symbol:'BTCUSD',kind:'OPEN',at:1800000000000+i,contracts:1,price:100,pnl:0,fee:1,detail:'Entry '+i}))}));window.qaAccount=account;window.qaCalls??=0;return <BotActivity trading={{account,busy:false,transact:async fn=>{window.qaCalls++;if(window.qaFail)return false;setAccount(fn(account));return true;}}}/>};createRoot(document.getElementById('root')).render(<App/>);`;
  const built = await esbuild.build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = fs.readFileSync('app/bot-workspace.css', 'utf8');
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/qa.js' ? built.outputFiles[0].text : `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('summary').click();
      const rows = page.locator('li input[type="checkbox"]');
      assert.equal(await rows.count(),20);
      await rows.nth(0).check(); await rows.nth(1).check();
      await page.evaluate(() => { window.qaFail = true; });
      await page.getByRole('button',{name:'Delete selected (2)',exact:true}).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.locator('li input:checked').count(),2,'Failure retains selection');
      await page.evaluate(() => { window.qaFail = false; });
      await page.getByRole('button',{name:'Delete selected (2)',exact:true}).click();
      await page.waitForFunction(() => window.qaAccount.deletedBotActivityIds?.length===2);
      assert.equal(await page.evaluate(() => window.qaAccount.events.length),25,'Accounting events are retained');
      assert.equal(await page.evaluate(() => window.qaCalls),2,'One transaction per batch, including retry');
      await page.getByRole('checkbox',{name:'Select all shown activity',exact:true}).check();
      await page.getByRole('button',{name:'Clear selection',exact:true}).click();
      assert.equal(await page.locator('li input:checked').count(),0);
      await page.getByRole('button',{name:'Show more activity',exact:true}).click();
      assert.equal(await rows.count(),23);
      await page.getByRole('checkbox',{name:'Select all shown activity',exact:true}).check();
      await page.getByRole('button',{name:'Delete selected (23)',exact:true}).click();
      await page.getByText('No bot activity to show.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(() => window.qaAccount.events.length),25);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
      await page.close();
    }
    console.log('PASS: bulk selection, retry, clear, show more, delete all shown and accounting preservation at mobile/desktop widths');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
