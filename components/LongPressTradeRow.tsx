"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";

export function LongPressTradeRow({ onLongPress, onClick, onKeyDown, children, ...props }: HTMLAttributes<HTMLDivElement> & { onLongPress: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const action = useRef(onLongPress);
  useEffect(() => { action.current = onLongPress; }, [onLongPress]);
  function cancelHold() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  return <div {...props}
    aria-keyshortcuts="Shift+Space"
    onKeyDown={event => {
      if (event.target === event.currentTarget && event.shiftKey && event.key === " ") {
        event.preventDefault(); event.stopPropagation(); action.current();
      } else onKeyDown?.(event);
    }}
    onPointerDown={(event) => {
      cancelHold();
      suppressClick.current = false;
      if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest("button, input, select, textarea, a, .pnl-trade-review-chart")) return;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        suppressClick.current = true;
        action.current();
        navigator.vibrate?.(25);
      }, 500);
    }}
    onPointerMove={(event) => { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) cancelHold(); }}
    onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
    onContextMenu={(event) => { if (!(event.target as HTMLElement).closest("button, input, select, textarea, a, .pnl-trade-review-chart")) event.preventDefault(); }}
    onClick={(event) => {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); return; }
      onClick?.(event);
    }}>{children}</div>;
}
