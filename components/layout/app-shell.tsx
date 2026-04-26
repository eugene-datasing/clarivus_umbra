"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import {
  NavSidebarCollapseProvider,
  useNavSidebarCollapse,
} from "@/components/layout/nav-sidebar-collapse-context";
import { AlertCircle } from "lucide-react";

/**
 * Profile completion nudge — shown when the user has no department assigned.
 */
function ProfileNudge() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(false);

  // Only show for authenticated users who have no department set.
  // Cast the user object to access departmentId which is added by our session callback.
  const user = session?.user as { departmentId?: string | null } | undefined;

  if (dismissed || status !== "authenticated" || !session?.user || user?.departmentId) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>
          Complete your profile &mdash;{" "}
          <Link href="/profile" className="font-medium underline hover:text-amber-900">
            select your department
          </Link>
          .
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-800 text-xs font-medium"
      >
        Dismiss
      </button>
    </div>
  );
}

/** Full-screen routes that never show the sidebar. */
const FULL_SCREEN_PREFIXES = ["/login", "/setup", "/activate"];

function isFullScreen(pathname: string, authenticated: boolean): boolean {
  if (pathname === "/login") return true;
  if (FULL_SCREEN_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (pathname === "/" && !authenticated) return true;
  return false;
}

interface AppShellProps {
  children: React.ReactNode;
  /** Server-side pathname from x-pathname header (avoids waiting for hydration). */
  pathname?: string;
  /** Server-side auth check result (avoids waiting for useSession). */
  isAuthenticated?: boolean;
}

/**
 * Conditionally renders the sidebar + main wrapper.
 *
 * Accepts server-side hints (pathname, isAuthenticated) so the sidebar layout
 * is reserved in the initial HTML — preventing the 1-2s layout shift that
 * occurred when we had to wait for useSession() to resolve on the client.
 */
export function AppShell({ children, pathname: serverPathname, isAuthenticated: serverAuth }: AppShellProps) {
  const clientPathname = usePathname();
  const { status } = useSession();

  // Use server-provided values for the initial render; client values take over
  // once hydration completes (they'll match in practice).
  const pathname = clientPathname || serverPathname || "/";
  const authenticated = status === "authenticated" || (status === "loading" && !!serverAuth);

  if (isFullScreen(pathname, authenticated)) {
    return (
      <main id="main-content" role="main">
        <ProfileNudge />
        {children}
      </main>
    );
  }

  // Wrap the sidebar+main pair in the collapse-state provider so the
  // PdfToolbar (rendered deep inside `children`) can toggle the same
  // state the sidebar chevron toggles. The provider also handles the
  // localStorage persistence (key `veil:nav-sidebar-collapsed`).
  return (
    <NavSidebarCollapseProvider>
      <AppShellWithSidebar>{children}</AppShellWithSidebar>
    </NavSidebarCollapseProvider>
  );
}

/**
 * Inner shell that consumes the nav-sidebar collapse context. Split
 * out from AppShell so the provider can wrap a single child rather
 * than fragments — and so the hook call lives below the provider.
 */
function AppShellWithSidebar({ children }: { children: React.ReactNode }) {
  const { collapsed, toggleCollapse } = useNavSidebarCollapse();

  return (
    <>
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <main
        id="main-content"
        role="main"
        className="main-content-responsive min-h-screen transition-all duration-200"
        style={{ marginLeft: collapsed ? 64 : 260 }}
      >
        <ProfileNudge />
        {children}
      </main>
    </>
  );
}
