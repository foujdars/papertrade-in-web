/** Composite the native SMC SVG over Lightweight Charts' canvas export. */
export async function stampChartOverlay(canvas: HTMLCanvasElement, host: HTMLElement | null) {
  const svg = host?.parentElement?.querySelector<SVGSVGElement>(".smc-overlay");
  if (!svg || !host?.clientWidth) return;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  for (const text of copy.querySelectorAll("text")) {
    text.setAttribute("font-family", "system-ui, sans-serif");
    text.setAttribute("font-size", "12");
    text.setAttribute("font-weight", "600");
  }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = canvas.width / host.clientWidth;
    canvas.getContext("2d")?.drawImage(image, 0, 0, svg.width.baseVal.value * scale, svg.height.baseVal.value * scale);
  } finally { URL.revokeObjectURL(url); }
}
