// Presentation only: positions come from the existing VIX bands and put/call OI share.
const bands = [{ name: 'Calm', range: '<15', tone: 'calm' }, { name: 'Watch', range: '15–20', tone: 'watch' }, { name: 'Elevated', range: '20–30', tone: 'elevated' }, { name: 'High', range: '30+', tone: 'high' }];
const point = (percent: number) => {
  const angle = Math.PI * (1 - percent / 100);
  return `${(120 + 98 * Math.cos(angle)).toFixed(1)},${(146 - 98 * Math.sin(angle)).toFixed(1)}`;
};
const arc = (start: number, end: number) => `M${point(start)} A98,98 0 0 1 ${point(end)}`;

export function MarketGauge({ variant, position, label, putOi = '—', callOi = '—' }: { variant: 'vix' | 'pcr'; position: number | null; label: string; putOi?: string; callOi?: string }) {
  const valid = position !== null && Number.isFinite(position);
  return <svg className={`india-market-gauge india-gauge-${variant}`} viewBox="0 0 240 169" role="img" aria-label={label}>
    <title>{label}</title>
    <path className="india-gauge-track" d={arc(0, 100)} />
    {variant === 'vix' ? bands.map((band, i) => <g key={band.name}>
      <path className={`india-gauge-arc ${band.tone}`} d={arc(i * 25 + .6, (i + 1) * 25 - .6)} />
      <text className="india-gauge-band" x={[24, 82, 158, 216][i]} y={i === 0 || i === 3 ? 45 : 15} textAnchor="middle">{band.name}</text>
      <text className="india-gauge-threshold" x={[24, 82, 158, 216][i]} y={i === 0 || i === 3 ? 58 : 28} textAnchor="middle">{band.range}</text>
    </g>) : <>
      <path className="india-gauge-arc put" d={arc(.6, 49.4)} /><path className="india-gauge-arc call" d={arc(50.6, 99.4)} />
      <text className="india-gauge-oi put" x="7" y="27">Put OI</text><text className="india-gauge-oi-value put" x="7" y="43">{putOi}</text>
      <text className="india-gauge-oi call" x="233" y="27" textAnchor="end">Call OI</text><text className="india-gauge-oi-value call" x="233" y="43" textAnchor="end">{callOi}</text>
    </>}
    {valid ? <g className="india-gauge-needle" transform={`translate(120 146) rotate(${-90 + Math.max(0, Math.min(100, position)) * 1.8})`}>
      <path d="M-4,0 L0,-78 L4,0 Z" /><circle cx="0" cy="0" r="8" />
    </g> : null}
  </svg>;
}
