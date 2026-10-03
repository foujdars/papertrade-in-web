"""Collect public end-of-day research inputs; no broker or AI credentials."""
import concurrent.futures
import datetime as dt
import email.utils
import json
import math
import pathlib
import time
import urllib.parse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
NOW = int(time.time() * 1000)
UNIVERSE = json.loads((ROOT / "config/research-universe.json").read_text())

def number(value, multiplier=1):
    try:
        n = float(value) * multiplier
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None

def get_public(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json,text/html,*/*"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read(2_000_000)

def candles(ticker):
    error = None
    for host in ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]:
        try:
            payload = json.loads(get_public("https://" + host + "/v8/finance/chart/" + urllib.parse.quote(ticker, safe="") + "?range=1y&interval=1d"))
            result = payload["chart"]["result"][0]
            raw = result["indicators"]["quote"][0]
            adjusted = result["indicators"].get("adjclose", [{}])[0].get("adjclose", [])
            cutoff = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30)))
            out = []
            for i, stamp in enumerate(result.get("timestamp", [])):
                local = dt.datetime.fromtimestamp(stamp, cutoff.tzinfo)
                if local.date() == cutoff.date() and (cutoff.hour, cutoff.minute) < (15, 30):
                    continue
                close = number(raw["close"][i])
                adj = number(adjusted[i]) if i < len(adjusted) else close
                factor = adj / close if close and adj else 1
                values = {"time": stamp, "open": number(raw["open"][i], factor), "high": number(raw["high"][i], factor), "low": number(raw["low"][i], factor), "close": number(close, factor), "volume": number(raw["volume"][i])}
                if all(values[k] is not None and values[k] > 0 for k in ["open", "high", "low", "close"]):
                    out.append(values)
            if len(out) < 21:
                raise ValueError("Insufficient history")
            return out
        except Exception as exc:
            error = exc
    raise ValueError("Public chart history unavailable") from error

def screener_fundamentals(symbol):
    url = "https://www.screener.in/company/" + urllib.parse.quote(symbol, safe="") + "/consolidated/"
    try:
        html = get_public(url)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        url = url.replace("/consolidated/", "/")
        html = get_public(url)
    soup = BeautifulSoup(html, "html.parser")
    ratios = {}
    for li in soup.select("#top-ratios li"):
        name, value = li.select_one(".name"), li.select_one(".number")
        if name and value:
            ratios[name.get_text(" ", strip=True)] = number(value.get_text(strip=True).replace(",", ""))
    sector_node = soup.select_one('a[title="Sector"]')
    sector = sector_node.get_text(" ", strip=True) if sector_node else "Unknown"
    sales_growth = None
    for table in soup.select("table.ranges-table"):
        heading = table.find("th")
        if heading and "Sales Growth" in heading.get_text():
            for tr in table.find_all("tr"):
                cells = tr.find_all("td")
                if len(cells) == 2 and "TTM" in cells[0].get_text():
                    sales_growth = number(cells[1].get_text(strip=True).replace("%", ""))
    def annual(section_id):
        section = soup.find(id=section_id)
        table = section.select_one("table.data-table") if section else None
        if not table:
            return {}, None
        headings = table.select("thead th")
        dated = [(i, h.get("data-date-key")) for i, h in enumerate(headings) if h.get("data-date-key", "").startswith("20")]
        if not dated:
            return {}, None
        column, date = dated[-1]
        values = {}
        for tr in table.select("tbody tr"):
            cells = tr.find_all("td")
            if len(cells) > column:
                label = cells[0].get_text(" ", strip=True).replace("+", "").strip()
                values[label] = number(cells[column].get_text(strip=True).replace(",", ""))
        period = int(dt.datetime.fromisoformat(date).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
        return values, period
    profit, period = annual("profit-loss")
    balance, _ = annual("balance-sheet")
    sales = profit.get("Sales") or profit.get("Revenue")
    net_profit = profit.get("Net Profit")
    equity = (balance.get("Equity Capital") or 0) + (balance.get("Reserves") or 0)
    debt = balance.get("Borrowings")
    if ratios.get("ROE") is None and sales_growth is None:
        raise ValueError("Reported fundamentals unavailable")
    return {"pe": ratios.get("Stock P/E"), "roe": ratios.get("ROE"), "debtEquity": debt / equity if debt is not None and equity > 0 else None, "currentRatio": None, "revenueGrowth": sales_growth, "profitMargin": net_profit / sales * 100 if sales and net_profit is not None else None, "sector": sector, "asOf": NOW, "financialPeriod": period, "source": "Screener reports (annual margin/debt; reported ROE and TTM growth)", "sourceUrl": url}

def news(name):
    query = urllib.parse.urlencode({"q": f'"{name}" stock when:5d', "hl": "en-IN", "gl": "IN", "ceid": "IN:en"})
    request = urllib.request.Request("https://news.google.com/rss/search?" + query, headers={"User-Agent": "PaperTradeResearch/1.0"})
    with urllib.request.urlopen(request, timeout=15) as response:
        root = ET.fromstring(response.read(2_000_000))
    rows = []
    for item in root.findall("./channel/item")[:30]:
        try:
            timestamp = email.utils.parsedate_to_datetime(item.findtext("pubDate", "")).timestamp() * 1000
        except (ValueError, TypeError, AttributeError):
            continue
        rows.append({"title": item.findtext("title", ""), "publishedAt": timestamp, "url": item.findtext("link", ""), "source": item.findtext("source", "Google News")})
    return rows

def collect(item):
    symbol, name = item["symbol"], item["name"]
    result = {"symbol": symbol, "name": name, "sector": "Unknown", "candles": [], "fundamentals": None, "headlines": [], "errors": []}
    ticker = symbol + ".NS"
    try:
        result["candles"] = candles(ticker)
        last = result["candles"][-1]["time"] * 1000 if result["candles"] else 0
        if not last or NOW - last > 7 * 86400000:
            result["errors"].append("Price history is stale")
            result["candles"] = []
    except Exception:
        result["errors"].append("Price history unavailable")
    try:
        result["fundamentals"] = screener_fundamentals(symbol)
        result["sector"] = result["fundamentals"]["sector"]
    except Exception:
        result["errors"].append("Fundamentals unavailable")
    try:
        result["headlines"] = news(name)
    except Exception:
        result["errors"].append("News unavailable")
    return result

def main():
    if not isinstance(UNIVERSE, list) or not 1 <= len(UNIVERSE) <= 100:
        raise ValueError("Research universe must contain 1–100 stocks")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        inputs = list(pool.map(collect, UNIVERSE))
    errors, index, vix = [], [], None
    try:
        index = candles("^NSEI")
    except Exception:
        errors.append("NIFTY benchmark unavailable")
    try:
        vix_rows = candles("^INDIAVIX")
        if vix_rows and NOW - vix_rows[-1]["time"] * 1000 <= 7 * 86400000:
            vix = vix_rows[-1]["close"]
    except Exception:
        errors.append("India VIX unavailable")
    target = ROOT / ".research-input.json"
    target.write_text(json.dumps({"inputs": inputs, "index": index, "vix": vix, "now": NOW, "requested": len(UNIVERSE), "errors": errors}, allow_nan=False))
    print(f"Collected {sum(bool(i['candles']) for i in inputs)}/{len(UNIVERSE)} price histories")

if __name__ == "__main__":
    main()
