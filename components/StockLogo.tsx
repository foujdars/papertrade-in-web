"use client";

import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { resolveStockLogo, stockLogoDirectory, type LogoInstrument } from "@/lib/stock-logo";

const LogoDirectory = createContext<ReadonlyMap<string, string>>(new Map());

export function StockLogoProvider({ instruments, children }: { instruments: readonly LogoInstrument[]; children: ReactNode }) {
  const directory = useMemo(() => stockLogoDirectory(instruments), [instruments]);
  return <LogoDirectory.Provider value={directory}>{children}</LogoDirectory.Provider>;
}

function LogoImage({ src, symbol, size }: { src: string | null; symbol: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return <span className={`symbol-avatar stock-logo${src && !failed ? " has-company-logo" : ""}`} style={{ "--stock-logo-size": `${size}px` } as CSSProperties} aria-hidden="true">
    {src && !failed
      // Native lazy images avoid downloading artwork for the entire NSE universe.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : symbol.slice(0, 2).toUpperCase()}
  </span>;
}

export function StockLogo({ size = 38, ...instrument }: LogoInstrument & { size?: number }) {
  const directory = useContext(LogoDirectory);
  const src = resolveStockLogo(instrument, directory);
  // A new symbol/source must not inherit a previous image's failure state.
  return <LogoImage key={`${instrument.symbol}:${src}`} src={src} symbol={instrument.symbol} size={size} />;
}
