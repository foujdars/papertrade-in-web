import type { ChartStyleId } from "@/lib/chart-style";

export function ChartStyleGlyph({ id }: { id: ChartStyleId }) {
  return (
    <svg className="chart-style-glyph" width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      {id === "bars" && <><path d="M4 3v10M3 5h2M3 11h2" /><path d="M11 1v14M10 4h2M10 12h2" /><path d="M18 4v9M17 6h2M17 11h2" /></>}
      {id === "candles" && <><path d="M4 2v12" /><rect x="2.4" y="5" width="3.2" height="6" rx=".4" fill="currentColor" /><path d="M11 1v14" /><rect x="9.4" y="4" width="3.2" height="7" rx=".4" fill="currentColor" /><path d="M18 3v11" /><rect x="16.4" y="6" width="3.2" height="5" rx=".4" fill="currentColor" /></>}
      {id === "hollow-candles" && <><path d="M4 2v12" /><rect x="2.4" y="5" width="3.2" height="6" rx=".4" fill="none" /><path d="M11 1v14" /><rect x="9.4" y="4" width="3.2" height="7" rx=".4" fill="currentColor" /><path d="M18 3v11" /><rect x="16.4" y="6" width="3.2" height="5" rx=".4" fill="none" /></>}
      {id === "volume-candles" && <><path d="M4 2v12" /><rect x="2.2" y="5" width="3.6" height="6" rx=".4" fill="currentColor" /><path d="M11 1v14" /><rect x="10" y="4" width="2" height="7" rx=".3" fill="currentColor" opacity=".55" /><path d="M18 3v11" /><rect x="16.6" y="6" width="2.8" height="5" rx=".4" fill="currentColor" /></>}
      {id === "line" && <path d="M2 12l4-5 4 2 4-7 6 4" fill="none" />}
      {id === "line-markers" && <><path d="M2 12l4-5 4 2 4-7 6 4" fill="none" /><circle cx="6" cy="7" r="1.3" fill="currentColor" /><circle cx="10" cy="9" r="1.3" fill="currentColor" /><circle cx="14" cy="2" r="1.3" fill="currentColor" /></>}
      {id === "step-line" && <path d="M2 12h4V7h4V9h4V2h6" fill="none" />}
      {id === "area" && <><path d="M2 14V12l4-5 4 2 4-7 6 4v8z" opacity=".28" stroke="none" fill="currentColor" /><path d="M2 12l4-5 4 2 4-7 6 4" fill="none" /></>}
      {id === "hlc-area" && <><path d="M2 13V10l4-4 4 1 4-5 6 3v8z" opacity=".22" stroke="none" fill="currentColor" /><path d="M2 8l4-3 4 1 4-4 6 2" fill="none" opacity=".55" /><path d="M2 12l4-4 4 2 4-6 6 4" fill="none" /></>}
      {id === "baseline" && <><path d="M2 8h18" opacity=".4" /><path d="M2 12l4-5 4 2 4-7 6 4" fill="none" /></>}
      {id === "columns" && <><rect x="2" y="8" width="3" height="7" rx=".4" fill="currentColor" /><rect x="7" y="4" width="3" height="11" rx=".4" fill="currentColor" /><rect x="12" y="6" width="3" height="9" rx=".4" fill="currentColor" /><rect x="17" y="2" width="3" height="13" rx=".4" fill="currentColor" /></>}
      {id === "high-low" && <><path d="M4 3v10M11 1v14M18 4v9" /></>}
      {id === "volume-footprint" && <><path d="M4 2v12M11 1v14M18 3v11" /><rect x="2.5" y="6" width="3" height="4" rx=".3" fill="currentColor" opacity=".45" /><rect x="9.5" y="4" width="3" height="6" rx=".3" fill="currentColor" opacity=".45" /><rect x="16.5" y="7" width="3" height="3" rx=".3" fill="currentColor" opacity=".45" /></>}
      {id === "tpo" && <><text x="2" y="7" fontSize="6">ABC</text><text x="2" y="14" fontSize="6">DEF</text><text x="12" y="10" fontSize="6">GHI</text></>}
      {id === "session-volume-profile" && <><path d="M3 2v12" /><rect x="3" y="3" width="14" height="2.2" rx=".4" fill="currentColor" opacity=".35" /><rect x="3" y="6.4" width="17" height="2.2" rx=".4" fill="currentColor" /><rect x="3" y="9.8" width="10" height="2.2" rx=".4" fill="currentColor" opacity=".5" /></>}
      {id === "heikin-ashi" && <><path d="M4 2v12" /><rect x="2.4" y="6" width="3.2" height="5" rx=".4" fill="currentColor" /><path d="M11 1v14" /><rect x="9.4" y="5" width="3.2" height="6" rx=".4" fill="none" /><path d="M18 2v12" /><rect x="16.4" y="4" width="3.2" height="8" rx=".4" fill="currentColor" /></>}
    </svg>
  );
}
