export type EquityChargeBreakdown = {
  brokerage: number;
  stt: number;
  transactionCharges: number;
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

const roundPaise = (value: number) => Math.round(value * 100) / 100;

export function calculateUpstoxEquityCharges({ side, product, quantity, price }: EquityChargeInput): EquityChargeBreakdown {
  const turnover = Math.max(0, quantity * price);
  const brokerage = product === "INTRADAY" ? Math.min(20, turnover * 0.001) : Math.min(20, turnover * 0.025);
  const stt = product === "DELIVERY" ? turnover * 0.001 : side === "SELL" ? turnover * 0.00025 : 0;
  const transactionCharges = turnover * 0.0000307;
  const sebiCharges = turnover * 0.000001;
  const stampDuty = side === "BUY" ? turnover * (product === "DELIVERY" ? 0.00015 : 0.00003) : 0;
  const dpCharges = product === "DELIVERY" && side === "SELL" ? 20 : 0;
  const gst = (brokerage + transactionCharges + sebiCharges + dpCharges) * 0.18;
  const values = { brokerage, stt, transactionCharges, sebiCharges, gst, stampDuty, dpCharges };
  return {
    brokerage: roundPaise(values.brokerage),
    stt: roundPaise(values.stt),
    transactionCharges: roundPaise(values.transactionCharges),
    sebiCharges: roundPaise(values.sebiCharges),
    gst: roundPaise(values.gst),
    stampDuty: roundPaise(values.stampDuty),
    dpCharges: roundPaise(values.dpCharges),
    total: roundPaise(Object.values(values).reduce((sum, value) => sum + value, 0)),
  };
}
