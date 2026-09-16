"use client";
import { useCallback, useEffect, useState } from "react";

/** Every notice owns its timer, including repeated identical messages. */
export function useToastNotice(duration = 3500): [string, (message: string) => void] {
  const [notice, setNotice] = useState({ message: "" });
  const show = useCallback((message: string) => setNotice({ message }), []);
  useEffect(() => {
    if (!notice.message) return;
    const timer = window.setTimeout(() => setNotice({ message: "" }), duration);
    return () => window.clearTimeout(timer);
  }, [notice, duration]);
  return [notice.message, show];
}
