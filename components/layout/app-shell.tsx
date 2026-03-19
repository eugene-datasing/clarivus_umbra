"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Conditionally renders the sidebar + main wrapper.
 * Login page renders full-screen without sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="ml-[260px] min-h-screen transition-all duration-200">
        {children}
      </main>
    </>
  );
}
