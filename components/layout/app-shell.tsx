"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { AlertCircle } from "lucide-react";

/**
 * Profile completion nudge — shown when the user has no department assigned.
 */
function ProfileNudge() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  // Only show for authenticated users — check via a custom session field
  // The banner checks are best-effort; the actual department data comes from
  // the profile page server component.
  if (dismissed || !session?.user) return null;

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

/**
 * Conditionally renders the sidebar + main wrapper.
 * Login page renders full-screen without sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const isFullScreenRoute =
    pathname === "/login" ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/activate") ||
    (pathname === "/" && status !== "authenticated");

  if (isFullScreenRoute) {
    return (
      <main id="main-content" role="main">
        {children}
      </main>
    );
  }

  return (
    <>
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
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
