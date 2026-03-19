import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Veil — LGOIMA Disclosure Platform",
  description: "AI-powered document redaction and LGOIMA disclosure workflow — DataSing / Clarivus AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SessionProvider>
          <QueryProvider>
            <AppShell>{children}</AppShell>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
