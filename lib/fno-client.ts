import type { FnoUnderlying, OptionChainRow, OptionContractSide } from "@/lib/fno";

type OptionChainPayload = {
  ok?: boolean;
  expiries?: string[];
  rows?: OptionChainRow[];
  error?: { message?: string };
};

async function readPayload(response: Response) {
  const payload = await response.json() as OptionChainPayload;
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Option chain is unavailable.");
  return payload;
}

export async function loadOptionExpiries(underlying: FnoUnderlying, signal?: AbortSignal) {
  const params = new URLSearchParams({ instrumentKey: underlying.instrumentKey });
  const payload = await readPayload(await fetch(`/api/upstox/option-chain?${params}`, { cache: "no-store", signal }));
  if (!payload.expiries?.length) throw new Error("No active option expiry was returned by Upstox.");
  return payload.expiries;
}

export async function loadOptionChain(underlying: FnoUnderlying, expiry: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ instrumentKey: underlying.instrumentKey, expiry });
  const payload = await readPayload(await fetch(`/api/upstox/option-chain?${params}`, { cache: "no-store", signal }));
  return payload.rows ?? [];
}

export function nearestAtmRow(rows: OptionChainRow[]) {
  const spotPrice = rows.find((row) => row.underlyingSpotPrice > 0)?.underlyingSpotPrice ?? 0;
  if (!rows.length || !spotPrice) return null;
  return rows.reduce((nearest, row) => Math.abs(row.strikePrice - spotPrice) < Math.abs(nearest.strikePrice - spotPrice) ? row : nearest, rows[0]);
}

export function defaultOptionSide(row: OptionChainRow | null): OptionContractSide | null {
  if (!row) return null;
  if (row.call && row.call.marketData.ltp > 0) return row.call;
  if (row.put && row.put.marketData.ltp > 0) return row.put;
  return null;
}
