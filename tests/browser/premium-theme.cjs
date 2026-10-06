/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const luminance = hex => {
  let colour = hex.trim().replace('#', '');
  if (colour.length === 3) colour = [...colour].map(v => v + v).join('');
  const values = colour.match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
(async () => {
  const url = process.env.APP_URL || 'http://127.0.0.1:3230';
  const server = process.env.APP_URL ? null : spawn('node_modules/.bin/vinext', ['start', '--port', '3230'], { stdio: 'ignore' });
  if (server) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await fetch(url); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
  }
  const launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) {
    const pkg = require(process.env.CHROMIUM_PACKAGE), engine = pkg.default || pkg;
    launch.executablePath = await engine.executablePath(); launch.args = engine.args;
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.route('**/api/**', r => r.fulfill({ json: { ok: true, quotes: {}, underlyings: [], instruments: [], candles: [], entries: [], ipos: [] } }));
    await page.goto(url);
    await page.locator('.launch-disclaimer').waitFor({ state: 'hidden', timeout: 30000 });
    for (const theme of ['neon', 'light']) {
      await page.setViewportSize({ width: 1280, height: 844 });
      await page.getByRole('button', { name: 'Home', exact: true }).first().click();
      await page.getByRole('button', { name: theme === 'neon' ? 'Use dark theme' : 'Use light theme', exact: true }).click();
      await page.waitForFunction(t => document.querySelector('.terminal-shell').dataset.theme === t && localStorage.getItem('papertrade-theme') === t, theme);
      await page.reload();
      await page.waitForFunction(t => document.querySelector('.terminal-shell')?.dataset.theme === t, theme);
      const tokens = await page.locator('.terminal-shell').evaluate(el => Object.fromEntries(['ink', 'muted', 'surface', 'soft', 'gain-text', 'loss-text', 'action-buy', 'action-sell'].map(key => [key, getComputedStyle(el).getPropertyValue('--' + key).trim()])));
      for (const background of ['surface', 'soft']) for (const text of ['ink', 'muted', 'gain-text', 'loss-text']) assert.ok(contrast(tokens[text], tokens[background]) >= 4.5, `${theme}: ${text} on ${background}`);
      for (const action of ['action-buy', 'action-sell']) assert.ok(contrast('#ffffff', tokens[action]) >= 4.5, `${action} white label`);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        for (const name of ['Home', 'Charts', 'Watchlist', 'News', 'IPO', 'Fundamental Analysis', 'P&L']) {
          const buttons = page.getByRole('button', { name: name === 'IPO' ? /^IPOs?$/ : name, exact: true });
          let clicked = false;
          for (const button of await buttons.all()) if (await button.isVisible()) { await button.click(); clicked = true; break; }
          assert.ok(clicked, `${name} navigation visible at ${width}px`);
          assert.equal(await page.locator('.terminal-shell').getAttribute('data-theme'), theme);
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: saved theme survives reload; text/action contrast and all seven navigation destinations work in both themes at 320–1280px.');
  } finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
