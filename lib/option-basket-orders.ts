import { basketPayoff, type PricedLeg, type BasketSide } from "./option-basket.ts";
import { executeOption, type OptionSnapshot } from "./global-option-orders.ts";
import type { PerpAccount, PerpSpec, PerpQuote } from "./global-markets.ts";
import { submitGlobalOrder } from "./global-order-engine.ts";
import { futureFillCashDelta, paperOrderCapitalValue, type PaperOrder } from "./paper-trading.ts";
import { calculateUpstoxTradingCharges } from "./trading-charges.ts";
import { bookPrices } from "./vertical-spread.ts";

export type IndianBook = { bid?: number; ask?: number; bidSize?: number; askSize?: number; at?: string };
export type DeltaBasketSnapshot = OptionSnapshot | { spec: PerpSpec; quote: PerpQuote };
export type BasketVenue = {market: "india" | "metals" | "crypto" | "tokens"; root: string; rootLabel: string; expiry: string; legs: PricedLeg[]};

function checkPrice(side: BasketSide, actual: number | null, reviewed: number) {
  if (actual === null || !Number.isFinite(actual) || actual <= 0 || (side === "BUY" ? actual > reviewed : actual < reviewed))
    throw new Error("A quoted price changed or is unavailable. Review the updated basket.");
  return actual;
}

export function fillDeltaBasket(account: PerpAccount, order: BasketVenue, snapshots: Record<string, DeltaBasketSnapshot>, now: number) {
  basketPayoff(order.legs);
  return order.legs.reduce((next, {contract, lots, side, premium}) => {
    const snap = snapshots[contract.id];
    if (!snap?.quote || !snap.spec || snap.spec.symbol !== contract.id || snap.quote.symbol !== contract.id ||
        contract.series !== order.expiry || !(Date.parse(order.expiry) > now) || snap.spec.lot !== contract.multiplier)
      throw new Error("A selected Delta contract has changed. Refresh the chain.");
    checkPrice(side, side === "BUY" ? snap.quote.ask : snap.quote.bid, premium);
    if (contract.kind === "FUT") {
      if ("contractType" in snap.spec || contract.futureExpiry !== null || contract.id !== order.root + "USD")
        throw new Error("The hedge no longer matches this Delta underlying.");
      return submitGlobalOrder(next, snap.spec, snap.quote, {type:"Market", side, contracts:lots, leverage:1}, now);
    }
    if (!("contractType" in snap.spec) || snap.spec.underlying !== order.root || snap.spec.expiry !== Date.parse(order.expiry) ||
        snap.spec.strike !== contract.strike || snap.spec.contractType !== (contract.kind === "CE" ? "call_options" : "put_options"))
      throw new Error("A selected Delta option has changed. Refresh the chain.");
    return executeOption(next, snap.spec, snap.quote, side, lots, 1, now);
  }, account);
}

export function fillIndianBasket(order: BasketVenue, books: Record<string, IndianBook>, balance: number, now: number, batchId: string, priorOrders: PaperOrder[] = []) {
  basketPayoff(order.legs);
  if (!Number.isFinite(balance)) throw new Error("The INR paper balance could not be read.");
  const date = new Date(now);
  const fills: PaperOrder[] = [];
  let cash = balance;
  for (const {contract, side, lots, premium} of order.legs) {
    const book = books[contract.id], multiplier = contract.multiplier!, exchangeLot = contract.exchangeLot;
    if (!contract.symbol || !contract.id.startsWith(order.market === "metals" ? "MCX_FO|" : "NSE_FO|") ||
        contract.series !== order.expiry || !Number.isSafeInteger(multiplier) || !exchangeLot || !Number.isSafeInteger(exchangeLot) || exchangeLot <= 0)
      throw new Error("Verified contract and lot information is required.");
    const at = Date.parse(book?.at ?? "");
    if (!book || !Number.isFinite(at) || at > now + 5000 || now - at > 30_000) throw new Error("Fresh order-book quotes are required for every leg.");
    const prices = bookPrices(book.bid, book.ask, book.bidSize, book.askSize);
    const price = checkPrice(side, side === "BUY" ? prices.ask : prices.bid, premium);
    const depth = Number(side === "BUY" ? book.askSize : book.bidSize);
    if (!Number.isFinite(depth) || lots * exchangeLot > depth) throw new Error("A leg exceeds the available quantity at the quoted price.");
    const quantity = lots * multiplier;
    if (!Number.isSafeInteger(quantity)) throw new Error("Invalid order quantity.");
    const product = "DELIVERY";
    const assetType = contract.kind === "FUT" ? "FUTURE" : "OPTION";
    if (contract.kind === "FUT" && (!contract.futureExpiry || contract.futureExpiry < order.expiry.slice(0,10) ||
        (order.market === "metals" && contract.id !== order.expiry.split("~")[1]))) throw new Error("The future does not cover this option expiry.");
    const charges = calculateUpstoxTradingCharges(assetType, {side, product, quantity, price}, contract.id, order.rootLabel);
    const fill: PaperOrder = {id: batchId + "-" + fills.length, symbol: contract.symbol, instrumentName: contract.symbol, instrumentKey: contract.id,
      assetType, ...(contract.kind === "FUT" ? {} : {optionType: contract.kind, strikePrice: contract.strike}), lotSize: multiplier,
      expiry: contract.kind === "FUT" ? contract.futureExpiry! : order.expiry.slice(0,10), underlyingSymbol: order.rootLabel,
      underlyingKey: order.market === "india" ? order.root : contract.kind === "FUT" ? undefined : order.expiry.split("~")[1],
      side, quantity, price, product, charges, status: "COMPLETE", createdAt: now,
      time: date.toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit",second:"2-digit"}), priceSource: "UPSTOX_QUOTE"};
    if (assetType === "FUTURE") {
      fill.cashDelta = futureFillCashDelta(priorOrders, fill).cashDelta;
      cash += fill.cashDelta;
    } else {
      const capital = paperOrderCapitalValue(assetType, product, quantity, price);
      cash += (side === "SELL" ? capital : -capital) - charges.total;
    }
    fills.push(fill);
  }
  if (!Number.isFinite(cash) || cash < 0) throw new Error("Insufficient available INR for the paper basket.");
  return {fills, balance: cash};
}
