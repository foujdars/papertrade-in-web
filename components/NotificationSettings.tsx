"use client";
import { useEffect, useState } from "react";

export function NotificationSettings() {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    setDenied(typeof Notification !== "undefined" && Notification.permission === "denied");
  }, []);
  return <p className="notification-settings" role="status">{denied ? "Notifications are blocked — allow them in your phone settings 🔔" : "Your alerts reach you even when the app is closed 😊"}</p>;
}
