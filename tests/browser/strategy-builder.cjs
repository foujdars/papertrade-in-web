const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const origin = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const dates = ["2034-02-17","2034-02-24"];
const india = {instrumentKey:"NSE_INDEX|Nifty 50",symbol:"NIFTY",name:"Nifty 50",underlyingType:"INDEX",optionContracts:10,futureContracts:0};
const strikes = [80,90,100,110,120];
const seriesId = (root,date) => root === "GOLD" ? date+"~MCX_FO|9" : root === "NIFTY" ? date : date+"T12:00:00.000Z";
function contracts(root,expiry) {
  return strikes.flatMap((strike,i) => ["CE","PE"].map((kind,j) => {
    const premium = 6+Math.max(0,kind === "CE" ? 100-strike : strike-100);
    const indian = ["NIFTY","GOLD"].includes(root);
    const id = indian ? (root === "GOLD" ? "MCX_FO|" : "NSE_FO|")+(10*i+j+100) :
      (j ? "P-" : "C-")+root+"-"+strike+"-"+(expiry.startsWith(dates[0]) ? "170234" : "240234");
    return {id,series:expiry,kind,strike,symbol:id,multiplier:indian ? 25 : .01,exchangeLot:25,ask:premium+1,bid:premium-1,
      askSize:100,bidSize:100,last:premium,mark:premium,iv:.22,oi:50+i,greeks:{delta:j ? -.5 : .5,gamma:.01,theta:-.2,vega:.12}};
  }));
}
function chart(root) {
  const expiry = seriesId(root,dates[1]), c = contracts(root,expiry).find(c=>c.kind === "PE" && c.strike === 110);
  const exchange = root === "GOLD" ? "MCX" : root === "NIFTY" ? "NSE" : "DELTA";
  return {symbol:c.id,name:c.id,exchange,price:c.last,change:0,assetType:"OPTION",instrumentKey:exchange === "DELTA" ? "DELTA|"+c.id : c.id,
    categories:[root === "XAUT" ? "METAL" : "OPTION"],expiry:exchange === "DELTA" ? expiry : dates[1],underlyingSymbol:root,
    underlyingKey:root === "GOLD" ? "MCX_FO|9" : root === "NIFTY" ? india.instrumentKey : undefined,optionType:c.kind,strikePrice:c.strike};
}
async function intercept(page, market) {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), q = url.searchParams, mode = q.get("mode");
    const json = value => route.fulfill({json:{ok:true,...value}});
    if (url.pathname.endsWith("/fno-underlyings")) return json({underlyings:[india]});
    if (url.pathname.endsWith("/option-chain")) {
      const expiry = q.get("expiry");
      if (!expiry) return json({expiries:dates});
      const items = contracts("NIFTY",expiry);
      const side = c => ({instrumentKey:c.id,tradingSymbol:c.id,optionType:c.kind,lotSize:25,lotSizeVerified:true,
        marketData:{ltp:c.last,bidPrice:c.bid,askPrice:c.ask,bidQty:100,askQty:100,oi:c.oi,oiAvailable:true},greeks:{...c.greeks,iv:22}});
      return json({rows:strikes.map((k,i)=>({strikePrice:k,expiry,underlyingSpotPrice:100,call:side(items[i*2]),put:side(items[i*2+1])}))});
    }
    if (mode === "token-option-roots" || mode === "crypto-option-roots") return json({roots:mode === "token-option-roots" ? ["XAUT"] : ["BTC","ETH"]});
    if (mode === "spread-chain" || q.has("optionRoot")) {
      const root = q.get("underlying") || q.get("optionRoot"), expiry=q.get("series");
      if (!expiry) return json({series:dates.map(date=>({id:seriesId(root,date),expiry:date}))});
      const future = {kind:"FUT",id:root+"USD",symbol:root+"USD",series:expiry,futureExpiry:null,multiplier:.01,bid:99,ask:100,last:100};
      return json({contracts:contracts(root,expiry),future,reference:100});
    }
    if (url.pathname.endsWith("/global-markets") && q.has("symbol") && !mode) {
      const symbol = q.get("symbol"), now=Date.now();
      const quote = {symbol,at:now,bid:99,ask:market.adverse ? 101 : 100,last:100,mark:100,index:100,bidSize:100,askSize:100,operational:true,change:0,funding:0};
      if (symbol === "BTCUSD") return json({kind:"perpetual",quote,spec:{symbol,tick:.5,lot:.01,initial:.01,maintenance:.005,initialScale:0,maintenanceScale:0,scalingThreshold:100000,maxNotional:5000000,maker:.0002,taker:.0005,liquidation:.0005,fundingSeconds:28800,operational:true,fetchedAt:now}});
      const [type,root,k,date] = symbol.split("-");
      if (root) {
        const expiry=seriesId(root,date === "170234" ? dates[0] : dates[1]);
        const c=contracts(root,expiry).find(item=>item.id === symbol);
        return json({kind:"option",quote:{...quote,bid:c.bid,ask:c.ask,last:c.last,mark:c.mark},spec:{symbol,underlying:root,strike:Number(k),lot:.01,tick:.1,
          contractType:type === "C" ? "call_options" : "put_options",expiry:Date.parse(expiry),taker:.0005,maker:.0002,premiumFeeCap:.035,operational:true,fetchedAt:now}});
      }
    }
    return json({instruments:[],candles:[],quotes:{},underlyings:[],rows:[],items:[],connected:false,lists:{gainers:[],losers:[]}});
  });
}

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const [root,width] of [["BTC",390],["NIFTY",1440],["GOLD",360],["XAUT",768]]) {
      const page = await browser.newPage({viewport:{width,height:850},hasTouch:width<800});
      const errors = [], market={adverse:false};
      page.on("pageerror", error => errors.push(error.message));
      page.setDefaultTimeout(20000);
      await intercept(page,market);
      const instrument = chart(root);
      await page.addInitScript(item => localStorage.setItem("papertrade-last-chart",JSON.stringify({instrument:item,symbol:item.symbol,workspaceMode:"trade",timeframe:"5m"})),instrument);
      await page.goto(origin,{waitUntil:"domcontentloaded"});
      const nav = page.locator(width < 941 ? ".mobile-bottom-nav" : ".main-nav");
      await nav.getByRole("button",{name:"Charts",exact:true}).click();
      const trigger = page.locator(".option-strategy-trigger:visible").filter({hasText:"Strategy builder"}).first();
      await trigger.click();
      const ui=page.getByRole("dialog",{name:"Option Strategy Builder",exact:true});
      const complete = ui.locator(".chain-grid");
      await complete.waitFor();
      assert.equal(await ui.getByLabel("Underlying",{exact:true}).inputValue(), root === "NIFTY" ? india.instrumentKey : root);
      assert.match(await ui.locator('.desk-expiry-strip [aria-pressed="true"]').innerText(),/24 Feb/);
      await ui.getByRole("button",{name:/Buy 110 put at/}).waitFor();
      assert.equal(await ui.getByRole("button",{name:/Buy 110 put at/}).getAttribute("aria-pressed"),"true");
      assert.ok(await ui.evaluate(el => el.scrollWidth <= el.clientWidth+1 && el.querySelector(".spread-builder").scrollWidth <= el.clientWidth+1));
      if (root === "BTC") {
        await ui.getByLabel("Apply strategy preset").selectOption("straddle");
        await ui.getByRole("button",{name:"Increase strategy multiplier"}).click();
        await ui.getByLabel("Include 110 Put").uncheck();
        await ui.getByRole("button",{name:"Add futures"}).click();
        const picker=page.getByRole("dialog",{name:"Add futures contract",exact:true});
        await picker.getByRole("button",{name:/Buy future/}).click();
        await ui.getByRole("button",{name:"Payoff",exact:true}).click();
        // With inactive planning levels the axis follows the displayed curves, even for a futures leg.
        await ui.getByRole("slider",{name:"Target date"}).press("End");
        const coversPlot = await ui.locator(".desk-payoff-chart svg").evaluate(svg => {
          const ys = [...svg.querySelectorAll(".spread-profit-line,.spread-loss-line")].flatMap(line=>[line.y1.baseVal.value,line.y2.baseVal.value]);
          const grid = [...svg.querySelectorAll(".desk-gridline")].map(line=>line.y1.baseVal.value);
          return Math.abs(Math.min(...ys)-Math.min(...grid)) < .01 && Math.abs(Math.max(...ys)-Math.max(...grid)) < .01;
        });
        assert.ok(coversPlot,"unentered stop or target must not flatten the payoff curve");
        await ui.getByRole("button",{name:"P&L table",exact:true}).click();
        assert.ok(await ui.getByRole("columnheader",{name:"Target P&L"}).isVisible());
        await ui.getByRole("button",{name:"Greeks",exact:true}).click();
        assert.ok(await ui.getByRole("rowheader",{name:"Net exposure"}).isVisible());
        await ui.getByRole("button",{name:"P&L chart",exact:true}).click();
        await ui.getByLabel("Show open interest").check();
        await ui.getByRole("slider",{name:"Target date"}).press("ArrowRight");
        await ui.getByRole("group",{name:"Option expiry"}).getByRole("button",{name:/17 Feb/}).click();
        await complete.waitFor();
        await ui.getByRole("group",{name:"Option expiry"}).getByRole("button",{name:/24 Feb/}).click();
        await complete.waitFor();
        await ui.getByRole("navigation",{name:"Strategy builder views"}).getByRole("button",{name:/Contracts/}).click();
        assert.equal(await ui.getByRole("spinbutton",{name:"Strategy multiplier",exact:true}).inputValue(),"2");
        const wallet = () => page.evaluate(()=>JSON.parse(localStorage.getItem("papertrade-perpetual-wallet-v1:guest")||"null"));
        await ui.getByRole("button",{name:"Review paper basket"}).click();
        await ui.getByText("Est. funds required incl. fees").waitFor();
        assert.equal((await wallet())?.positions?.length || 0,0);
        market.adverse=true;
        await ui.getByRole("button",{name:"Place paper basket"}).click();
        await ui.getByRole("alert").filter({hasText:/quoted price changed/}).waitFor();
        const untouched=await wallet();
        assert.equal(untouched?.positions?.length || 0,0);
        assert.equal(untouched?.optionPositions?.length || 0,0);
        market.adverse=false;
        await ui.getByRole("button",{name:"Review paper basket"}).click();
        await ui.getByRole("button",{name:"Place paper basket"}).click();
        await ui.getByText("2 paper orders filled.").waitFor();
        const filled=await wallet();
        assert.equal(filled.positions[0].contracts,2);
        assert.equal(filled.optionPositions[0].contracts,2);
        assert.equal(filled.optionPositions.length,1);
      }
      await ui.getByRole("button",{name:"Close Strategy Builder"}).click();
      assert.equal(await trigger.evaluate(el=>document.activeElement===el),true);
      assert.deepEqual(errors,[]);
      console.log(root+" option chart passed at "+width+"px");
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
