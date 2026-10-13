export type HeaderPanel = 'notifications' | 'tools' | 'profile' | null;
export type HeaderPanelUpdate = boolean | ((open: boolean) => boolean);

/** One selected panel means switching buttons cannot leave another panel behind. */
export function updateHeaderPanel(current: HeaderPanel, panel: Exclude<HeaderPanel, null>, update: HeaderPanelUpdate): HeaderPanel {
  const open = typeof update === 'function' ? update(current === panel) : update;
  return open ? panel : current === panel ? null : current;
}
