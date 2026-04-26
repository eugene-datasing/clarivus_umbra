"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Cross-component plumbing for the nav-sidebar collapse state.
 *
 * The sidebar is rendered by `AppShell`, but the affordance to toggle
 * it lives in two places: the chevron at the bottom of the sidebar
 * itself (pre-existing), and the `PdfToolbar` (added 2026-04-25 so
 * reviewers can free up horizontal space without leaving the document
 * pane). Routing both through this context keeps a single source of
 * truth and the localStorage write in one place.
 *
 * Persistence — `collapsed` is mirrored to `localStorage` under
 * `veil:nav-sidebar-collapsed`. The initial render uses `false`
 * (expanded) so the SSR/CSR markup matches; the stored value is
 * applied in a `useEffect` post-mount, accepting one frame of layout
 * shift in exchange for hydration-safe markup. localStorage access is
 * wrapped in try/catch so private-mode / restricted-storage callers
 * fall back silently.
 *
 * Consumers outside `<NavSidebarCollapseProvider>` (tests, storybook,
 * `/login` and other full-screen routes that bypass `AppShell`) get a
 * no-op fallback: `collapsed` is always `false` and `toggleCollapse`
 * is a noop. This means `PdfToolbar` can call the hook unconditionally
 * without leaking provider-coupling.
 */

const STORAGE_KEY = "veil:nav-sidebar-collapsed";

interface NavSidebarCollapseContextValue {
  collapsed: boolean;
  toggleCollapse: () => void;
}

const NavSidebarCollapseContext = createContext<NavSidebarCollapseContextValue | null>(null);

export function NavSidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // Read persisted state post-mount. Doing this in useEffect rather
  // than as the useState initializer avoids hydration mismatch — SSR
  // can't access localStorage so the initial server render always
  // emits `collapsed=false`.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {
      // localStorage unavailable (private mode, sandboxed iframe, etc) —
      // fall back to in-memory state for the session.
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Same as above — silent fallback.
      }
      return next;
    });
  }, []);

  const value = useMemo<NavSidebarCollapseContextValue>(
    () => ({ collapsed, toggleCollapse }),
    [collapsed, toggleCollapse],
  );

  return (
    <NavSidebarCollapseContext.Provider value={value}>
      {children}
    </NavSidebarCollapseContext.Provider>
  );
}

/**
 * Read the nav-sidebar collapse state. Returns a noop fallback when
 * called outside the provider so callers (PdfToolbar, etc) can use it
 * unconditionally without throwing on test fixtures or full-screen
 * routes that bypass AppShell.
 */
export function useNavSidebarCollapse(): NavSidebarCollapseContextValue {
  const ctx = useContext(NavSidebarCollapseContext);
  if (!ctx) {
    return { collapsed: false, toggleCollapse: () => {} };
  }
  return ctx;
}

export const NAV_SIDEBAR_COLLAPSED_STORAGE_KEY = STORAGE_KEY;
