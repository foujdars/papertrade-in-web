import type { IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneView, SeriesAttachedParameter, Time } from "lightweight-charts";
import type { Candle } from "./market";
import { buildVolumeProfile } from "./volume-profile";
import { isProfileStyle, type ChartStyleId } from "./chart-style";

const TPO_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function sessionKey(time: number, timeframe: string) {
  const date = new Date((time + (["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19800)) * 1000);
  if (timeframe === "1W") {
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day);
  }
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

export class ChartProfileOverlay implements ISeriesPrimitive<Time> {
  chart?: IChartApi;
  series?: ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area" | "Baseline" | "Histogram">;
  request?: () => void;
  style: ChartStyleId = "candles";
  data: Candle[] = [];
  timeframe = "5m";

  attached(params: SeriesAttachedParameter<Time>) {
    this.chart = params.chart;
    this.series = params.series as ChartProfileOverlay["series"];
    this.request = params.requestUpdate;
  }

  detached() {
    this.chart = undefined;
    this.series = undefined;
    this.request = undefined;
  }

  update(style: ChartStyleId, data: Candle[], timeframe: string) {
    this.style = style;
    this.data = data;
    this.timeframe = timeframe;
    this.request?.();
  }

  paneViews(): IPrimitivePaneView[] {
    return [{ renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => this.paint(ctx, mediaSize.width, mediaSize.height)) }) }];
  }

  private paint(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (!isProfileStyle(this.style) || !this.chart || !this.series || !this.data.length) return;
    const visible = this.chart.timeScale().getVisibleLogicalRange();
    if (!visible) return;
    const from = Math.max(0, Math.floor(visible.from));
    const to = Math.min(this.data.length, Math.ceil(visible.to) + 1);
    const visibleBars = this.data.slice(from, to);
    if (!visibleBars.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    if (this.style === "volume-footprint") this.paintFootprint(ctx, visibleBars, from);
    else if (this.style === "tpo") this.paintTpo(ctx, visibleBars);
    else this.paintSessionProfile(ctx, visibleBars);
    ctx.restore();
  }

  private paintFootprint(ctx: CanvasRenderingContext2D, bars: Candle[], from: number) {
    const spacing = this.chart!.timeScale().options().barSpacing ?? 6;
    if (spacing < 7) return;
    const rows = spacing >= 16 ? 10 : 6;
    ctx.font = `${Math.max(8, Math.min(11, spacing - 4))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let index = 0; index < bars.length; index += 1) {
      const candle = bars[index];
      const x = this.chart!.timeScale().logicalToCoordinate((from + index) as never);
      if (x === null) continue;
      const bins = buildVolumeProfile([candle], candle.time, candle.time, rows);
      const max = Math.max(0, ...bins.map((bin) => bin.volume));
      if (!max) continue;
      const half = Math.max(4, spacing * 0.42);
      for (const bin of bins) {
        const top = this.series!.priceToCoordinate(bin.high);
        const bottom = this.series!.priceToCoordinate(bin.low);
        if (top === null || bottom === null) continue;
        const h = Math.max(1, bottom - top);
        const buy = bin.volume * (bin.upVolume / (bin.volume || 1));
        const sell = bin.volume - buy;
        const buyW = (buy / max) * half;
        const sellW = (sell / max) * half;
        ctx.fillStyle = "rgba(240,68,88,.55)";
        ctx.fillRect(x - sellW, top, sellW, h);
        ctx.fillStyle = "rgba(0,166,126,.55)";
        ctx.fillRect(x, top, buyW, h);
        if (spacing >= 14 && h >= 10) {
          ctx.fillStyle = "#4b5568";
          ctx.fillText(String(Math.round(bin.volume)), x, top + h / 2);
        }
      }
    }
  }

  private paintTpo(ctx: CanvasRenderingContext2D, bars: Candle[]) {
    const sessions = new Map<string, Candle[]>();
    for (const candle of bars) {
      const key = sessionKey(candle.time, this.timeframe);
      const list = sessions.get(key) ?? [];
      list.push(candle);
      sessions.set(key, list);
    }
    ctx.font = "9px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const session of sessions.values()) {
      const low = Math.min(...session.map((candle) => candle.low));
      const high = Math.max(...session.map((candle) => candle.high));
      const rows = Math.max(12, Math.min(36, session.length * 2));
      const step = (high - low || 1) / rows;
      const letters: string[][] = Array.from({ length: rows }, () => []);
      session.forEach((candle, index) => {
        const letter = TPO_LETTERS[index % TPO_LETTERS.length];
        const from = Math.max(0, Math.min(rows - 1, Math.floor((candle.low - low) / step)));
        const to = Math.max(0, Math.min(rows - 1, Math.floor((candle.high - low) / step)));
        for (let row = from; row <= to; row += 1) letters[row].push(letter);
      });
      const first = this.chart!.timeScale().timeToCoordinate(session[0].time as never);
      if (first === null) continue;
      ctx.fillStyle = "rgba(41,98,255,.78)";
      for (let row = 0; row < rows; row += 1) {
        const y = this.series!.priceToCoordinate(low + (row + 0.5) * step);
        if (y === null || !letters[row].length) continue;
        ctx.fillText(letters[row].join(""), first + 4, y);
      }
    }
  }

  private paintSessionProfile(ctx: CanvasRenderingContext2D, bars: Candle[]) {
    const sessions = new Map<string, Candle[]>();
    for (const candle of bars) {
      const key = sessionKey(candle.time, this.timeframe);
      const list = sessions.get(key) ?? [];
      list.push(candle);
      sessions.set(key, list);
    }
    for (const session of sessions.values()) {
      const bins = buildVolumeProfile(session, -Infinity, Infinity, 24);
      const max = Math.max(0, ...bins.map((bin) => bin.volume));
      if (!max) continue;
      const last = this.chart!.timeScale().timeToCoordinate(session.at(-1)!.time as never);
      if (last === null) continue;
      const width = Math.max(28, Math.min(88, (this.chart!.timeScale().options().barSpacing ?? 6) * session.length * 0.18));
      for (const bin of bins) {
        const top = this.series!.priceToCoordinate(bin.high);
        const bottom = this.series!.priceToCoordinate(bin.low);
        if (top === null || bottom === null) continue;
        const h = Math.max(1, bottom - top);
        const w = (bin.volume / max) * width;
        ctx.fillStyle = "rgba(102,87,238,.28)";
        ctx.fillRect(last - w, top, w, h);
        const poc = bins.reduce((best, next) => next.volume > best.volume ? next : best);
        if (bin === poc) {
          ctx.fillStyle = "rgba(102,87,238,.7)";
          ctx.fillRect(last - w, top, w, h);
        }
      }
    }
  }
}
