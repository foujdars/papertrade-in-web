/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/analysis-inline-list.fixture.jsx'], outfile: 'fixture.js', bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, file]) => fs.readFileSync('app/' + file, 'utf8')).join('\n') + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? js : `<style>${css.replace(/@import[^;]+;/g, '')}</style><div id="root"></div><script src="/fixture.js"></script>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    let launch = { headless: true };
    if (process.env.CHROMIUM_PACKAGE) { const mod = require(process.env.CHROMIUM_PACKAGE), packaged = mod.default || mod; launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args.filter(arg => arg !== '--single-process') }; }
    browser = await chromium.launch(launch);
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const all = page.getByRole('button', { name: '408 companies', exact: true });
    const passed = page.getByRole('button', { name: '302 passed gates', exact: true });
    await all.waitFor();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await all.click();
      assert.equal(await all.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.fa-company-review').count(), 0);
      assert.equal(await page.locator('.fa-inline-list').evaluate(el => getComputedStyle(el).position), 'static');
      await passed.click();
      assert.equal(await passed.getAttribute('aria-pressed'), 'true');
      assert.equal(await all.getAttribute('aria-pressed'), 'false');
      await page.getByText('302 passed companies in this list', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'View STOCK0 analysis', exact: true }).click();
      await page.getByRole('dialog', { name: 'STOCK0 analysis', exact: true }).waitFor();
      assert.equal(await page.locator('.fa-company-review').count(), 1);
      await page.getByRole('button', { name: 'Close company analysis', exact: true }).click();
      assert.equal(await passed.getAttribute('aria-pressed'), 'true');
      await all.click();
      await page.getByLabel('Search fundamental companies').fill('STOCK407');
      await page.getByText('1 companies in this list', { exact: true }).waitFor();
      assert.equal(await page.locator('.fa-results tbody tr').count(), 1);
      await all.click();
      assert.ok(await page.locator('.fa-inline-list').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1), 'List fits viewport');
    }
    assert.equal(await page.getByText('Import CSV', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Fundamental Analysis', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: inline list, active 408/302 count filters, symbol detail dialog, search and mobile/desktop widths.');
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
