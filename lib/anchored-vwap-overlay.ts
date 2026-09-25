import type { IChartApi, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, Time } from "lightweight-charts";
import type { Candle } from "./market";
import { anchoredVwap } from "./anchored-vwap";

export class AnchoredVwapOverlay implements ISeriesPrimitive<Time> {
  chart?: IChartApi;
  series?: ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area" | "Baseline" | "Histogram">;
  request?: () => void;
  candles: Candle[] = [];
  anchor: number | null = null;

  attached(params: SeriesAttachedParameter<Time>) {
    this.chart = params.chart;
    this.series = params.series as AnchoredVwapOverlay["series"];
    this.request = params.requestUpdate;
  }

  detached() {
    this.chart = undefined;
    this.series = undefined;
    this.request = undefined;
  }

  update(candles: Candle[], anchor: number | null) {
    this.candles = candles;
    this.anchor = anchor;
    this.request?.();
    requestAnimationFrame(() => this.request?.());
  }

  paneViews(): IPrimitivePaneView[] {
    return [{ renderer: () => ({ draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.paint(context, mediaSize.width, mediaSize.height)) }) }];
  }

  private paint(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (!this.chart || !this.series || this.anchor == null || !this.candles.length) return;
    const points = anchoredVwap(this.candles, this.anchor);
    if (points.length < 2) return;
    const scale = this.chart.timeScale();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    ctx.strokeStyle = "#d946ef";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let moved = false;
    let first: { x: number; y: number } | null = null;
    for (const point of points) {
      let lo = 0;
      let hi = this.candles.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.candles[mid].time < point.time) lo = mid + 1;
        else hi = mid;
      }
      const x = scale.logicalToCoordinate(lo as never);
      const y = this.series.priceToCoordinate(point.value);
      if (x == null || y == null) continue;
      if (!moved) {
        ctx.moveTo(x, y);
        first = { x, y };
        moved = true;
      } else ctx.lineTo(x, y);
    }
    if (moved) ctx.stroke();
    if (first) {
      ctx.font = "700 10px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#d946ef";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("AVWAP", first.x + 4, Math.max(12, first.y - 4));
    }
    ctx.restore();
  }
}
