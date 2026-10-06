/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/analysis-inline-list.fixture.jsx'], outfile: 'fixture.js', bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, file]) => fs.readFileSync('app/' + file, 'utf8')).join('\n') + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? js : `<style>${css.replace(/@import[^;]+;/g, '')}</style><div class="terminal-shell" data-theme="light" style="--mobile-header-height:0px"><div id="root"></div></div><script src="/fixture.js"></script>`); });
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
    assert.deepEqual(await page.locator('.fa-tabs button').allTextContents(), ['Screener', 'Peer comparison', 'Top stocks']);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await all.click();
      assert.equal(await all.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.fa-company-review').count(), 0);
      assert.equal(await page.locator('.fa-inline-list').evaluate(el => getComputedStyle(el).position), 'static');
      await passed.click();
      assert.equal(await passed.getAttribute('aria-pressed'), 'true');
      assert.equal(await all.getAttribute('aria-pressed'), 'false');
      assert.match(await page.locator('.fa-pagination').innerText(), /302 results/);
      assert.equal(await page.getByRole('button', { name: 'Fundamental status filter', exact: true }).count(), 0);
      assert.equal(await page.locator('.fa-drawer-head').count(), 0);
      assert.equal(await page.locator('.fa-filters').evaluate(el => { const [search, industry] = el.children; return Math.abs(search.getBoundingClientRect().top - industry.getBoundingClientRect().top) < 1; }), true);
      await page.getByRole('button', { name: 'View STOCK0 analysis', exact: true }).click();
      await page.getByRole('dialog', { name: 'STOCK0 analysis', exact: true }).waitFor();
      assert.equal(await page.locator('.fa-company-review').count(), 1);
      assert.ok(await page.locator('.fa-review-dialog').evaluate(el => { const rect = el.getBoundingClientRect(); return rect.left === 0 && rect.top === 0 && Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1; }), 'Analysis fills viewport');
      await page.getByRole('button', { name: 'Close company analysis', exact: true }).click();
      assert.equal(await passed.getAttribute('aria-pressed'), 'true');
      await all.click();
      await page.getByLabel('Search fundamental companies').fill('STOCK407');
      await page.waitForFunction(() => document.querySelector('.fa-pagination')?.textContent.includes('1 results'));
      assert.equal(await page.locator('.fa-results tbody tr').count(), 1);
      await all.click();
      assert.ok(await page.locator('.fa-inline-list').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1), 'List fits viewport');
      const pending = page.getByRole('button', { name: '408 pending', exact: true });
      await pending.click();
      assert.equal(await pending.getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('.fa-pagination').innerText(), /408 results/);
      await page.getByRole('button', { name: 'Peer comparison', exact: true }).click();
      const peers = page.getByRole('region', { name: 'Peer comparison desk' });
      assert.equal(await peers.locator('select').count(), 0);
      assert.equal(await peers.locator('.research-picker, .research-chips, .research-caption, .research-section-head').count(), 0);
      await page.getByRole('button', { name: 'Compare industry', exact: true }).click();
      await page.getByRole('option').first().click();
      await peers.getByRole('button', { name: /Compare against peers/ }).click();
      const picker = page.getByRole('dialog', { name: 'Compare against peers', exact: true });
      await picker.waitFor();
      await picker.getByLabel('Search peers').fill('Company 003');
      await picker.getByRole('checkbox', { name: 'Compare Company 003', exact: true }).check();
      await picker.getByRole('button', { name: 'Done', exact: true }).click();
      assert.match(await peers.locator('.research-selection').innerText(), /STOCK3/);
      await page.getByRole('button', { name: 'Peer metric groups', exact: true }).click();
      await page.getByRole('option', { name: 'Valuation', exact: true }).click();
      assert.match(await peers.locator('.research-matrix thead').innerText(), /Valuation/);
      assert.equal(await peers.locator('.research-peer-select-row').evaluate(el => { const [companies, metrics] = el.children; return Math.abs(companies.getBoundingClientRect().top - metrics.getBoundingClientRect().top) < 1; }), true);
      await page.getByRole('button', { name: 'Screener', exact: true }).click();
      await page.getByRole('button', { name: 'Top stocks', exact: true }).click();
      const top = page.getByRole('region', { name: 'Top stocks discovery' });
      assert.equal(await top.locator('.research-section-head, .research-scan-note, .research-method, .research-exclusions').count(), 0);
      assert.equal(await top.locator('select').count(), 0);
      assert.equal(await top.locator('.research-discovery-overview').evaluate(el => new Set([...el.children].map(child => child.getBoundingClientRect().top)).size), 1, 'Four summary cards share one row');
      assert.equal(await top.locator('.research-scan-controls').evaluate(el => new Set([...el.querySelectorAll(':scope > .modern-select')].map(child => child.getBoundingClientRect().top)).size), 1, 'Scan selectors share one row');
      for (const [name, option] of [['Candidate pool', '48 companies'], ['Minimum daily turnover', 'At least ₹5 Cr'], ['Per-industry limit', '5']]) {
        await top.getByRole('button', { name, exact: true }).click();
        await page.getByRole('option', { name: option, exact: true }).click();
        assert.match(await top.getByRole('button', { name, exact: true }).innerText(), new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      assert.ok(await top.locator('.research-scan-controls').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1), 'Scan controls fit viewport');
      await page.getByRole('button', { name: 'Screener', exact: true }).click();
    }
    assert.equal(await page.getByText('Import CSV', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Fundamental Analysis', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: compact filters, Pending, full-screen analysis, modern peer/metric pickers and three tabs at 320–1280px.');
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
