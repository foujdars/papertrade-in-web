"use client";
import { useEffect, useState } from "react";
import { heatLevel, type SectorTile } from "@/lib/sector-heat";

export function SectorHeat({ onWatch, onOpen }: { onWatch: (index: string) => void; onOpen: (symbol: string) => void }) {
  const [sectors, setSectors] = useState<SectorTile[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/market/sector-heat", { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => {
          if (!body?.ok || !Array.isArray(body.sectors)) { setFailed(true); return; }
          setFailed(false);
          setSectors(body.sectors);
        })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  return <section className="home-section home-sector-heat" aria-label="Sector heat map">
    <header><span><b>Sector heat map</b></span><small>NSE</small></header>
    {sectors?.length ? <div className="home-heat">{sectors.map(sector => {
      const linked = Boolean(sector.watch || sector.chart);
      return <button key={sector.id} type="button" className={`heat-${heatLevel(sector.change)}${linked ? " is-link" : ""}`} onClick={() => { if (sector.watch) onWatch(sector.watch); else if (sector.chart) onOpen(sector.chart); }} aria-label={`${sector.label} ${sector.change > 0 ? "up" : sector.change < 0 ? "down" : "flat"} ${Math.abs(sector.change).toFixed(2)} percent`}>
        <b>{sector.label}</b>
        <strong>{sector.change > 0 ? "+" : ""}{sector.change.toFixed(2)}%</strong>
      </button>;
    })}</div> : <div className="india-pulse-wait">{failed ? "Sector heat map unavailable" : "Loading sector heat map"}</div>}
  </section>;
}
