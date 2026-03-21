"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Conditionally renders the sidebar + main wrapper.
 * Login page renders full-screen without sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isFullScreenRoute = pathname === "/login" || pathname.startsWith("/setup") || pathname.startsWith("/activate");

  if (isFullScreenRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      <main
        className="min-h-screen transition-all duration-200"
        style={{ marginLeft: collapsed ? 64 : 260 }}
      >
        {children}
      </main>
    </>
  );
}
