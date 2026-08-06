import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpstoxOptionContract = {
  expiry?: string | number;
  instrument_key?: string;
  trading_symbol?: string;
  instrument_type?: "CE" | "PE";
  lot_size?: number;
  strike_price?: number;
};

type OptionContractPayload = { status?: string; data?: UpstoxOptionContract[] };
type MarketData = {
  ltp?: number;
  volume?: number;
  oi?: number;
  close_price?: number;
  bid_price?: number;
  bid_qty?: number;
  ask_price?: number;
  ask_qty?: number;
};
type Greeks = { delta?: number; gamma?: number; theta?: number; vega?: number; iv?: number; pop?: number };
type ChainSide = { instrument_key?: string; market_data?: MarketData; option_greeks?: Greeks };
type UpstoxChainRow = {
  expiry?: string;
  pcr?: number;
  strike_price?: number;
  underlying_spot_price?: number;
  call_options?: ChainSide;
  put_options?: ChainSide;
};
type OptionChainPayload = { status?: string; data?: UpstoxChainRow[] };

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeExpiry(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeSide(side: ChainSide | undefined, contract: UpstoxOptionContract | undefined, optionType: "CE" | "PE") {
  const instrumentKey = side?.instrument_key ?? contract?.instrument_key;
  if (!instrumentKey) return null;
  return {
    instrumentKey,
    tradingSymbol: contract?.trading_symbol?.trim() || `${optionType} ${instrumentKey.split("|").at(-1)}`,
    optionType,
    lotSize: Math.max(1, Math.round(finite(contract?.lot_size) || 1)),
    marketData: {
      ltp: finite(side?.market_data?.ltp),
      volume: finite(side?.market_data?.volume),
      oi: finite(side?.market_data?.oi),
      closePrice: finite(side?.market_data?.close_price),
      bidPrice: finite(side?.market_data?.bid_price),
      bidQty: finite(side?.market_data?.bid_qty),
      askPrice: finite(side?.market_data?.ask_price),
      askQty: finite(side?.market_data?.ask_qty),
    },
    greeks: {
      delta: finite(side?.option_greeks?.delta),
      gamma: finite(side?.option_greeks?.gamma),
      theta: finite(side?.option_greeks?.theta),
      vega: finite(side?.option_greeks?.vega),
      iv: finite(side?.option_greeks?.iv),
      pop: finite(side?.option_greeks?.pop),
    },
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const instrumentKey = url.searchParams.get("instrumentKey")?.trim() ?? "";
    const expiry = url.searchParams.get("expiry")?.trim() ?? "";
    if (!isSupportedNseInstrumentKey(instrumentKey) || instrumentKey.startsWith("NSE_FO|")) {
      return Response.json(
        { ok: false, error: { code: "INVALID_UNDERLYING", message: "Select a supported NSE index or equity underlying." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      return Response.json(
        { ok: false, error: { code: "INVALID_EXPIRY", message: "Expiry must use YYYY-MM-DD format." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const contractParams = new URLSearchParams({ instrument_key: instrumentKey });
    if (expiry) contractParams.set("expiry_date", expiry);
    const contractsPayload = await upstoxFetch<OptionContractPayload>(`/v2/option/contract?${contractParams}`);
    const contracts = contractsPayload.data ?? [];
    const expiries = [...new Set(contracts.map((item) => normalizeExpiry(item.expiry)).filter(Boolean))].sort();

    if (!expiry) {
      return Response.json(
        { ok: true, source: "upstox", instrumentKey, expiries, contractCount: contracts.length, fetchedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const chainParams = new URLSearchParams({ instrument_key: instrumentKey, expiry_date: expiry });
    const chainPayload = await upstoxFetch<OptionChainPayload>(`/v2/option/chain?${chainParams}`);
    const contractByKey = new Map(contracts.flatMap((item) => item.instrument_key ? [[item.instrument_key, item] as const] : []));
    const rows = (chainPayload.data ?? []).flatMap((item) => {
      const strikePrice = finite(item.strike_price);
      if (!strikePrice) return [];
      const callKey = item.call_options?.instrument_key;
      const putKey = item.put_options?.instrument_key;
      return [{
        expiry: item.expiry || expiry,
        strikePrice,
        underlyingSpotPrice: finite(item.underlying_spot_price),
        pcr: finite(item.pcr),
        call: normalizeSide(item.call_options, callKey ? contractByKey.get(callKey) : undefined, "CE"),
        put: normalizeSide(item.put_options, putKey ? contractByKey.get(putKey) : undefined, "PE"),
      }];
    }).sort((a, b) => a.strikePrice - b.strikePrice);

    return Response.json(
      { ok: true, source: "upstox", instrumentKey, expiry, expiries: expiries.length ? expiries : [expiry], rows, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
