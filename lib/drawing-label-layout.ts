export type DrawingLabel = { text: string; x: number; y: number; align?: CanvasTextAlign; color?: string; fontSize?: number; anchored?: boolean };
export type LabelBox = { x: number; y: number; width: number; height: number; fontSize: number; text: string; color?: string };
/** CSS-pixel layout: labels never leave the plot or cover another label in this drawing. */
export function layoutDrawingLabels(labels: DrawingLabel[], width: number, height: number, measure: (text: string, size: number) => number): LabelBox[] {
  const placed: LabelBox[] = [], padding = 5, top = Math.min(48, height / 5);
  if (width < 24 || height < 24) return placed;
  for (const label of labels) {
    // User text belongs to its chart point. Clip it instead of relocating it
    // to an edge or a collision-free row when the candle moves off-screen.
    if (label.anchored) {
      const size = label.fontSize ?? 12, w = measure(label.text, size);
      const offset = label.align === 'center' ? w / 2 : label.align === 'right' || label.align === 'end' ? w : 0;
      if(label.x < 0 || label.x > width || label.y < 0 || label.y > height) continue;
      placed.push({text:label.text,x:label.x-offset,y:label.y-size,width:w,height:size+5,fontSize:size,color:label.color});
      continue;
    }
    const text = label.text.replaceAll("$", "₹");
    let size = label.fontSize ?? 12;
    while (size > 10 && measure(text, size) > width - padding * 2) size--;
    const w = Math.min(width - padding * 2, measure(text, size)), h = size + 5;
    const offset = label.align === "center" ? w / 2 : label.align === "right" || label.align === "end" ? w : 0;
    const preferred = Math.max(padding, Math.min(width - padding - w, label.x - offset));
    const originY = Math.max(top, Math.min(height - h - padding, label.y - size));
    let result: LabelBox | undefined;
    for (let row = 0; row < Math.ceil(height / (h + 3)) && !result; row++) {
      for (const y of row ? [originY + row * (h + 3), originY - row * (h + 3)] : [originY]) {
        if (y < top || y + h > height - padding) continue;
        for (const x of [preferred, padding, width - padding - w]) {
          if (placed.some(b => x < b.x + b.width + 4 && x + w + 4 > b.x && y < b.y + b.height + 3 && y + h + 3 > b.y)) continue;
          result = { text, x, y, width: w, height: h, fontSize: size, color: label.color }; break;
        }
        if (result) break;
      }
    }
    // In an impossibly crowded plot, omit excess labels instead of painting overlaps.
    if (result) placed.push(result);
  }
  return placed;
}
export function paintDrawingLabels(ctx: CanvasRenderingContext2D, labels: DrawingLabel[], width: number, height: number) {
  ctx.save();
  const layout = layoutDrawingLabels(labels, width, height, (text, size) => { ctx.font = `${size}px sans-serif`; return ctx.measureText(text).width; });
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  for (const item of layout) {
    ctx.font = `${item.fontSize}px sans-serif`; ctx.fillStyle = item.color ?? "#7851c9";
    ctx.fillText(item.text, item.x, item.y, item.width);
  }
  ctx.restore();
}
