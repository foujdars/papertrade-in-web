"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { headerPopoverPosition } from "@/lib/header-popover-position";

/** A header popup follows its trigger and uses only the available viewport space. */
export function HeaderPopover({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof headerPopoverPosition> | null>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    const trigger = element?.parentElement?.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!element || !trigger) return;
    const update = () => {
      const viewport = window.visualViewport;
      const nav = document.querySelector<HTMLElement>('.mobile-bottom-nav');
      const navRect = nav?.getBoundingClientRect();
      const visibleNav = navRect && navRect.height > 0 && getComputedStyle(nav!).display !== 'none';
      const next = headerPopoverPosition(trigger.getBoundingClientRect(), {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
      }, className === 'more-menu-panel' ? 330 : 390, visibleNav ? navRect.top : undefined);
      setPosition(current => current && current.top === next.top && current.left === next.left && current.width === next.width && current.maxHeight === next.maxHeight ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(trigger);
    if (trigger.closest('.topbar')) observer.observe(trigger.closest('.topbar')!);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [className]);
  return <section ref={panel} className={className} aria-label={label} style={{
    position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0,
    width: position?.width ?? 0, maxHeight: position?.maxHeight ?? 0,
    right: 'auto', bottom: 'auto', margin: 0, boxSizing: 'border-box',
    visibility: position ? 'visible' : 'hidden',
  }}>{children}</section>;
}
