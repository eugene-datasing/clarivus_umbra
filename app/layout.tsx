import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  title: "Veil — LGOIMA Disclosure Platform",
  description: "AI-powered document redaction and LGOIMA disclosure workflow — DataSing / Clarivus AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <QueryProvider>
          <Sidebar />
          <main className="ml-[260px] min-h-screen transition-all duration-200">
            {children}
          </main>
        </QueryProvider>
      </body>
    </html>
  );
}
