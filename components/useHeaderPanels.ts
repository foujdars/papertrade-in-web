"use client";
import { useCallback, useState } from 'react';
import { updateHeaderPanel, type HeaderPanel, type HeaderPanelUpdate } from '@/lib/header-panel-state';

export function useHeaderPanels() {
  const [panel, setPanel] = useState<HeaderPanel>(null);
  const setNotificationsOpen = useCallback((update: HeaderPanelUpdate) => setPanel(current => updateHeaderPanel(current, 'notifications', update)), []);
  const setAccountOpen = useCallback((update: HeaderPanelUpdate) => setPanel(current => updateHeaderPanel(current, 'profile', update)), []);
  return { notificationsOpen: panel === 'notifications', accountOpen: panel === 'profile', setNotificationsOpen, setAccountOpen };
}
