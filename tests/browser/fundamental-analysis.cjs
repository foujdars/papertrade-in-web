const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const csv = `Name,ISIN Code,NSE Code,BSE Code,Industry,Pledged percentage,Return on equity,Average return on equity 3Years,Average return on equity 5Years,Return on capital employed,Average return on capital employed 3Years,Average return on capital employed 5Years,Debt to equity,Net Profit,Price to Earning,Industry PE,Profit growth 3Years,Profit growth 5Years,Sales growth 3Years,Sales growth 5Years,OPM,PEG Ratio,Current ratio,Quick ratio,Promoter holding,FII holding,DII holding
Reliance Industries,INE002A01018,RELIANCE,500325,Oil & Gas,0,15,16,17,18,19,20,0.3,200,20,20,12,13,14,15,12,1.1,2,1.5,50,10,10
Example Oil,INE123A01016,EXAMPLE,500001,Oil & Gas,0,14,15,16,17,18,19,0.4,150,18,20,10,11,12,13,10,1.2,1.5,1.1,45,12,8
Missing Data,INE456A01017,MISSING,500002,Engineering,0,,,,,,,,,,,,,,,,,,,,
`;

(async () => {
  const server = process.env.START_TEST_SERVER ? require("node:child_process").spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "3233", "--hostname", "127.0.0.1"], { stdio: "pipe" }) : null;
  if (server) {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch("http://127.0.0.1:3233"); if (response.ok) break; } catch {}
      if (attempt === 59) { server.kill(); throw new Error("Production test server did not start."); }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  let launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) {
    const mod = require(process.env.CHROMIUM_PACKAGE), packaged = mod.default || mod;
    launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [], candleRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*.supabase.co/**", route => route.abort());
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/upstox/candles") candleRequests.push(url);
      return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [], connected: false } });
    });
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3233");
    await page.locator(".main-nav").waitFor({ timeout: 60000 });
    const nav = await page.locator(".main-nav button").allTextContents();
    assert.deepEqual(nav.slice(-2), ["Fundamentals", "Bot"]);
    const open = async () => {
      const nav = page.viewportSize().width <= 940 ? ".mobile-bottom-nav" : ".main-nav";
      await page.locator(nav).getByRole("button", { name: /Fundamental/ }).click();
      await page.getByRole("heading", { name: "Fundamental Analysis", exact: true }).waitFor();
      await page.getByLabel("Import fundamental CSV").waitFor();
    };
    await open();
    await page.getByLabel("Financial data as of").fill("2026-03-31");
    await page.getByLabel("Import fundamental CSV").setInputFiles({ name: "fundamentals.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByText("3 companies", { exact: true }).waitFor();
    assert.match(await page.locator(".fa-run-summary").innerText(), /2 passed gates/);
    assert.match(await page.locator(".fa-run-summary").innerText(), /2026-03-31/);
    await page.locator(".fa-company-link").filter({ hasText: "Reliance Industries" }).click();
    const review = page.locator(".fa-company-review");
    assert.equal(await review.locator(".fa-metrics").evaluate(el => el.open), true);
    assert.equal(await review.locator(".fa-metrics dt").count(), 22);
    assert.deepEqual(await review.locator(".fa-metrics").evaluate(el => Object.fromEntries([...el.querySelectorAll("dt")].map(dt => [dt.textContent, dt.nextElementSibling.textContent]))), {
      ROE: "15%", ROCE: "18%", "Operating margin": "12%", "P/E": "20", PEG: "1.1",
      "Debt / equity": "0.3", "Current ratio": "2", "Quick ratio": "1.5", "Promoter holding": "50%", "Promoter pledge": "0%", "FII holding": "10%", "DII holding": "10%",
      "Quarterly sales (₹ Cr)": "Missing", "Quarterly sales growth": "Missing", "Sales TTM (₹ Cr)": "Missing", "Prior-year sales (₹ Cr)": "Missing", "Sales growth · 3Y": "14%",
      "Quarterly profit (₹ Cr)": "Missing", "Quarterly profit growth": "Missing", "Profit TTM (₹ Cr)": "200", "Prior-year profit (₹ Cr)": "Missing", "Profit growth · 3Y": "12%",
    });
    assert.equal(await review.locator("form").evaluate(el => getComputedStyle(el).display), "grid", "Legacy modal form styles must not override the compact review layout");
    assert.ok(await page.locator(".fa-results .fa-number").evaluateAll(cells => cells.every(cell => getComputedStyle(cell).textAlign === "right")));
    await review.getByLabel("Review decision").selectOption("approved");
    await review.getByLabel("Research notes").fill("Reviewed annual results");
    await review.getByRole("button", { name: "Save review", exact: true }).click();
    await page.getByText("Review saved on this browser.", { exact: true }).waitFor();
    await page.reload(); await page.locator(".main-nav").waitFor(); await open();
    await page.getByText("3 companies", { exact: true }).waitFor();
    await page.locator(".fa-company-link").filter({ hasText: "Reliance Industries" }).click();
    assert.equal(await review.getByLabel("Research notes").inputValue(), "Reviewed annual results");
    assert.equal(await review.getByLabel("Review decision").inputValue(), "approved");
    await page.getByRole("button", { name: "Rankings", exact: true }).click();
    assert.equal(await page.locator(".fa-results tbody tr").count(), 2);
    await page.getByRole("button", { name: "Peer comparison", exact: true }).click();
    await page.getByLabel("Compare industry").selectOption("Oil & Gas");
    assert.equal(await page.locator(".fa-peer-table thead th").count(), 4);
    assert.equal(await page.locator(".fa-peer-table tbody tr:not(.fa-peer-group)").count(), 23, "Keep the rating row and every existing peer metric");
    const peRow = page.locator(".fa-peer-table tbody tr").filter({ has: page.getByRole("rowheader", { name: "P/E", exact: true }) });
    assert.deepEqual(await peRow.locator("td").allTextContents(), ["19", "20", "18"]);
    assert.match(await page.locator(".fa-peer-table").innerText(), /Quarterly sales/);
    const checkboxes = page.locator(".fa-peer-picker input");
    await checkboxes.nth(0).uncheck(); await checkboxes.nth(1).uncheck();
    assert.equal(await page.locator(".fa-peer-table thead th").count(), 2);
    await checkboxes.nth(0).check();
    await page.getByRole("button", { name: "Company rating", exact: true }).click();
    await page.getByLabel("Company fundamentals JSON").fill('{"Name":"Unknown"}');
    await page.getByRole("button", { name: "Calculate rating", exact: true }).click();
    await review.getByRole("heading", { name: "Unknown", exact: true }).waitFor();
    assert.match(await review.innerText(), /0\.0/);
    assert.equal(await review.locator('option[value="approved"]').evaluate(option => option.disabled), true);
    await page.getByRole("button", { name: "Screener", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export audit", exact: true }).click();
    assert.equal((await download).suggestedFilename(), "papertrade-fundamental-audit.json");
    for (const width of [320, 390, 768, 900, 940, 941, 1024, 1280, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      // Check before clicking: Playwright would otherwise scroll hidden tabs into view.
      const nav = page.locator(width <= 940 ? ".mobile-bottom-nav" : ".main-nav");
      const hidden = await nav.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        return [...el.querySelectorAll("button")].filter(button => {
          const box = button.getBoundingClientRect();
          return box.width < 24 || box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.right > innerWidth + 1;
        }).map(button => button.textContent);
      });
      assert.deepEqual(hidden, [], `Navigation clips tabs at ${width}px`);
      await nav.getByRole("button", { name: "Bot", exact: true }).click();
      await page.getByRole("heading", { name: "Paper trading bot", exact: true }).waitFor();
      await open();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Body overflows at ${width}px`);
      assert.equal(await page.locator(".fundamental-workspace").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `Workspace overflows at ${width}px`);
      const labels = await nav.locator("button").allTextContents(); assert.deepEqual(labels.slice(-2), ["Fundamentals", "Bot"]);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Use neon dark theme" }).click();
    if (process.env.FUNDAMENTAL_SCREENSHOT) await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT, fullPage: true });
    await page.locator(".fa-results").getByRole("button", { name: "Open Reliance Industries chart", exact: true }).click();
    await page.locator(".workspace.section-trade").waitFor();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("symbol") === "RELIANCE");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("timeframe") === "1D");
    assert.ok(candleRequests.some(url => url.searchParams.get("instrumentKey") === "NSE_EQ|INE002A01018" && url.searchParams.get("timeframe") === "1D"));
    await open(); await page.getByText("3 companies", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".home-workspace").waitFor();
    assert.deepEqual(errors, []);
    console.log("Fundamentals verified: CSV worker, gates, reviews/reload, ranking, peers, rating, audit, NSE chart, all navigation tabs visible, Bot/Fundamentals open, light/dark and nine viewport sizes.");
  } finally { await browser.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
