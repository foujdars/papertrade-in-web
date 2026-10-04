const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const underlyings = [
  { symbol: "NIFTY", name: "Nifty 50", instrumentKey: "NSE_INDEX|Nifty 50", underlyingType: "INDEX", optionContracts: 10, futureContracts: 0 },
  { symbol: "RELIANCE", name: "Reliance Industries", instrumentKey: "NSE_EQ|INE002A01018", underlyingType: "EQUITY", optionContracts: 10, futureContracts: 1, futures: [{ instrumentKey: "NSE_FO|123456", tradingSymbol: "RELIANCE DEC FUT", expiry: "2026-12-31", lotSize: 500, lastPrice: 2500 }] },
];
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
  let browser;
  try {
    let launch = { headless: true };
    if (process.env.CHROMIUM_PACKAGE) {
      const mod = require(process.env.CHROMIUM_PACKAGE), packaged = mod.default || mod;
      launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
    }
    browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(20000);
    const errors = [], candleRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*.supabase.co/**", route => route.abort());
    const logoFixture = process.env.STOCK_LOGO_FIXTURE ? require("node:fs").readFileSync(process.env.STOCK_LOGO_FIXTURE) : Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#6840d9"/></svg>');
    await page.route("https://assets.upstox.com/**", route => route.request().url().includes("INE002A01018") ? route.fulfill({ contentType: process.env.STOCK_LOGO_FIXTURE ? "image/png" : "image/svg+xml", body: logoFixture }) : route.abort());
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/upstox/candles") candleRequests.push(url);
      if (url.pathname === "/api/upstox/fno-underlyings") return route.fulfill({ json: { ok: true, underlyings } });
      return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [], connected: false } });
    });
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3233");
    await page.locator(".main-nav").waitFor({ timeout: 60000 });
    const nav = await page.locator(".main-nav button").allTextContents();
    assert.deepEqual(nav, ["Home", "Charts", "Holdings", "Orders", "Watchlist", "IPOs", "Fundamentals", "P&L"]);
    const open = async () => {
      const nav = page.viewportSize().width <= 940 ? ".mobile-bottom-nav" : ".main-nav";
      await page.locator(nav).getByRole("button", { name: /Fundamental/ }).click();
      await page.getByRole("heading", { name: "Fundamental Analysis", exact: true }).waitFor();
      await page.getByLabel("Import fundamental CSV").waitFor();
    };
    const chooseOption = async (label, choice) => {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("option", { name: choice, exact: true }).click();
      await page.locator(".modern-select-dialog").waitFor({ state: "hidden" });
    };
    const stockList = page.getByRole("dialog", { name: "Stocks", exact: true });
    const listLabels = { all: "companies", review: "passed gates", rejected: "failed", approved: "approved" };
    const summaryButton = filter => page.getByRole("navigation", { name: "Company lists", exact: true }).getByRole("button", { name: new RegExp(` ${listLabels[filter]}$`) });
    const openStocks = async (filter = "all") => {
      await summaryButton(filter).click();
      await stockList.waitFor();
      await page.waitForFunction(() => Math.abs((document.querySelector(".fa-stock-drawer[open]")?.getBoundingClientRect().right ?? -100) - innerWidth) < 1);
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === (matchMedia("(pointer: coarse)").matches ? "Close stock list" : "Search fundamental companies"));
    };
    const chooseStock = async name => {
      await openStocks();
      await stockList.locator(".fa-company-link").filter({ hasText: name }).click();
      await stockList.waitFor({ state: "hidden" });
    };
    await open();
    assert.equal(await page.getByLabel("Financial data as of").count(), 0);
    await page.getByLabel("Import fundamental CSV").setInputFiles({ name: "fundamentals.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByText("3 companies", { exact: true }).waitFor();
    assert.equal(await summaryButton("review").getAttribute("aria-label"), "2 passed gates");
    assert.doesNotMatch(await page.locator(".fa-run-summary").innerText(), /Imported|fundamentals\.csv|Data as of/);
    assert.equal(await page.locator(".fa-stock-trigger").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Open stock list", exact: true }).count(), 0);
    assert.deepEqual(await page.locator(".fa-run-summary button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label"))), ["3 companies", "2 passed gates", "1 failed", "0 approved"]);
    for (const [filter, names] of [["all", ["Example Oil", "Missing Data", "Reliance Industries"]], ["review", ["Example Oil", "Reliance Industries"]], ["rejected", ["Missing Data"]], ["approved", []]]) {
      await openStocks(filter);
      assert.deepEqual(await stockList.locator(".fa-company-link small").allTextContents(), names);
      assert.equal(await summaryButton(filter).getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Escape");
      await stockList.waitFor({ state: "hidden" });
      assert.equal(await summaryButton(filter).evaluate(el => el === document.activeElement), true);
    }
    await chooseStock("Reliance Industries");
    const review = page.locator(".fa-company-review");
    assert.equal(await review.locator(".fa-metrics").count(), 0);
    assert.equal(await review.locator(".fa-gates").evaluate(el => el.open), false);
    assert.equal(await review.locator(".fa-gate-grid").isVisible(), false);
    await review.locator(".fa-gates summary").click();
    assert.equal(await review.getByRole("list", { name: "Screening gates", exact: true }).getByRole("listitem").count(), 16);
    assert.equal(await review.locator(".fa-gate-row").evaluateAll(rows => rows.every(row => getComputedStyle(row).borderRadius === "0px")), true, "Gates use list rows, not cards");
    assert.equal(await review.locator('.fa-gate-row[data-status="passed"]').count(), 16);
    assert.equal(await review.locator(".fa-gate-track .passed").count(), 16);
    assert.equal(await review.getByRole("img", { name: "16 passed, 0 failed, 0 missing", exact: true }).count(), 1);
    assert.deepEqual(await review.locator(".fa-gate-row").evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector(".fa-gate-copy b").textContent, row.querySelector(".fa-gate-reading b").textContent]))), {
      "Dual exchange listing": "RELIANCE / 500325", "Promoter pledge": "0", ROE: "15", "Average ROE · 3Y": "16", "Average ROE · 5Y": "17",
      ROCE: "18", "Average ROCE · 3Y": "19", "Average ROCE · 5Y": "20", "Debt to equity": "0.3", "Net profit": "200", "Relative P/E": "1",
      "Profit growth · 3Y": "12", "Profit growth · 5Y": "13", "Sales growth · 3Y": "14", "Sales growth · 5Y": "15", "Operating profit margin": "12",
    });
    await chooseStock("Missing Data");
    assert.equal(await review.locator(".fa-gates").evaluate(el => el.open), false, "Changing companies starts with gates collapsed");
    assert.equal(await review.locator('.fa-gate-row[data-status="passed"]').count(), 2);
    assert.equal(await review.locator('.fa-gate-row[data-status="missing"]').count(), 14);
    assert.equal(await review.locator('.fa-gate-row[data-status="failed"]').count(), 0);
    assert.equal(await review.getByRole("img", { name: "2 passed, 0 failed, 14 missing", exact: true }).count(), 1);
    await chooseStock("Reliance Industries");
    assert.equal(await review.locator(".fa-chart-button").count(), 0);
    assert.equal(await review.getByRole("link", { name: "Original source of data", exact: true }).count(), 1);
    assert.equal(await review.getByRole("link", { name: "Company source", exact: true }).count(), 0);
    assert.equal(await review.locator("form").evaluate(el => getComputedStyle(el).display), "grid", "Legacy modal form styles must not override the compact review layout");
    assert.ok(await review.locator(".stock-logo").count());
    assert.match(await review.locator(".stock-logo img").getAttribute("src"), /NSE_EQ%7CINE002A01018/);
    await page.waitForFunction(() => document.querySelector(".fa-company-review .stock-logo img")?.naturalWidth > 0);
    assert.doesNotMatch(await review.innerText(), /\/10/);
    await openStocks();
    assert.equal(await stockList.locator(".fa-stock-chart .stock-logo").count(), 3);
    assert.ok(await stockList.locator(".fa-number").evaluateAll(cells => cells.every(cell => getComputedStyle(cell).textAlign === "right")));
    assert.doesNotMatch(await stockList.innerText(), /\/10/);
    assert.deepEqual(await stockList.locator("thead th").allTextContents(), ["Company", "Rating", "ROE", "P/E", "Gates"]);
    assert.equal(await stockList.locator(".fa-chart-button").count(), 0);
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Tab");
      assert.equal(await stockList.evaluate(el => el.contains(document.activeElement)), true, `Focus stays inside the modal stock list: step ${step}, active ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 300))}`);
    }
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Shift+Tab");
      assert.equal(await stockList.evaluate(el => el.contains(document.activeElement)), true, "Reverse keyboard navigation stays inside the stock list");
    }
    await stockList.getByLabel("Search fundamental companies").fill("Example");
    assert.equal(await stockList.locator("tbody tr").count(), 1);
    await page.keyboard.press("Escape");
    await stockList.waitFor({ state: "hidden" });
    assert.equal(await summaryButton("all").evaluate(el => el === document.activeElement), true);
    await page.getByRole("heading", { name: "Fundamental Analysis", exact: true }).waitFor();
    await openStocks();
    assert.equal(await stockList.getByLabel("Search fundamental companies").inputValue(), "", "Summary totals reopen the full matching list");
    await stockList.getByLabel("Search fundamental companies").fill("");
    await page.goBack();
    await stockList.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Fundamental Analysis", exact: true }).waitFor();
    await openStocks();
    await page.mouse.click(60, 60);
    await stockList.waitFor({ state: "hidden" });
    await chooseOption("Review decision", "Approved for research");
    await review.getByLabel("Research notes").fill("Reviewed annual results");
    await review.getByRole("button", { name: "Save review", exact: true }).click();
    await page.getByText("Review saved on this browser.", { exact: true }).waitFor();
    const approvalParentLayer = await page.evaluate(() => history.state?.papertradeLayer ?? null);
    await openStocks("approved");
    assert.deepEqual(await stockList.locator(".fa-company-link small").allTextContents(), ["Reliance Industries"]);
    await stockList.getByRole("button", { name: "Close stock list", exact: true }).click();
    await stockList.waitFor({ state: "hidden" });
    await page.waitForFunction(layer => (history.state?.papertradeLayer ?? null) === layer, approvalParentLayer);
    await page.reload(); await page.locator(".main-nav").waitFor(); await open();
    await page.getByText("3 companies", { exact: true }).waitFor();
    await chooseStock("Reliance Industries");
    assert.equal(await review.getByLabel("Research notes").inputValue(), "Reviewed annual results");
    assert.match(await review.getByRole("button", { name: "Review decision", exact: true }).innerText(), /Approved for research/);
    for (const selector of [".fa-logo-link", ".fa-symbol-link"]) {
      await review.locator(selector).click();
      await page.waitForFunction(() => document.querySelector(".terminal-shell")?.dataset.section === "trade" && new URL(location.href).searchParams.get("symbol") === "RELIANCE");
      await open();
      await page.getByText("3 companies", { exact: true }).waitFor();
      await chooseStock("Reliance Industries");
    }
    await page.getByRole("button", { name: "Rankings", exact: true }).click();
    await openStocks();
    assert.equal(await stockList.locator("tbody tr").count(), 3, "All companies remains complete from the Rankings view");
    await stockList.getByRole("button", { name: "Close stock list", exact: true }).click();
    await openStocks("review");
    assert.equal(await stockList.locator("tbody tr").count(), 2);
    await stockList.getByRole("button", { name: "Close stock list", exact: true }).click();
    await page.getByRole("button", { name: "Peer comparison", exact: true }).click();
    await chooseOption("Compare industry", "Oil & Gas");
    await openStocks("rejected");
    assert.deepEqual(await stockList.locator(".fa-company-link small").allTextContents(), ["Missing Data"]);
    await stockList.getByRole("button", { name: "Close stock list", exact: true }).click();
    assert.equal(await page.locator(".fa-peers").isVisible(), true, "Summary lists keep the current analysis view");
    assert.equal(await page.locator(".fa-peer-table thead th").count(), 4);
    assert.equal(await page.locator(".fa-peer-table thead .stock-logo").count(), 2);
    assert.equal(await page.locator(".fa-peer-picker .stock-logo").count(), 2);
    assert.doesNotMatch(await page.locator(".fa-peers").innerText(), /\/10/);
    assert.equal(await page.locator(".fa-peer-table tbody tr:not(.fa-peer-group)").count(), 23, "Keep the rating row and every existing peer metric");
    const peRow = page.locator(".fa-peer-table tbody tr").filter({ has: page.getByRole("rowheader", { name: "P/E", exact: true }) });
    assert.deepEqual(await peRow.locator("td").allTextContents(), ["19", "20", "18"]);
    assert.match(await page.locator(".fa-peer-table").innerText(), /Quarterly sales/);
    const checkboxes = page.locator(".fa-peer-picker input");
    await checkboxes.nth(0).uncheck(); await checkboxes.nth(1).uncheck();
    assert.equal(await page.locator(".fa-peer-table thead th").count(), 2);
    await checkboxes.nth(0).check();
    assert.equal(await page.locator(".fa-peer-table .fa-chart-button").count(), 0);
    await page.locator(".fa-peer-table thead .fa-stock-chart b").first().click();
    await page.waitForFunction(() => document.querySelector(".terminal-shell")?.dataset.section === "trade");
    await open();
    await page.getByText("3 companies", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Company rating", exact: true }).click();
    await page.getByLabel("Company fundamentals JSON").fill('{"Name":"Reliance BSE","BSE Code":"500325","ISIN Code":"INE002A01018"}');
    await openStocks("approved");
    assert.deepEqual(await stockList.locator(".fa-company-link small").allTextContents(), ["Reliance Industries"]);
    await stockList.getByRole("button", { name: "Close stock list", exact: true }).click();
    assert.match(await page.getByLabel("Company fundamentals JSON").inputValue(), /Reliance BSE/);
    await page.getByRole("button", { name: "Calculate rating", exact: true }).click();
    await review.getByRole("heading", { name: "Reliance BSE", exact: true }).waitFor();
    assert.match(await review.locator(".stock-logo img").getAttribute("src"), /NSE_EQ%7CINE002A01018/, "BSE-only companies share the same ISIN artwork");
    await page.getByLabel("Company fundamentals JSON").fill('{"Name":"Failed check","NSE Code":"FAIL","BSE Code":"500003","Pledged percentage":1}');
    await page.getByRole("button", { name: "Calculate rating", exact: true }).click();
    await review.getByRole("heading", { name: "Failed check", exact: true }).waitFor();
    assert.equal(await review.locator(".fa-gates").evaluate(el => el.open), false);
    await review.locator(".fa-gates summary").click();
    assert.equal(await review.locator('.fa-gate-row[data-status="failed"]').count(), 1);
    assert.equal(await review.getByRole("img", { name: "1 passed, 1 failed, 14 missing", exact: true }).count(), 1);
    assert.match(await review.locator('.fa-gate-row[data-status="failed"]').innerText(), /Promoter pledge.*1.*Failed/s);
    await page.getByLabel("Company fundamentals JSON").fill('{"Name":"Unknown"}');
    await page.getByRole("button", { name: "Calculate rating", exact: true }).click();
    await review.getByRole("heading", { name: "Unknown", exact: true }).waitFor();
    assert.match(await review.innerText(), /0\.0/);
    assert.equal(await review.locator(".stock-logo:not(.has-company-logo)").innerText(), "UN");
    assert.doesNotMatch(await review.innerText(), /\/10/);
    await review.getByRole("button", { name: "Review decision", exact: true }).click();
    const decisionPopup = page.getByRole("dialog", { name: "Review decision", exact: true });
    assert.equal(await decisionPopup.getByRole("option", { name: "Approved for research", exact: true }).isDisabled(), true);
    await page.keyboard.press("ArrowDown");
    assert.equal(await decisionPopup.getByRole("option", { name: "Declined after review", exact: true }).evaluate(el => el === document.activeElement), true, "Keyboard navigation skips disabled approval");
    for (let step = 0; step < 4; step++) { await page.keyboard.press("Tab"); assert.equal(await decisionPopup.evaluate(el => el.contains(document.activeElement)), true); }
    await page.keyboard.press("Escape");
    await decisionPopup.waitFor({ state: "hidden" });
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
      await nav.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: "More options", exact: true }).click();
      const more = page.locator(".more-menu-panel");
      assert.equal(await more.getByRole("button", { name: "Bot", exact: true }).evaluate(el => el.getBoundingClientRect().left > el.previousElementSibling.getBoundingClientRect().left), true, "Bot is to the right of Coach");
      await more.getByRole("button", { name: "Bot", exact: true }).click();
      await page.getByRole("heading", { name: "Paper trading bot", exact: true }).waitFor();
      await open();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Body overflows at ${width}px`);
      assert.equal(await page.locator(".fundamental-workspace").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `Workspace overflows at ${width}px`);
      assert.equal(await page.locator(".fa-run-summary").evaluate(el => { const boxes = [...el.children].map(button => button.getBoundingClientRect()); return boxes.every(box => Math.abs(box.top - boxes[0].top) < 1 && Math.abs(box.width - boxes[0].width) < 1); }), true, `Summary totals form one symmetric row at ${width}px`);
      assert.equal(await review.locator(".fa-gates").evaluate(el => el.open), false);
      assert.equal(await page.locator(".fa-company-stage .fa-company-review").evaluate(el => el.getBoundingClientRect().width >= el.parentElement.clientWidth - 2), true);
      if (process.env.FUNDAMENTAL_SCREENSHOT && width === 390) await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT.replace(/\.png$/, "-phone.png"), fullPage: true });
      await openStocks();
      assert.equal(await stockList.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && Math.abs(el.getBoundingClientRect().right - innerWidth) < 1), true, `Right drawer fits ${width}px`);
      assert.equal(await stockList.locator(".fa-table-scroll").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `Stock list fits ${width}px`);
      assert.ok(await stockList.locator(".fa-company-link").count());
      if (process.env.FUNDAMENTAL_SCREENSHOT && width === 390) {
        await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT.replace(/\.png$/, "-phone-list.png") });
        await stockList.getByRole("button", { name: "Fundamental status filter", exact: true }).click();
        await page.getByRole("dialog", { name: "Status", exact: true }).waitFor();
        await page.goBack();
        await page.getByRole("dialog", { name: "Status", exact: true }).waitFor({ state: "hidden" });
        assert.equal(await stockList.isVisible(), true, "Back closes only the nested filter popup");
      }
      await stockList.getByRole("button", { name: "Close stock list", exact: true }).click();
      await review.locator(".fa-gates summary").click();
      assert.equal(await review.locator(".fa-gate-grid").evaluate(el => el.scrollWidth <= el.clientWidth + 1 && [...el.children].every(row => row.scrollWidth <= row.clientWidth + 1)), true, `Gate rows overflow at ${width}px`);
      if (process.env.FUNDAMENTAL_SCREENSHOT && width === 390) {
        if (!(await review.locator(".fa-gates").evaluate(el => el.open))) await review.locator(".fa-gates summary").click();
        await review.locator(".fa-warnings summary").click();
        assert.equal(await review.locator(".fa-gate-row").count(), 16);
        await review.getByRole("button", { name: "Review decision", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT.replace(/\.png$/, "-phone-checks.png") });
        await review.getByRole("button", { name: "Review decision", exact: true }).click();
        await page.getByRole("dialog", { name: "Review decision", exact: true }).waitFor();
        await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT.replace(/\.png$/, "-phone-picker.png") });
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "Review decision", exact: true }).waitFor({ state: "hidden" });
      }
      await review.locator(".fa-gates summary").click();
      const labels = await nav.locator("button").allTextContents(); assert.deepEqual(labels.slice(-2), [width <= 940 ? "Analysis" : "Fundamentals", "P&L"]);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Use neon dark theme" }).click();
    if (process.env.FUNDAMENTAL_SCREENSHOT) await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT, fullPage: true });
    await openStocks();
    await stockList.getByRole("button", { name: "Open Reliance Industries chart", exact: true }).click();
    await page.locator(".workspace.section-trade").waitFor();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("symbol") === "RELIANCE");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("timeframe") === "1D");
    assert.ok(candleRequests.some(url => url.searchParams.get("instrumentKey") === "NSE_EQ|INE002A01018" && url.searchParams.get("timeframe") === "1D"));
    assert.equal(await page.getByRole("button", { name: "Open drawing list", exact: true }).count(), 0);
    assert.equal(await page.locator(".chart-object-trigger").count(), 0);
    await page.getByRole("button", { name: "Functions", exact: true }).click();
    await page.getByRole("dialog", { name: "Functions", exact: true }).getByRole("button", { name: "Chart controls", exact: true }).click();
    await page.getByRole("button", { name: "Drawing list", exact: true }).click();
    await page.getByRole("dialog", { name: "Chart drawings", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close drawing list", exact: true }).click();
    await page.getByRole("dialog", { name: "Chart drawings", exact: true }).waitFor({ state: "hidden" });
    await open(); await page.getByText("3 companies", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".home-workspace").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileNav = page.locator(".mobile-bottom-nav");
    assert.deepEqual(await mobileNav.locator("button").allTextContents(), ["Home", "Charts", "Watchlist", "IPO", "Analysis", "P&L"]);
    await mobileNav.getByRole("button", { name: "Watchlist", exact: true }).click();
    assert.deepEqual(await page.locator(".market-section-tabs").filter({ visible: true }).locator("button").allTextContents(), ["Watchlist", "Trading", "Investment"]);
    await page.locator(".market-section-tabs").filter({ visible: true }).getByRole("button", { name: "Watchlist", exact: true }).click();
    const selectList = async name => {
      await page.getByRole("tablist", { name: "Watchlists", exact: true }).getByRole("tab").filter({ has: page.locator("span", { hasText: new RegExp(`^${name}$`) }) }).click();
    };
    await selectList("Indices");
    const fnoList = page.locator(".watchlist-panel .fno-lists-panel");
    await fnoList.getByRole("button", { name: "Open NIFTY chart", exact: true }).waitFor();
    assert.equal(await fnoList.locator(".fno-symbol-row").count(), 1);
    await fnoList.getByRole("button", { name: "Open NIFTY chart", exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("symbol") === "NIFTY");
    await page.goBack();
    await fnoList.waitFor();
    await selectList("F&O stocks");
    await fnoList.getByRole("button", { name: "Open RELIANCE chart", exact: true }).waitFor();
    assert.equal(await fnoList.locator(".fno-symbol-row").count(), 1);
    await fnoList.getByRole("button", { name: /^Trade future/ }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("symbol") === "RELIANCE DEC FUT");
    await page.goBack();
    await fnoList.waitFor();
    assert.match(await page.getByRole("tablist", { name: "Watchlists", exact: true }).getByRole("tab", { selected: true }).innerText(), /F&O stocks/);
    await fnoList.getByRole("button", { name: "Open RELIANCE chart", exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("symbol") === "RELIANCE");
    await page.goBack();
    await fnoList.waitFor();
    for (const width of [320, 390, 900, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await fnoList.evaluate(el => { const bounds = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect(); return bounds.left >= parent.left && bounds.right <= parent.right && bounds.top >= parent.top && bounds.bottom <= parent.bottom + 1; }), true, `Embedded F&O list fits Watchlist at ${width}px`);
      if (process.env.FUNDAMENTAL_SCREENSHOT && [390, 1280].includes(width)) await page.screenshot({ path: process.env.FUNDAMENTAL_SCREENSHOT.replace(/\.png$/, `-watchlist-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.getByRole("button", { name: /^Current watchlist:/ }).count(), 0);
    const watchlists = page.getByRole("tablist", { name: "Watchlists", exact: true });
    assert.equal(await watchlists.isVisible(), true);
    await watchlists.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("Home");
    assert.match(await watchlists.getByRole("tab", { selected: true }).innerText(), /NIFTY 50/);
    await page.keyboard.press("ArrowRight");
    assert.match(await watchlists.getByRole("tab", { selected: true }).innerText(), /Trading watchlist/);
    await page.keyboard.press("End");
    assert.match(await watchlists.getByRole("tab", { selected: true }).innerText(), /ALL NSE/);
    assert.equal(await page.locator(".terminal-shell").getAttribute("data-section"), "watchlist");
    await page.setViewportSize({ width: 390, height: 700 });
    const touchEmulation = await page.context().newCDPSession(page);
    await touchEmulation.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await open();
    const manyStocks = `${csv.split("\n")[0]}\n${Array.from({ length: 65 }, (_, index) => csv.split("\n")[1].replace("Reliance Industries", `Company ${String(index).padStart(2, "0")}`)).join("\n")}\n`;
    await page.getByLabel("Import fundamental CSV").setInputFiles({ name: "many-stocks.csv", mimeType: "text/csv", buffer: Buffer.from(manyStocks) });
    await page.getByText("65 companies", { exact: true }).waitFor();
    await openStocks();
    assert.equal(await stockList.getByRole("button", { name: "Close stock list", exact: true }).evaluate(el => el === document.activeElement), true, "Opening the phone list does not summon the search keyboard");
    assert.equal(await stockList.locator("tbody tr").count(), 50);
    assert.equal(await stockList.locator(".fa-table-scroll").evaluate(el => el.scrollHeight > el.clientHeight), true);
    await stockList.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(await stockList.locator("tbody tr").count(), 15);
    await stockList.getByRole("button", { name: "Previous", exact: true }).click();
    assert.equal(await stockList.locator("tbody tr").count(), 50);
    await chooseOption("Fundamental industry filter", "Oil & Gas");
    await chooseOption("Fundamental status filter", "Pending reviews");
    assert.equal(await stockList.locator("tbody tr").count(), 50);
    await chooseOption("Fundamental status filter", "Approved reviews");
    await stockList.getByText("No companies match these filters.").waitFor();
    await chooseOption("Fundamental status filter", "All statuses");
    assert.equal(await stockList.locator("tbody tr").count(), 50);
    assert.deepEqual(errors, []);
    console.log("Fundamentals verified: four clickable summary lists, zero/approved results, all analysis views, logo/symbol chart links, renamed source, compact collapsed gate rows, CSV worker, review persistence, peers, ratings, audit, dialog focus/Back, light/dark at nine widths and Watchlist chart flows.");
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
