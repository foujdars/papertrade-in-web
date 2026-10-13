type Viewport = { left: number; top: number; width: number; height: number };

/** Fixed CSS coordinates, with a gap below the trigger and above bottom navigation. */
export function headerPopoverPosition(trigger: { bottom: number; right: number }, viewport: Viewport, preferredWidth: number, navigationTop?: number) {
  const gap = 8;
  // Phone panels use the horizontal screen space, like the profile dialog.
  const mobile = viewport.width <= 760;
  const width = Math.max(0, mobile ? viewport.width - gap * 2 : Math.min(preferredWidth, viewport.width - gap * 2));
  const left = mobile ? viewport.left + gap : Math.max(viewport.left + gap, Math.min(trigger.right - width, viewport.left + viewport.width - gap - width));
  const bottom = Math.min(viewport.top + viewport.height, navigationTop ?? Infinity) - gap;
  const top = Math.max(viewport.top + gap, Math.min(trigger.bottom + gap, bottom));
  return { top, left, width, maxHeight: Math.max(0, bottom - top) };
}
