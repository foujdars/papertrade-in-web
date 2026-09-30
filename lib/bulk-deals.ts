export type Deal = {
  symbol: string;
  name: string;
  isin: string;
  client: string;
  side: "Buy" | "Sell";
  kind: "Bulk" | "Block";
  qty: number;
  price: number;
  value: number;
  date: string;
};

export type DealGroup = {
  symbol: string;
  name: string;
  isin: string;
  rows: Deal[];
};

export function dealValue(value: number) {
  if (!(value > 0)) return "—";
  if (value >= 1e7) {
    const crore = value / 1e7;
    return `₹${crore.toLocaleString("en-IN", { maximumFractionDigits: crore >= 100 ? 0 : 1 })} cr`;
  }
  if (value >= 1e5) return `₹${(value / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function presentDeals(rows: unknown[]): Deal[] {
  const deals: Deal[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (item.exch !== "NSE" || item.seg !== "E") continue;
    const kind = String(item.deal ?? "").toUpperCase();
    if (kind !== "BULK" && kind !== "BLOCK") continue;
    const symbol = String(item.sym ?? "").trim();
    const qty = Number(item.qty);
    const price = Number(item.avgprice);
    const value = Number(item.val) || (qty > 0 && price > 0 ? qty * price : 0);
    const date = String(item.date ?? "").slice(0, 10);
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(value > 0)) continue;
    deals.push({
      symbol,
      name: String(item.csym || item.scname || symbol),
      isin: /^IN[A-Z0-9]{10}$/.test(String(item.isin ?? "")) ? String(item.isin) : "",
      client: String(item.cname || "—").trim() || "—",
      side: String(item.bs ?? "").toUpperCase() === "B" ? "Buy" : "Sell",
      kind: kind === "BLOCK" ? "Block" : "Bulk",
      qty: qty > 0 ? qty : 0,
      price: price > 0 ? price : 0,
      value,
      date,
    });
  }
  return deals.sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol));
}

export function latestSession(deals: Deal[]) {
  const date = deals.reduce((latest, deal) => deal.date > latest ? deal.date : latest, "");
  return { date, rows: date ? deals.filter(deal => deal.date === date) : [] };
}

export function groupDeals(deals: Deal[]): DealGroup[] {
  const groups = new Map<string, Deal[]>();
  for (const deal of deals) {
    const rows = groups.get(deal.symbol) ?? [];
    rows.push(deal);
    groups.set(deal.symbol, rows);
  }
  return [...groups.values()].map(rows => {
    rows.sort((a, b) => b.value - a.value);
    return { symbol: rows[0].symbol, name: rows[0].name, isin: rows[0].isin, rows };
  }).sort((a, b) => b.rows[0].value - a.rows[0].value || a.symbol.localeCompare(b.symbol));
}
