import type { IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneView, SeriesAttachedParameter, Time } from "lightweight-charts";
import type { Candle } from "./market";
import { buildVolumeProfile, compactVolume, footprintLadder, volumeValueArea } from "./volume-profile";
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
    const series = this.series!;
    const scale = this.chart!.timeScale();
    for (let index = 0; index < bars.length; index += 1) {
      const candle = bars[index];
      const x = scale.logicalToCoordinate((from + index) as never);
      const yHigh = series.priceToCoordinate(candle.high);
      const yLow = series.priceToCoordinate(candle.low);
      if (x === null || yHigh === null || yLow === null) continue;
      const top = Math.min(yHigh, yLow);
      const bottom = Math.max(yHigh, yLow);
      const pixel = bottom - top;
      if (spacing < 16 || pixel < 36) {
        this.paintFootprintCandle(ctx, candle, x, yHigh, yLow);
        continue;
      }
      const rows = Math.max(4, Math.min(10, Math.floor(pixel / 18)));
      const ladder = footprintLadder(candle, rows);
      if (!ladder.length) continue;
      const area = volumeValueArea(ladder);
      const max = Math.max(...ladder.map((row) => row.volume));
      const cell = Math.min(62, Math.max(28, (spacing - 10) / 2));
      const font = Math.max(8, Math.min(12, Math.floor(pixel / rows * 0.42)));
      ctx.font = `700 ${font}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let sellTotal = 0;
      let buyTotal = 0;
      ladder.forEach((row, rowIndex) => {
        const rowTop = series.priceToCoordinate(row.high);
        const rowBottom = series.priceToCoordinate(row.low);
        if (rowTop === null || rowBottom === null) return;
        const y = Math.min(rowTop, rowBottom) + 1;
        const h = Math.max(8, Math.abs(rowBottom - rowTop) - 2);
        const poc = rowIndex === area.poc;
        const inValue = area.low >= 0 && rowIndex >= area.low && rowIndex <= area.high;
        const strength = 0.28 + 0.62 * (row.volume / max);
        this.paintFootprintCell(ctx, x - cell - 1, y, cell, h, poc ? "#1c1c1c" : inValue ? `rgba(190, 42, 62, ${strength})` : `rgba(240, 98, 112, ${strength * 0.72})`, compactVolume(row.sell), font);
        this.paintFootprintCell(ctx, x + 1, y, cell, h, poc ? "#1c1c1c" : inValue ? `rgba(8, 122, 96, ${strength})` : `rgba(18, 168, 128, ${strength * 0.72})`, compactVolume(row.buy), font);
        sellTotal += row.sell;
        buyTotal += row.buy;
        if (rowIndex === area.high || rowIndex === area.low) {
          const line = rowIndex === area.high ? Math.min(rowTop, rowBottom) : Math.max(rowTop, rowBottom);
          ctx.save();
          ctx.strokeStyle = "rgba(36, 48, 73, .55)";
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x - cell - 1, line);
          ctx.lineTo(x + cell + 1, line);
          ctx.stroke();
          ctx.restore();
        }
      });
      this.paintFootprintCandle(ctx, candle, x, yHigh, yLow);
      if (spacing >= 36) {
        ctx.font = "700 9px Inter, system-ui, sans-serif";
        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        ctx.fillStyle = "#d23b52";
        ctx.fillText(compactVolume(sellTotal), x - 3, bottom + 4);
        ctx.textAlign = "left";
        ctx.fillStyle = "#0c9a72";
        ctx.fillText(compactVolume(buyTotal), x + 3, bottom + 4);
      }
    }
  }

  private paintFootprintCell(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string, label: string, font: number) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    if (height >= font + 2 && width >= 24) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + width / 2, y + height / 2);
    }
  }

  private paintFootprintCandle(ctx: CanvasRenderingContext2D, candle: Candle, x: number, yHigh: number, yLow: number) {
    const open = candle.open ?? candle.close;
    const up = candle.close >= open;
    const yOpen = this.series!.priceToCoordinate(open);
    const yClose = this.series!.priceToCoordinate(candle.close);
    if (yOpen === null || yClose === null) return;
    ctx.strokeStyle = up ? "#00a67e" : "#f04458";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, Math.min(yHigh, yLow));
    ctx.lineTo(x, Math.max(yHigh, yLow));
    ctx.stroke();
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
    ctx.fillRect(x - 2.5, bodyTop, 5, bodyHeight);
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
