/** One shared loading animation, with a quiet compact variant for inline updates. */
export function CandleLoader({ label = "Loading…", compact = false, artwork = false }: { label?: string; compact?: boolean; artwork?: boolean }) {
  return <span className={`candle-loading ${compact ? "is-compact" : ""} ${artwork ? "is-artwork" : ""}`} role="status" aria-label={label}>
    <span className="welcome-candle-loader" aria-hidden="true"><i /><i /><i /><i /></span>
    {!compact && !artwork && <span className="candle-loading-label">{label}</span>}
  </span>;
}
