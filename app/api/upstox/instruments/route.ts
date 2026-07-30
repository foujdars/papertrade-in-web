import type { Instrument } from "@/lib/market";

export const dynamic = "force-dynamic";

const CACHE_TTL = 6 * 60 * 60 * 1_000;
const NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const INDEX_URLS = {
  "NIFTY 50": "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
  "NIFTY 500": "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv",
  "BANK NIFTY": "https://www.niftyindices.com/IndexConstituent/ind_niftybanklist.csv",
} as const;

type UpstoxInstrument = {
  segment?: string;
  exchange?: string;
  instrument_type?: string;
  instrument_key?: string;
  trading_symbol?: string;
  short_name?: string;
  name?: string;
  security_type?: string;
};

let cache: { expiresAt: number; instruments: Instrument[] } | null = null;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  return rows;
}

function symbolsFromCsv(text: string) {
  const rows = parseCsv(text);
  const headers = rows[0]?.map((value) => value.toLowerCase()) ?? [];
  const symbolIndex = headers.indexOf("symbol");
  if (symbolIndex < 0) return new Set<string>();
  return new Set(rows.slice(1).map((row) => row[symbolIndex]?.trim().toUpperCase()).filter(Boolean));
}

async function fetchInstrumentMaster() {
  const response = await fetch(NSE_INSTRUMENTS_URL, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Unable to download the NSE instrument master.");
  const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).json() as Promise<UpstoxInstrument[]>;
}

async function loadInstruments() {
  if (cache && cache.expiresAt > Date.now()) return cache.instruments;

  const [master, nifty50Csv, nifty500Csv, bankNiftyCsv] = await Promise.all([
    fetchInstrumentMaster(),
    fetch(INDEX_URLS["NIFTY 50"], { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Unable to download NIFTY 50 constituents.");
      return response.text();
    }),
    fetch(INDEX_URLS["NIFTY 500"], { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Unable to download NIFTY 500 constituents.");
      return response.text();
    }),
    fetch(INDEX_URLS["BANK NIFTY"], { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Unable to download Bank NIFTY constituents.");
      return response.text();
    }),
  ]);

  const membership = {
    "NIFTY 50": symbolsFromCsv(nifty50Csv),
    "NIFTY 500": symbolsFromCsv(nifty500Csv),
    "BANK NIFTY": symbolsFromCsv(bankNiftyCsv),
  };
  const seen = new Set<string>();
  const instruments = master
    .filter((item) =>
      item.segment === "NSE_EQ" &&
      item.exchange === "NSE" &&
      item.instrument_type === "EQ" &&
      item.instrument_key &&
      item.trading_symbol,
    )
    .map((item) => {
      const symbol = item.trading_symbol!.trim().toUpperCase();
      const categories = (Object.keys(membership) as Array<keyof typeof membership>)
        .filter((category) => membership[category].has(symbol));
      return {
        symbol,
        name: item.short_name?.trim() || item.name?.trim() || symbol,
        exchange: "NSE" as const,
        price: 0,
        change: 0,
        instrumentKey: item.instrument_key!,
        categories,
      };
    })
    .filter((item) => {
      if (seen.has(item.symbol)) return false;
      seen.add(item.symbol);
      return true;
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  cache = { expiresAt: Date.now() + CACHE_TTL, instruments };
  return instruments;
}

export async function GET() {
  try {
    const instruments = await loadInstruments();
    const counts = {
      allNse: instruments.length,
      nifty50: instruments.filter((item) => item.categories.includes("NIFTY 50")).length,
      nifty500: instruments.filter((item) => item.categories.includes("NIFTY 500")).length,
      bankNifty: instruments.filter((item) => item.categories.includes("BANK NIFTY")).length,
    };
    return Response.json(
      { ok: true, source: "Upstox + NSE Indices", instruments, counts, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INSTRUMENT_MASTER_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Unable to load NSE instruments.",
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
