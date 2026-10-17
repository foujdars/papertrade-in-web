const { build } = require('esbuild');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const bundle = await build({ stdin: { contents: `export { executePineSandbox, PINE_SANDBOX_DOCUMENT } from './lib/pine-sandbox';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'sandboxQA' });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : '<script src="/qa.js"></script>');
  }).listen(3268, '127.0.0.1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const external = [];
    page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:3268')) external.push(request.url()); });
    await page.goto('http://127.0.0.1:3268');
    const success = await page.evaluate(() => sandboxQA.executePineSandbox(`self.onmessage = e => postMessage({result: new Function('return 21 * 2')()});`, {}));
    assert.equal(success, 42);
    const dataResult = await page.evaluate(() => sandboxQA.executePineSandbox(`self.onmessage = e => {
      if(e.data.type==='data-response') postMessage({result:e.data.data});
      else postMessage({type:'data-request',id:1,request:{symbol:'TEST',timeframe:'D'}});
    };`, {}, undefined, 2000, async request => ({symbol:request.symbol,readOnly:true})));
    assert.deepEqual(dataResult,{symbol:'TEST',readOnly:true});
    const isolation = await page.evaluate(() => {
      localStorage.setItem('private-sentinel', 'must-not-be-visible');
      return sandboxQA.executePineSandbox(`self.onmessage = async () => {
        let network = false, storage = false;
        try { await fetch('https://example.com/private?test=1'); network = true; } catch {}
        try { const req = indexedDB.open('app'); await new Promise((resolve,reject) => { req.onsuccess=resolve; req.onerror=reject; }); storage = true; } catch {}
        postMessage({result: {network,storage,hasDocument:typeof document !== 'undefined',hasLocalStorage:typeof localStorage !== 'undefined',origin:self.origin}});
      };`, {});
    });
    assert.deepEqual(isolation, { network: false, storage: false, hasDocument: false, hasLocalStorage: false, origin: 'null' });
    const timeout = await page.evaluate(async () => {
      try { await sandboxQA.executePineSandbox('self.onmessage=()=>{while(true){}}', {}, undefined, 250); }
      catch (error) { return error.message; }
    });
    assert.match(timeout, /Execution stopped/);
    const cancelled = await page.evaluate(async () => {
      const controller = new AbortController();
      const run = sandboxQA.executePineSandbox('self.onmessage=()=>{while(true){}}', {}, controller.signal);
      setTimeout(() => controller.abort(), 100);
      try { await run; } catch (error) { return error.name; }
    });
    assert.equal(cancelled, 'AbortError');
    assert.equal(await page.locator('iframe').count(), 0);
    assert.deepEqual(external, []);
    console.log('Pine sandbox: generated code executes, network/storage unavailable, timeouts and cancellation terminate work, no frames leaked.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
