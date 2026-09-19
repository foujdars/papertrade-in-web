import type { SVGProps } from "react";
import type { DrawingTool } from "./MarketChart";

export const QUICK_DRAWING_TOOLS: { id: DrawingTool; label: string }[] = [
  { id: "trend-line", label: "Trend line" },
  { id: "parallel-channel", label: "Parallel channel" },
  { id: "horizontal-ray", label: "Horizontal ray" },
  { id: "rectangle", label: "Rectangle" },
  { id: "vertical-line", label: "Vertical line" },
  { id: "horizontal-line", label: "Horizontal line" },
  { id: "volume-profile", label: "Fixed-range volume profile" },
  { id: "anchored-volume-profile", label: "Anchored volume profile" },
  { id: "session-volume-profile", label: "Session volume profile" },
  { id: "price-range", label: "Price measurement" },
  { id: "fib-retracement", label: "Fibonacci retracement" },
];

export function DrawingToolIcon({ tool, ...props }: SVGProps<SVGSVGElement> & { tool: DrawingTool }) {
  const point = (x: number, y: number) => <circle key={`${x}:${y}`} cx={x} cy={y} r="2" fill="var(--surface, white)" />;
  const paths: Record<string,string> = {
    ray:"M3 21L21 3M4 14L10 20", "extended-line":"M2 22L22 2M7 17L8 16M17 7L16 8", "info-line":"M3 19L18 4M13 15H22V22H13Z", "trend-angle":"M3 20L20 4M3 20H22M10 20A7 7 0 0 0 8 15", "cross-line":"M12 2V22M2 12H22M10 10H14V14H10Z",
    "regression-trend":"M3 15L20 3V10L3 22ZM3 18L20 7", "flat-top-bottom":"M3 7H21M3 21L21 12", "disjoint-channel":"M3 3L21 11M3 17L21 21M3 10L21 16",
    "andrews-pitchfork":"M3 21L17 7M10 21L21 10M3 14L14 3M3 14L10 21", "schiff-pitchfork":"M2 20L18 4M9 21L22 8M2 13L15 1M2 13L9 21", "modified-schiff-pitchfork":"M3 20L19 4M9 22L22 9M2 14L15 1M2 14L9 22M3 20H9", "inside-pitchfork":"M5 22L12 2M12 22L19 2M2 17L9 2M2 17L12 22",
    "fib-extension":"M3 9L12 3L21 7M3 13H21M3 17H21M3 21H21", "fib-channel":"M3 21L21 11M3 16L21 6M3 11L21 1", "fib-time-zone":"M3 3V21M7 3V21M12 3V21M20 3V21M2 8L9 15", "fib-time-extension":"M3 4L7 19L13 13M13 2V22M17 2V22M22 2V22", "fib-speed-fan":"M3 21L4 2M3 21L12 2M3 21L22 4M3 21L22 13M3 21H22", "fib-arcs":"M3 12A9 9 0 0 0 21 12M6 12A6 6 0 0 0 18 12M9 12A3 3 0 0 0 15 12", "fib-circles":"M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M12 6A6 6 0 1 0 12 18A6 6 0 1 0 12 6M12 10A2 2 0 1 0 12 14A2 2 0 1 0 12 10", "fib-spiral":"M3 9C4 -2 24 0 22 14C20 27 2 23 5 12C7 4 18 6 17 13C16 19 9 16 11 12", "fib-wedge":"M3 3V21H22M3 8A13 13 0 0 1 16 21M3 13A8 8 0 0 1 11 21M3 17A4 4 0 0 1 7 21", pitchfan:"M3 21L8 2M3 21L15 2M3 21L22 4M3 21L22 11M3 21L22 18",
    "gann-box":"M3 3H21V21H3ZM3 9H21M3 15H21M9 3V21M15 3V21", "gann-square":"M3 3H21V21H3ZM3 3L21 21M3 21L21 3M12 3V21M3 12H21", "gann-square-fixed":"M3 3H21V21H3ZM3 3L21 21M3 21L21 3M3 21L12 3M3 21L21 12", "gann-fan":"M3 21V2M3 21L8 2M3 21L15 2M3 21L22 7M3 21L22 15M3 21H22",
    "long-position":"M3 4H21M3 12H17M3 20H21M11 9V5M8 8L11 5L14 8", "short-position":"M3 4H21M3 12H17M3 20H21M11 15V19M8 16L11 19L14 16", forecast:"M4 4V20M2 8H6V15H2ZM12 2V18M10 5H14V12H10ZM19 7V20M17 18L19 20L21 18", "bars-pattern":"M3 5V21M1 10H5V17H1ZM10 2V17M8 6H12V13H8ZM17 4V20M15 8H19V15H15Z", projection:"M3 3V21H21M3 3Q21 3 21 21", "date-range":"M3 3V21M21 3V21M6 12H18M9 9L6 12L9 15M15 9L18 12L15 15", "date-price-range":"M3 3H21V21H3ZM7 17V7M4 10L7 7L10 10M7 17H17M14 14L17 17L14 20",
    arrow:"M3 21L21 3M13 3H21V11", "arrow-marker":"M3 13L21 3L12 22L10 14Z", "arrow-mark-up":"M12 2L3 12H8V22H16V12H21Z", "arrow-mark-down":"M12 22L3 12H8V2H16V12H21Z", "rotated-rectangle":"M3 10L14 2L22 14L11 22Z", circle:"M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3", ellipse:"M12 5A10 7 0 1 0 12 19A10 7 0 1 0 12 5", triangle:"M3 3L21 21H3Z", arc:"M3 21Q22 21 21 3M3 21L21 3", curve:"M3 21Q4 4 21 3", "double-curve":"M3 21C20 24 0 0 21 3", path:"M2 20L9 9L15 15L22 3M16 3H22V9", polyline:"M3 21V3H12V12H21V21H12V12H3", brush:"M3 21L7 14L18 3Q23 1 21 6L10 17ZM3 21Q8 19 12 22L21 18", highlighter:"M3 21L8 16L5 13L13 3L21 10L11 19L8 16M2 22H18",
    "text-annotation":"M4 3H20M12 3V21M8 21H16", "anchored-text":"M4 3H20M12 3V17M8 17H16M12 17V22", note:"M3 3H21V17H13L8 22V17H3ZM7 7H17M7 11H14", "price-note":"M3 3H21V17H12V22M8 13V7H11Q15 7 13 10H8M8 11L14 15", "price-label":"M3 21V3H21V16H8L3 21", callout:"M3 4H21V16H9L3 22ZM7 8H17M7 12H14", comment:"M3 21V11Q3 3 12 3Q21 3 21 11Q21 18 12 18H6Z", "flag-mark":"M3 22V3H21L16 9L21 15H3", pin:"M12 22Q-2 7 7 3Q18 -1 21 8Q22 13 12 22ZM12 6A3 3 0 1 0 12 12A3 3 0 1 0 12 6", signpost:"M12 22V14M3 3H18L22 8L18 13H3ZM8 8H16", table:"M3 3H21V21H3ZM3 9H21M3 15H21M9 3V21",
    "cyclic-lines":"M3 2V22M8 2V22M13 2V22M18 2V22M23 2V22", "time-cycles":"M2 18A5 9 0 0 1 12 18A5 9 0 0 1 22 18", "sine-line":"M2 12C6 -5 8 -5 12 12C16 29 18 29 22 12",
  };
  const custom = paths[tool];
  const pattern = /pattern|elliott|three-drives|head-shoulders/.test(tool);
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {tool === "trend-line" && <><path d="M5 19L19 5" />{point(5,19)}{point(19,5)}</>}
    {tool === "parallel-channel" && <><path d="M3 16L16 3M8 21L21 8" />{point(3,16)}{point(16,3)}{point(13,16)}</>}
    {tool === "horizontal-ray" && <><path d="M4 12H22" />{point(4,12)}</>}
    {tool === "rectangle" && <><path d="M4 4H20V20H4Z" />{point(4,4)}{point(20,4)}{point(4,20)}{point(20,20)}</>}
    {tool === "vertical-line" && <><path d="M12 2V22" />{point(12,12)}</>}
    {tool === "horizontal-line" && <><path d="M2 12H22" />{point(12,12)}</>}
    {tool === "volume-profile" && <><path d="M21 2V22M21 4H15V8H21M21 10H8V14H21M21 16H12V20H21M3 12H8" />{point(3,12)}</>}
    {tool === "anchored-volume-profile" && <><path d="M21 3V21M21 5H16V9H21M21 12H10V16H21M4 4V21M4 4H10L7 7H4" />{point(4,21)}</>}
    {tool === "session-volume-profile" && <><path d="M4 6H20V21H4ZM4 10H20M8 3V7M16 3V7M20 12H14V15H20M20 17H10V20H20" /></>}
    {tool === "price-range" && <><path d="M5 4H20M5 20H20M12 7V17M9 10L12 7L15 10M9 14L12 17L15 14" />{point(5,20)}{point(20,4)}</>}
    {tool === "fib-retracement" && <><path d="M3 3H21M3 8H21M3 12H21M3 16H21M3 21H21" />{point(21,3)}{point(3,21)}</>}
    {custom && <path d={custom} />}
    {pattern && <><path d="M3 20L6 4L12 16L18 5L21 20M3 20L18 5M6 4L21 20" />{point(3,20)}{point(6,4)}{point(12,16)}{point(18,5)}{point(21,20)}</>}
    {tool.endsWith("-stamp") && <text x="12" y="19" textAnchor="middle" fontSize="22" fill="currentColor" stroke="none">{({"smile-stamp":"☺","star-stamp":"★","heart-stamp":"♥","check-stamp":"✓"} as Record<string,string>)[tool]}</text>}
  </svg>;
}
