/* eslint-disable @typescript-eslint/no-require-imports -- Optional browser test runtime. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.route('**/api/**', route => route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [], connected: false } }));
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4317');
    await page.locator('.mobile-bottom-nav button').filter({ hasText: /^Charts$/ }).click();
    const toolbar = page.locator('.trade-cockpit .chart-controls');
    await toolbar.waitFor();
    for (const width of [320, 360, 390, 430, 768, 940]) {
      await page.setViewportSize({ width, height: 900 });
      for (const derivatives of [false, true]) {
        // Exercise the optional F&O button's footprint without depending on live discovery.
        await toolbar.evaluate((root, enabled) => {
          root.querySelector('.chart-derivatives-link')?.remove();
          if (enabled) {
            const button = document.createElement('button');
            button.className = 'chart-derivatives-link';
            button.textContent = '↗';
            root.querySelector('.chart-style-link').before(button);
          }
        }, derivatives);
        const layout = await toolbar.evaluate(root => {
          const rect = node => node.getBoundingClientRect();
          const search = rect(root.querySelector('.chart-symbol-search'));
          const style = rect(root.querySelector('.chart-style-link'));
          const previous = root.querySelector('.chart-derivatives-link') || root.querySelector('.chart-symbol-search');
          const timeframe = rect(root.querySelector('.compact-selector-trigger:not(.chart-functions-trigger)'));
          const tools = [...root.querySelectorAll('.chart-style-link, .chart-tools-trigger, .compact-selector-trigger')].map(rect);
          return {
            gap: style.left - rect(previous).right,
            right: rect(root).right - timeframe.right,
            searchWidth: search.width,
            fits: tools.every((tool, i) => tool.width > 0 && tool.right <= innerWidth && (!i || tool.left >= tools[i - 1].right)),
            overflow: root.scrollWidth > root.clientWidth,
          };
        });
        assert.ok(layout.gap >= 11.5, `Search/tool gap at ${width}px, F&O=${derivatives}: ${JSON.stringify(layout)}`);
        assert.ok(layout.right <= 6 && layout.right >= 0, 'Tools align to the right padding');
        assert.ok(layout.searchWidth >= 90 && layout.fits && !layout.overflow, 'Search and every tool fit without overlap');
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await toolbar.getByRole('button', { name: 'Chart type', exact: true }).click();
    await page.getByRole('dialog', { name: 'Chart type', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close chart type menu' }).click();
    await toolbar.getByRole('button', { name: 'Open drawing tools' }).click();
    await page.getByRole('dialog', { name: 'Drawing tools', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close drawing tools', exact: true }).click();
    if (process.env.TOOLBAR_SCREENSHOT) await page.screenshot({ path: process.env.TOOLBAR_SCREENSHOT });
    console.log('PASS: right-aligned mobile tools, search separation, optional F&O, six widths, chart and drawing menus.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
