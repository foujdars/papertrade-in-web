const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const origin = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const now = Date.parse("2026-11-30T05:30:00Z");
const asOf = new Date(now).toISOString();
const expiries = ["2026-12-29", "2027-01-25"];
function underlying(symbol, instrumentKey, type, ids, lots) {
  const futures = expiries.map((expiry, i) => ({ instrumentKey: ids[i], tradingSymbol: symbol + (i ? " JAN FUT" : " DEC FUT"), expiry, lotSize: lots[i], lotSizeVerified: true, lastPrice: 0 }));
  return { symbol, name: symbol, instrumentKey, underlyingType: type, optionContracts: type === "EQUITY" ? 10 : 0, futureContracts: 2, futures };
}
const roots = [
  underlying("NIFTY", "NSE_INDEX|Nifty 50", "INDEX", ["NSE_FO|111", "NSE_FO|112"], [65, 60]),
  underlying("RELIANCE", "NSE_EQ|INE002A01018", "EQUITY", ["NSE_FO|121", "NSE_FO|122"], [250, 200]),
  underlying("SENSEX", "BSE_INDEX|SENSEX", "INDEX", ["BSE_FO|131", "BSE_FO|132"], [20, 20]),
];
const btc = {symbol:"BTCUSD", name:"Bitcoin perpetual", instrumentKey:"DELTA|BTCUSD", exchange:"DELTA", assetType:"FUTURE", price:0, change:0, contractMultiplier:.001, lotSize:1, underlyingSymbol:"BTC", categories:["GLOBAL","CRYPTO"]};
const gold = {symbol:"GOLD-20261204", name:"Gold 04 Dec 26", instrumentKey:"MCX_FO|141", exchange:"MCX", assetType:"FUTURE", price:0, change:0, lotSize:100, underlyingSymbol:"GOLD", expiry:"2026-12-04", categories:["MCX","COMMODITY"]};
const india = [...roots.flatMap(root => root.futures.map(contract => ({...contract, symbol:contract.tradingSymbol}))), gold];
const prices = new Map(india.map((contract, i) => [contract.instrumentKey, 100 + i * 15]));
const quote = (key, price) => ({instrumentKey:key, symbol:india.find(row=>row.instrumentKey === key)?.symbol || key, lastPrice:price, previousClose:price-1, previousCloseAt:asOf,
  netChange:1, changePercent:1, changeAvailable:true, open:price, high:price+1, low:price-2, lastTradeAt:asOf, updatedAt:asOf});
async function mockMarket(page) {
  await page.clock.setFixedTime(new Date(now));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), params = url.searchParams;
    const send = fields => route.fulfill({json:{ok:true,...fields}});
    if (url.pathname.endsWith("/market/session")) return send({session:{date:"2026-11-30", checkedAt:now, status:"NORMAL_OPEN", sessions:[{start:now-3600000,end:now+4*3600000}], source:"test exchange session"}});
    if (url.pathname.endsWith("/fno-underlyings")) return send({underlyings:roots});
    if (url.pathname.endsWith("/commodities")) return send({instruments:[gold]});
    if (url.pathname.endsWith("/global-markets") && params.get("mode") === "catalog") return send({instruments:[btc]});
    if (url.pathname.endsWith("/global-markets") && params.get("symbol") === "BTCUSD" && !params.get("mode")) return send({
      kind:"perpetual", quote:{symbol:btc.symbol,at:now,last:60000,mark:60000,index:60000,bid:59999,ask:60000,bidSize:100,askSize:100,funding:.0001,operational:true,change:0},
      spec:{symbol:btc.symbol,lot:.001,tick:.5,initial:.01,maintenance:.005,initialScale:0,maintenanceScale:0,scalingThreshold:100000,maxNotional:5000000,
        maker:.0002,taker:.0005,liquidation:.0005,fundingSeconds:28800,operational:true,fetchedAt:now}});
    if (url.pathname.endsWith("/quotes")) {
      const keys = route.request().method() === "POST" ? route.request().postDataJSON().keys : (params.get("keys") || "").split(",");
      return send({quotes:Object.fromEntries(keys.map(key=>[key,quote(key, prices.get(key) || 99)])), fetchedAt:asOf});
    }
    return send({quotes:{},candles:[],instruments:[],underlyings:[],items:[],rows:[],connected:false,lists:{gainers:[],losers:[]}});
  });
}

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const [group, contract, side] of [
      ["Indices",india[1],"BUY"], ["Stocks",india[3],"SELL"], ["Indices",india[5],"SELL"], ["MCX",gold,"BUY"], ["Global",btc,"SELL"],
    ]) {
      const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const errors = [];
      try {
        page.on("pageerror", e=>errors.push(e.message));
        await mockMarket(page);
        await page.goto(origin,{waitUntil:"domcontentloaded"});
        const home = page.getByRole("region",{name:"PaperTrade home"});
        await home.waitFor();
        if (group === "Global") await home.getByRole("button",{name:"Global markets"}).click();
        await home.getByRole("button",{name:"Trade futures",exact:true}).click();
        const picker = page.getByRole("dialog",{name:"Trade futures",exact:true});
        if (group !== "Global") await picker.getByRole("button",{name:group,exact:true}).click();
        if (group === "Stocks") {
          await picker.getByRole("textbox",{name:"Search futures contracts"}).fill("reliance jan");
          assert.equal(await picker.locator("article").count(),1);
        }
        const row = picker.locator("article").filter({has:page.getByText(contract.symbol,{exact:true})});
        assert.match(await row.innerText(), /1 lot = /);
        const verb = side === "BUY" ? "Buy" : "Sell";
        await row.getByRole("button",{name:verb+" "+contract.symbol,exact:true}).tap();
        if (group === "Global") {
          const ticket = page.locator(".global-ticket:visible");
          await ticket.getByRole("button",{name:"Short 1 lot",exact:true}).click();
          await page.waitForFunction(()=>JSON.parse(localStorage.getItem("papertrade-perpetual-wallet-v1:guest"))?.positions.length === 1);
          const [position] = await page.evaluate(()=>JSON.parse(localStorage.getItem("papertrade-perpetual-wallet-v1:guest")).positions);
          assert.deepEqual([position.symbol,position.side,position.contracts,position.spec.lot,position.entry],["BTCUSD","SELL",1,.001,59999]);
        } else {
          const quantity = page.getByRole("textbox",{name:"Order quantity"});
          assert.equal(await quantity.inputValue(),String(contract.lotSize));
          await page.getByRole("button",{name:side+" "+contract.lotSize+" "+contract.symbol,exact:true}).click();
          await page.waitForFunction(()=>JSON.parse(localStorage.getItem("papertrade-orders") || "[]").length > 0);
          const [fill] = await page.evaluate(()=>JSON.parse(localStorage.getItem("papertrade-orders")));
          assert.deepEqual([fill.instrumentKey,fill.expiry,fill.side,fill.quantity,fill.price,fill.assetType],[contract.instrumentKey,contract.expiry,side,contract.lotSize,prices.get(contract.instrumentKey),"FUTURE"]);
          assert.ok(fill.cashDelta < 0);
          if (contract.instrumentKey === "NSE_FO|112") {
            await page.getByRole("button",{name:"Trade NIFTY futures",exact:true}).click();
            const expiries = page.getByRole("dialog",{name:"NIFTY futures",exact:true});
            assert.deepEqual(await expiries.locator("article strong").allTextContents(),["NIFTY DEC FUT","NIFTY JAN FUT"]);
          }
        }
        assert.deepEqual(errors,[]);
        console.log(verb,contract.symbol,"verified in the paper wallet");
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
