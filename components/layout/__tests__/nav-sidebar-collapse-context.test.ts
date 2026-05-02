/**
 * Source-parse regression guard for the nav-sidebar collapse-state
 * context (added 2026-04-25 alongside the dual-panel UX work).
 *
 * Following the codebase's preferred no-JSDOM pattern (see e.g.
 * `pdf-redaction-preview-overlay.test.ts`) — no React rendering, just
 * structural assertions on the source so the localStorage contract,
 * SSR-safe pattern, and noop-fallback semantics can't silently
 * regress.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CTX_PATH = join(
  process.cwd(),
  "components/layout/nav-sidebar-collapse-context.tsx",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("NavSidebarCollapseContext source — collapse-state contract", () => {
  const src = stripComments(readFileSync(CTX_PATH, "utf-8"));

  it("uses the canonical localStorage key 'veil:nav-sidebar-collapsed'", () => {
    // Different namespacing here vs otherUmbra keys would risk silent
    // collision — pin the key so a refactor can't change it without
    // updating consumers.
    expect(src).toMatch(/STORAGE_KEY\s*=\s*"veil:nav-sidebar-collapsed"/);
    // Re-exports the constant so callers (test fixtures, e2e) can
    // reference the same key without duplicating the literal.
    expect(src).toMatch(/export const NAV_SIDEBAR_COLLAPSED_STORAGE_KEY/);
  });

  it("initialises collapsed=false (SSR-safe — server can't read localStorage)", () => {
    // Reading localStorage as the useState initializer would emit
    // different markup on server vs client and cause hydration
    // mismatch. The post-mount useEffect read is the SSR-safe pattern.
    expect(src).toMatch(/useState\(false\)/);
  });

  it("hydrates from localStorage in a useEffect (post-mount, after hydration)", () => {
    expect(src).toMatch(/useEffect\([\s\S]*?localStorage\.getItem\(STORAGE_KEY\)/);
    expect(src).toMatch(/stored === "true"/);
    expect(src).toMatch(/setCollapsed\(true\)/);
  });

  it("persists collapsed state on toggle via localStorage.setItem", () => {
    expect(src).toMatch(/localStorage\.setItem\(STORAGE_KEY,\s*String\(next\)\)/);
  });

  it("wraps localStorage access in try/catch — no throw on private mode / sandboxed iframe", () => {
    // Two try/catch blocks — one for read (mount), one for write
    // (toggle). Neither should let a localStorage failure surface
    // to React and crash the app shell.
    const tryBlocks = src.match(/try\s*\{/g) ?? [];
    expect(tryBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("returns a noop fallback when called outside the provider", () => {
    // Consumers (PdfToolbar, etc) should be able to call the hook
    // unconditionally without provider-coupling. The noop fallback
    // means storybook / test fixtures / full-screen routes don't
    // need to mount the provider.
    expect(src).toMatch(/if \(!ctx\)\s*\{\s*return\s*\{\s*collapsed:\s*false,\s*toggleCollapse:\s*\(\)\s*=>\s*\{\}\s*\}\s*;?\s*\}/);
  });

  it("exports a Provider component AND a hook", () => {
    expect(src).toMatch(/export function NavSidebarCollapseProvider/);
    expect(src).toMatch(/export function useNavSidebarCollapse/);
  });

  it("uses 'use client' directive (context can only run on the client)", () => {
    expect(src).toMatch(/^"use client";/);
  });
});

const TOOLBAR_PATH = join(process.cwd(), "components/review/pdf-toolbar.tsx");

describe("PdfToolbar source — nav-sidebar toggle wiring", () => {
  const src = stripComments(readFileSync(TOOLBAR_PATH, "utf-8"));

  it("imports useNavSidebarCollapse from the layout-context module", () => {
    expect(src).toMatch(
      /import\s*\{\s*useNavSidebarCollapse\s*\}\s*from\s*"@\/components\/layout\/nav-sidebar-collapse-context"/,
    );
  });

  it("imports the PanelLeftClose / PanelLeftOpen icons", () => {
    expect(src).toMatch(/PanelLeftClose/);
    expect(src).toMatch(/PanelLeftOpen/);
  });

  it("renders the nav-toggle button with aria-label that flips on collapsed state", () => {
    expect(src).toMatch(/aria-label=\{navCollapsed \? "Expand navigation" : "Collapse navigation"\}/);
  });

  it("wires the button onClick to toggleNavCollapse from the hook", () => {
    expect(src).toMatch(/const\s*\{\s*collapsed:\s*navCollapsed,\s*toggleCollapse:\s*toggleNavCollapse\s*\}\s*=\s*useNavSidebarCollapse\(\)/);
    expect(src).toMatch(/onClick=\{toggleNavCollapse\}/);
  });

  it("uses aria-pressed={!navCollapsed} so AT users hear toggle state correctly", () => {
    expect(src).toMatch(/aria-pressed=\{!navCollapsed\}/);
  });
});

const SHELL_PATH = join(process.cwd(), "components/layout/app-shell.tsx");

describe("AppShell source — nav-sidebar provider wiring", () => {
  const src = stripComments(readFileSync(SHELL_PATH, "utf-8"));

  it("wraps the sidebar+main pair in NavSidebarCollapseProvider", () => {
    expect(src).toMatch(/NavSidebarCollapseProvider/);
    expect(src).toMatch(/<NavSidebarCollapseProvider>/);
    expect(src).toMatch(/<\/NavSidebarCollapseProvider>/);
  });

  it("consumes the hook below the provider (so the inner shell sees the live value)", () => {
    expect(src).toMatch(
      /const\s*\{\s*collapsed,\s*toggleCollapse\s*\}\s*=\s*useNavSidebarCollapse\(\)/,
    );
  });

  it("does not maintain a parallel useState for the sidebar collapse anymore", () => {
    // Pre-2026-04-25 the AppShell held `useState(false)` directly for
    // collapse; this regressed across hydration and didn't persist.
    // Guard against accidental reintroduction.
    expect(src).not.toMatch(/useState\(false\)\s*[;,)\s]*\/\/[^\n]*collapse/i);
    expect(src).not.toMatch(/setCollapsed\(\(c\)\s*=>\s*!c\)/);
  });
});
