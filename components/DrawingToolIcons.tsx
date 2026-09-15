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
  </svg>;
}
