// Adapted from foujdars/stock-scout, commit adc9324a51a21102554aae5e6d2e7a6c8ea576a2.
export type GateStatus = "review" | "rejected";
export type Decision = "pending" | "approved" | "rejected";

export type RuleCheck = {
  id: string;
  label: string;
  rule: string;
  value: number | string | null;
  pass: boolean;
};

export type StockMetrics = {
  currentPrice: number | null;
  pledged: number | null;
  roe: number | null;
  roe3: number | null;
  roe5: number | null;
  roce: number | null;
  roce3: number | null;
  roce5: number | null;
  debtEquity: number | null;
  netProfit: number | null;
  pe: number | null;
  industryPe: number | null;
  profit3: number | null;
  profit5: number | null;
  sales3: number | null;
  sales5: number | null;
  opm: number | null;
  peg: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  return1: number | null;
  return3: number | null;
  return5: number | null;
  quarterSales: number | null;
  quarterProfit: number | null;
  quarterSalesGrowth: number | null;
  quarterProfitGrowth: number | null;
  ttmSales: number | null;
  ttmProfit: number | null;
  priorYearSales: number | null;
  priorYearProfit: number | null;
};

export type ScreeningResult = {
  id: string;
  name: string;
  isin: string;
  nseCode: string;
  bseCode: string;
  industry: string;
  isFinancial: boolean;
  gateStatus: GateStatus;
  decision: Decision;
  notes: string;
  checks: RuleCheck[];
  failures: string[];
  warnings: string[];
  metrics: StockMetrics;
};

export type ScreeningRunPayload = {
  id?: string;
  fileName: string;
  importedAt: string;
  /** Version supplied by the server-side monthly data feed, when available. */
  sourceVersion?: string;
  dataAsOf?: string;
  results: ScreeningResult[];
  missingColumns: string[];
};

const completenessMetricKeys: ReadonlyArray<keyof StockMetrics> = [
  "currentPrice",
  "pledged",
  "roe",
  "roe3",
  "roe5",
  "roce",
  "roce3",
  "roce5",
  "debtEquity",
  "netProfit",
  "pe",
  "industryPe",
  "profit3",
  "profit5",
  "sales3",
  "sales5",
  "opm",
  "peg",
  "currentRatio",
  "quickRatio",
  "promoter",
  "fii",
  "dii",
  "quarterSales",
  "quarterProfit",
  "quarterSalesGrowth",
  "quarterProfitGrowth",
  "ttmSales",
  "ttmProfit",
  "priorYearSales",
  "priorYearProfit",
];

function hasText(value: string) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized && normalized !== "-" && normalized !== "na");
}

export function hasCompleteCompanyData(result: ScreeningResult) {
  return (
    hasText(result.name) &&
    !/^Company \d+$/i.test(result.name.trim()) &&
    hasText(result.isin) &&
    hasText(result.nseCode) &&
    hasText(result.bseCode) &&
    hasText(result.industry) &&
    result.industry !== "Unclassified" &&
    completenessMetricKeys.every((key) => result.metrics[key] != null)
  );
}

export function screenerCompanyUrl(result: ScreeningResult) {
  const rawCode = hasText(result.nseCode)
    ? result.nseCode
    : hasText(result.bseCode)
      ? result.bseCode
      : "";
  const code = rawCode.trim().replace(/\.0+$/, "");
  return code
    ? `https://www.screener.in/company/${encodeURIComponent(code)}/consolidated/`
    : null;
}

type CsvRow = Record<string, string>;

const aliasMap = {
  name: ["name", "company", "companyname"],
  isin: ["isin", "isincode"],
  nseCode: ["nsecode", "nse", "nsesymbol"],
  bseCode: ["bsecode", "bse", "bsecodevalue"],
  industry: ["industry", "industryname", "sector"],
  currentPrice: ["currentprice", "cmp", "cmprs"],
  pledged: ["pledgedpercentage", "pledged", "pledgedpercent"],
  roe: ["returnonequity", "roe"],
  roe3: ["averagereturnonequity3years", "roe3yr", "roe3yrs", "roe3years"],
  roe5: ["averagereturnonequity5years", "roe5yr", "roe5yrs", "roe5years"],
  roce: ["returnoncapitalemployed", "roce"],
  roce3: ["averagereturnoncapitalemployed3years", "roce3yr", "roce3yrs", "roce3years"],
  roce5: ["averagereturnoncapitalemployed5years", "roce5yr", "roce5yrs", "roce5years"],
  debtEquity: ["debttoequity", "debteq", "debtequity"],
  netProfit: ["netprofit", "netprofitrscr", "netprofitannual"],
  pe: ["pricetoearning", "pricetoearnings", "stockpe", "pe"],
  industryPe: ["industrype", "industrypricetoearning", "indpe"],
  profit3: ["profitgrowth3years", "profitgrowth3yr", "profitgrowth3yrs"],
  profit5: ["profitgrowth5years", "profitgrowth5yr", "profitgrowth5yrs"],
  sales3: ["salesgrowth3years", "salesgrowth3yr", "salesgrowth3yrs"],
  sales5: ["salesgrowth5years", "salesgrowth5yr", "salesgrowth5yrs"],
  opm: ["opm", "opmpercentage", "operatingprofitmargin"],
  peg: ["pegratio", "peg"],
  currentRatio: ["currentratio"],
  quickRatio: ["quickratio"],
  promoter: ["promoterholding", "promhold"],
  fii: ["fiiholding", "fiihold"],
  dii: ["diiholding", "diihold"],
  return1: ["returnover1year", "return1year", "1yrreturn", "1yearreturn"],
  return3: ["returnover3years", "return3years", "3yrsreturn", "3yearreturn"],
  return5: ["returnover5years", "return5years", "5yrsreturn", "5yearreturn"],
  quarterSales: ["saleslatestquarter", "salesqtr", "salesqtrrscr"],
  quarterProfit: ["netprofitlatestquarter", "npqtr", "npqtrrscr"],
  quarterSalesGrowth: ["yoyquarterlysalesgrowth", "qtrsalesvar", "qtrsalesvarpercentage"],
  quarterProfitGrowth: ["yoyquarterlyprofitgrowth", "qtrprofitvar", "qtrprofitvarpercentage"],
  ttmSales: ["sales", "sales12m", "salesttm", "saleslast12months"],
  ttmProfit: ["netprofit", "netprofit12m", "netprofitttm", "netprofitlast12months"],
  priorYearSales: ["saleslastyear", "salespreviousyear", "salesprecedingyear"],
  priorYearProfit: ["netprofitlastyear", "netprofitpreviousyear", "netprofitprecedingyear"],
} as const;

export const recommendedColumns = [
  "Name",
  "ISIN Code",
  "NSE Code",
  "BSE Code",
  "Industry",
  "Pledged percentage",
  "Return on equity",
  "Average return on equity 3Years",
  "Average return on equity 5Years",
  "Return on capital employed",
  "Average return on capital employed 3Years",
  "Average return on capital employed 5Years",
  "Debt to equity",
  "Net Profit",
  "Price to Earning",
  "Industry PE",
  "Profit growth 3Years",
  "Profit growth 5Years",
  "Sales growth 3Years",
  "Sales growth 5Years",
  "OPM",
  "PEG Ratio",
  "Current ratio",
  "Quick ratio",
  "Promoter holding",
  "FII holding",
  "DII holding",
  "Return over 1year",
  "Return over 3years",
  "Return over 5years",
  "Current Price",
  "Sales latest quarter",
  "Net profit latest quarter",
  "YOY Quarterly sales growth",
  "YOY Quarterly profit growth",
  "Sales",
  "Sales last year",
  "Net Profit last year",
];

const mandatoryKeys = [
  "name",
  "nseCode",
  "bseCode",
  "industry",
  "pledged",
  "roe",
  "roe3",
  "roe5",
  "roce",
  "roce3",
  "roce5",
  "debtEquity",
  "netProfit",
  "pe",
  "industryPe",
  "profit3",
  "profit5",
  "sales3",
  "sales5",
  "opm",
] as const;

const financialPattern =
  /\b(bank|banks|banking|finance|financial|nbfc|housing finance|asset management|investment|insurance|credit rating|stock broking|broking|exchange|exchanges)\b/i;

const columnLabels: Record<(typeof mandatoryKeys)[number], string> = {
  name: "Name",
  nseCode: "NSE Code",
  bseCode: "BSE Code",
  industry: "Industry",
  pledged: "Pledged percentage",
  roe: "Return on equity",
  roe3: "Average return on equity 3Years",
  roe5: "Average return on equity 5Years",
  roce: "Return on capital employed",
  roce3: "Average return on capital employed 3Years",
  roce5: "Average return on capital employed 5Years",
  debtEquity: "Debt to equity",
  netProfit: "Net Profit",
  pe: "Price to Earning",
  industryPe: "Industry PE",
  profit3: "Profit growth 3Years",
  profit5: "Profit growth 5Years",
  sales3: "Sales growth 3Years",
  sales5: "Sales growth 5Years",
  opm: "OPM",
};

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/%/g, "percentage")
    .replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const cleaned = value
    .trim()
    .replace(/[₹,%]/g, "")
    .replace(/\b(rs|cr)\b\.?/gi, "")
    .replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "na") return null;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const number = Number(cleaned.replace(/[()]/g, ""));
  return Number.isFinite(number) ? (negative ? -number : number) : null;
}

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) records.push(row);

  const headers = (records.shift() ?? []).map((header) => header.trim());
  const rows = records.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])),
  );
  return { headers, rows };
}

function buildColumnMap(headers: string[]) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapped: Record<string, string | undefined> = {};

  for (const [key, aliases] of Object.entries(aliasMap)) {
    mapped[key] =
      aliases.map((alias) => normalized.get(alias)).find(Boolean) ??
      Array.from(normalized.entries()).find(([header]) =>
        aliases.some(
          (alias) =>
            header === `${alias}percentage` ||
            header === `${alias}percent` ||
            header === `${alias}rscr`,
        ),
      )?.[1];
  }
  return mapped;
}

function getValue(row: CsvRow, columns: Record<string, string | undefined>, key: string) {
  const header = columns[key];
  return header ? row[header]?.trim() ?? "" : "";
}

function makeCheck(
  id: string,
  label: string,
  rule: string,
  value: number | string | null,
  predicate: (numberValue: number) => boolean,
): RuleCheck {
  return {
    id,
    label,
    rule,
    value,
    pass: typeof value === "number" && Number.isFinite(value) && predicate(value),
  };
}

function listingCheck(nseCode: string, bseCode: string): RuleCheck {
  return {
    id: "dual-listing",
    label: "Dual exchange listing",
    rule: "NSE and BSE codes must both be present",
    value: nseCode && bseCode ? `${nseCode} / ${bseCode}` : nseCode || bseCode || null,
    pass: Boolean(nseCode && bseCode),
  };
}

function evaluateNonFinancial(metrics: StockMetrics, nseCode: string, bseCode: string) {
  const checks = [
    listingCheck(nseCode, bseCode),
    makeCheck("pledge", "Promoter pledge", "= 0%", metrics.pledged, (value) => value === 0),
    makeCheck("roe", "ROE", "> 8%", metrics.roe, (value) => value > 8),
    makeCheck("roe3", "Average ROE · 3Y", "> 8%", metrics.roe3, (value) => value > 8),
    makeCheck("roe5", "Average ROE · 5Y", "> 8%", metrics.roe5, (value) => value > 8),
    makeCheck("roce", "ROCE", "> 8%", metrics.roce, (value) => value > 8),
    makeCheck("roce3", "Average ROCE · 3Y", "> 8%", metrics.roce3, (value) => value > 8),
    makeCheck("roce5", "Average ROCE · 5Y", "> 8%", metrics.roce5, (value) => value > 8),
    makeCheck("debt", "Debt to equity", "≤ 0.5", metrics.debtEquity, (value) => value <= 0.5),
    makeCheck("net-profit", "Net profit", "> ₹100 Cr", metrics.netProfit, (value) => value > 100),
    {
      id: "valuation",
      label: "Relative P/E",
      rule: "Positive Stock P/E ÷ Industry P/E ≤ 2",
      value:
        metrics.pe != null && metrics.industryPe != null && metrics.industryPe !== 0
          ? Number((metrics.pe / metrics.industryPe).toFixed(2))
          : null,
      pass:
        metrics.pe != null &&
        metrics.industryPe != null &&
        metrics.industryPe > 0 &&
        metrics.pe > 0 &&
        metrics.pe / metrics.industryPe <= 2,
    },
    makeCheck("profit3", "Profit growth · 3Y", "> 0%", metrics.profit3, (value) => value > 0),
    makeCheck("profit5", "Profit growth · 5Y", "> 0%", metrics.profit5, (value) => value > 0),
    makeCheck("sales3", "Sales growth · 3Y", "> 0%", metrics.sales3, (value) => value > 0),
    makeCheck("sales5", "Sales growth · 5Y", "> 0%", metrics.sales5, (value) => value > 0),
    makeCheck("opm", "Operating profit margin", "> 0%", metrics.opm, (value) => value > 0),
  ];

  return {
    checks,
    warnings: [
      "Compare PEG, current ratio and quick ratio only with companies in the same industry.",
      "Review the latest quarter and trailing-12-month trend before approval.",
      "Use the 1-year chart for short-term suitability and 3/5-year charts for longer-term suitability.",
    ],
  };
}

function evaluateFinancial(metrics: StockMetrics, nseCode: string, bseCode: string) {
  const checks = [
    listingCheck(nseCode, bseCode),
    makeCheck("roce", "ROCE", "≥ 8%", metrics.roce, (value) => value >= 8),
    makeCheck("roe", "ROE", "≥ 12%", metrics.roe, (value) => value >= 12),
    makeCheck("roe3", "Average ROE · 3Y", "≥ 12%", metrics.roe3, (value) => value >= 12),
    makeCheck("roe5", "Average ROE · 5Y", "≥ 12%", metrics.roe5, (value) => value >= 12),
    makeCheck("profit3", "Profit growth · 3Y", "> 0%", metrics.profit3, (value) => value > 0),
    makeCheck("profit5", "Profit growth · 5Y", "> 0%", metrics.profit5, (value) => value > 0),
    makeCheck("sales3", "Sales growth · 3Y", "> 0%", metrics.sales3, (value) => value > 0),
    makeCheck("sales5", "Sales growth · 5Y", "> 0%", metrics.sales5, (value) => value > 0),
  ];
  const warnings = [
    "Debt to equity is intentionally not a gate for lending businesses.",
    "Compare only with the same financial subtype: bank, housing finance, AMC, insurer or NBFC.",
    "Review the latest quarter, asset quality and 1/3/5-year price behaviour manually.",
  ];

  if (metrics.fii == null || metrics.dii == null) {
    warnings.push("FII/DII holding data is missing; the transcript requires an institutional-holding review.");
  } else if (metrics.fii === 0 && metrics.dii === 0) {
    warnings.push("Both FII and DII holdings are zero; flag for manual ownership review.");
  }

  return { checks, warnings };
}

export function evaluateScreenerCsv(text: string, fileName = "screener-export.csv") {
  const { headers, rows } = parseCsv(text);
  const columns = buildColumnMap(headers);
  const missingColumns = mandatoryKeys
    .filter((key) => !columns[key])
    .map((key) => columnLabels[key]);

  const results = rows.map((row, index): ScreeningResult => {
    const name = getValue(row, columns, "name") || `Company ${index + 1}`;
    const isin = getValue(row, columns, "isin");
    const nseCode = getValue(row, columns, "nseCode");
    const bseCode = getValue(row, columns, "bseCode");
    const industry = getValue(row, columns, "industry") || "Unclassified";
    const metrics = Object.fromEntries(
      Object.keys(aliasMap)
        .filter((key) => !["name", "isin", "nseCode", "bseCode", "industry"].includes(key))
        .map((key) => [key, parseNumber(getValue(row, columns, key))]),
    ) as StockMetrics;
    const isFinancial = financialPattern.test(industry);
    const evaluation = isFinancial
      ? evaluateFinancial(metrics, nseCode, bseCode)
      : evaluateNonFinancial(metrics, nseCode, bseCode);
    const failures = evaluation.checks
      .filter((check) => !check.pass)
      .map((check) =>
        check.value == null
          ? `${check.label}: data missing`
          : `${check.label}: ${check.value} does not meet ${check.rule}`,
      );

    return {
      id: `${isin || nseCode || bseCode || normalizeHeader(name)}:${index}`,
      name,
      isin,
      nseCode,
      bseCode,
      industry,
      isFinancial,
      gateStatus: failures.length ? "rejected" : "review",
      decision: "pending",
      notes: "",
      checks: evaluation.checks,
      failures,
      warnings: evaluation.warnings,
      metrics,
    };
  });

  return {
    fileName,
    importedAt: new Date().toISOString(),
    results,
    missingColumns,
  } satisfies ScreeningRunPayload;
}

export const sampleCsv = `Name,ISIN Code,NSE Code,BSE Code,Industry,Pledged percentage,Return on equity,Average return on equity 3Years,Average return on equity 5Years,Return on capital employed,Average return on capital employed 3Years,Average return on capital employed 5Years,Debt to equity,Net Profit,Price to Earning,Industry PE,Profit growth 3Years,Profit growth 5Years,Sales growth 3Years,Sales growth 5Years,OPM,PEG Ratio,Current ratio,Quick ratio,Promoter holding,FII holding,DII holding,Return over 1year,Return over 3years,Return over 5years
Tata Consultancy Services,INE467B01029,TCS,532540,IT - Software,0,51.2,48.5,45.4,64.1,58.2,55.7,0.08,48200,24.7,29.8,9.4,8.8,7.2,8.1,25.3,2.1,2.4,2.3,71.7,12.4,10.1,-6.2,28.4,102.6
Reliance Industries,INE002A01018,RELIANCE,500325,Refineries & Marketing,0,9.4,9.1,8.9,9.8,9.4,9.1,0.42,79020,25.6,18.4,11.2,8.6,7.4,8.2,17.1,2.4,1.1,0.8,50.1,22.4,13.7,9.2,41.3,88.5
HDFC Bank,INE040A01034,HDFCBANK,500180,Banks - Private Sector,0,14.7,16.1,16.8,8.7,8.9,9.2,6.3,67350,21.3,18.2,18.4,16.2,15.1,13.8,0,1.8,0,0,0,47.6,35.9,12.1,29.3,72.8
Transcript Finance,INE000X01001,TRANSFIN,599001,Housing Finance,0,13.8,14.6,15.2,8.4,8.7,8.9,7.2,860,14.2,18.2,12.4,10.2,11.1,9.3,0,1.2,2.1,1.8,44.2,7.1,12.3,18.2,52.1,94.7
Weak Manufacturing,INE000Y01001,WEAKCO,599002,Industrial Products,4.2,6.1,5.8,6.4,7.1,6.8,6.5,1.4,42,64,22,-8.2,-4.1,-2.4,1.2,-3.1,8.4,0.6,0.3,72,0,0,-28,-12,4`;
