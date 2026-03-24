import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isActivated } from "@/lib/data/activation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Veil — OIA & LGOIMA Disclosure Platform",
  description: "AI-powered document redaction and official information disclosure workflow for OIA and LGOIMA — DataSing / Clarivus AI",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Activation gate: redirect to /activate if instance is not yet activated.
  // Read pathname from middleware-set header (server components can't access pathname directly).
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  // Skip activation check on pages that need to work during activation flow.
  // /activate is the activation page itself (requires auth — middleware bounces to /login first)
  // /login and /api/auth are the auth flow pages
  // /setup is the post-activation wizard
  const skipActivationCheck =
    pathname === "/" ||
    pathname.startsWith("/activate") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/activation-status") ||
    pathname.startsWith("/api/demo-request") ||
    pathname.startsWith("/setup");

  console.log(`[layout] pathname="${pathname}" skipActivationCheck=${skipActivationCheck}`);

  if (!skipActivationCheck) {
    try {
      const activated = await isActivated();
      console.log(`[layout] isActivated() returned: ${activated}`);
      if (!activated) {
        redirect("/activate");
      }
    } catch (e) {
      // If the redirect helper throws (Next.js uses a special error for redirects),
      // re-throw it so the framework can handle it.
      if (e && typeof e === "object" && "digest" in e) throw e;
      // DB unreachable or other error — redirect to activate as safe default
      console.error("[layout] Activation check failed:", e);
      redirect("/activate");
    }
  }

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1e40af" />
      </head>
      <body className="min-h-screen">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <a href="#main-navigation" className="skip-link">
          Skip to navigation
        </a>
        <SessionProvider>
          <QueryProvider>
            <AppShell>{children}</AppShell>
          </QueryProvider>
        </SessionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
