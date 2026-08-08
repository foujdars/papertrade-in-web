export type EquityChargeBreakdown = {
  brokerage: number;
  stt: number;
  transactionCharges: number;
  ipftCharges: number;
  sebiCharges: number;
  gst: number;
  stampDuty: number;
  dpCharges: number;
  total: number;
};

type EquityChargeInput = {
  side: "BUY" | "SELL";
  product: "INTRADAY" | "DELIVERY";
  quantity: number;
  price: number;
};

export type ChargeableAssetType = "EQUITY" | "INDEX" | "OPTION" | "FUTURE";

const roundPaise = (value: number) => Math.round(value * 100) / 100;

export function calculateUpstoxEquityCharges({ side, product, quantity, price }: EquityChargeInput): EquityChargeBreakdown {
  const turnover = Math.max(0, quantity * price);
  const brokerage = product === "INTRADAY" ? Math.min(20, turnover * 0.001) : Math.min(20, turnover * 0.025);
  const stt = product === "DELIVERY" ? turnover * 0.001 : side === "SELL" ? turnover * 0.00025 : 0;
  // NSE cash-market transaction charges from 1 March 2026: 0.00307% per leg.
  const transactionCharges = turnover * 0.0000307;
  const ipftCharges = turnover * 0.000001;
  const sebiCharges = turnover * 0.000001;
  const stampDuty = side === "BUY" ? turnover * (product === "DELIVERY" ? 0.00015 : 0.00003) : 0;
  const dpCharges = product === "DELIVERY" && side === "SELL" ? 20 : 0;
  const gst = (brokerage + transactionCharges + ipftCharges + dpCharges) * 0.18;
  const values = { brokerage, stt, transactionCharges, ipftCharges, sebiCharges, gst, stampDuty, dpCharges };
  return {
    brokerage: roundPaise(values.brokerage),
    stt: roundPaise(values.stt),
    transactionCharges: roundPaise(values.transactionCharges),
    ipftCharges: roundPaise(values.ipftCharges),
    sebiCharges: roundPaise(values.sebiCharges),
    gst: roundPaise(values.gst),
    stampDuty: roundPaise(values.stampDuty),
    dpCharges: roundPaise(values.dpCharges),
    total: roundPaise(Object.values(values).reduce((sum, value) => sum + value, 0)),
  };
}

export function calculateUpstoxOptionCharges({ side, quantity, price }: Omit<EquityChargeInput, "product">): EquityChargeBreakdown {
  const premiumTurnover = Math.max(0, quantity * price);
  const brokerage = premiumTurnover > 0 ? 20 : 0;
  const stt = side === "SELL" ? premiumTurnover * 0.0015 : 0;
  const transactionCharges = premiumTurnover * 0.0003503;
  const ipftCharges = premiumTurnover * 0.000005;
  const sebiCharges = premiumTurnover * 0.000001;
  const stampDuty = side === "BUY" ? premiumTurnover * 0.00003 : 0;
  const dpCharges = 0;
  const gst = (brokerage + transactionCharges + ipftCharges) * 0.18;
  const values = { brokerage, stt, transactionCharges, ipftCharges, sebiCharges, gst, stampDuty, dpCharges };
  return {
    brokerage: roundPaise(brokerage),
    stt: roundPaise(stt),
    transactionCharges: roundPaise(transactionCharges),
    ipftCharges: roundPaise(ipftCharges),
    sebiCharges: roundPaise(sebiCharges),
    gst: roundPaise(gst),
    stampDuty: roundPaise(stampDuty),
    dpCharges: 0,
    total: roundPaise(Object.values(values).reduce((sum, value) => sum + value, 0)),
  };
}

export function calculateUpstoxFutureCharges({ side, quantity, price }: Omit<EquityChargeInput, "product">): EquityChargeBreakdown {
  const turnover = Math.max(0, quantity * price);
  const brokerage = Math.min(20, turnover * 0.0005);
  const stt = side === "SELL" ? turnover * 0.0005 : 0;
  const transactionCharges = turnover * 0.0000173;
  const ipftCharges = turnover * 0.000001;
  const sebiCharges = turnover * 0.000001;
  const stampDuty = side === "BUY" ? turnover * 0.00002 : 0;
  const dpCharges = 0;
  const gst = (brokerage + transactionCharges + ipftCharges) * 0.18;
  const values = { brokerage, stt, transactionCharges, ipftCharges, sebiCharges, gst, stampDuty, dpCharges };
  return {
    brokerage: roundPaise(brokerage),
    stt: roundPaise(stt),
    transactionCharges: roundPaise(transactionCharges),
    ipftCharges: roundPaise(ipftCharges),
    sebiCharges: roundPaise(sebiCharges),
    gst: roundPaise(gst),
    stampDuty: roundPaise(stampDuty),
    dpCharges: 0,
    total: roundPaise(Object.values(values).reduce((sum, value) => sum + value, 0)),
  };
}

export function calculateUpstoxTradingCharges(
  assetType: ChargeableAssetType | undefined,
  input: EquityChargeInput,
): EquityChargeBreakdown {
  if (assetType === "OPTION") return calculateUpstoxOptionCharges(input);
  if (assetType === "FUTURE") return calculateUpstoxFutureCharges(input);
  return calculateUpstoxEquityCharges(input);
}
