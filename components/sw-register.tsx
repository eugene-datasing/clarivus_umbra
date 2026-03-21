"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for offline capability and PWA support.
 * This component renders nothing visible — it only runs the registration side effect.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[SW] Service worker registered:", registration.scope);
        })
        .catch((error) => {
          console.warn("[SW] Service worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
