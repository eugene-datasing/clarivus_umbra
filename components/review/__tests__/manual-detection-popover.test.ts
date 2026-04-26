/**
 * Source-parse regression guard for the Slice B2 popover state-sync
 * fix. The original bug: `useState(selectedText)` only consumes its
 * argument on first mount, so subsequent prop updates (each Shift+
 * Arrow keyup re-fires `setManualPopover` in the parent) were ignored
 * and the textarea stayed stale.
 *
 * Same `.test.ts` source-parse pattern as Slice A's overlay tests so
 * we don't have to pull in @testing-library/react + jsdom + a jsx
 * vite plugin for what amounts to verifying a few code-shape
 * invariants.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const POPOVER_PATH = join(
  process.cwd(),
  "components/review/manual-detection-popover.tsx",
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("ManualDetectionPopover source — Slice B2 prop-sync contract", () => {
  const src = stripComments(readFileSync(POPOVER_PATH, "utf-8"));

  it("imports useEffect and useRef alongside useState", () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*"react"/);
    expect(src).toMatch(/import\s*\{[^}]*\buseRef\b[^}]*\}\s*from\s*"react"/);
    expect(src).toMatch(/import\s*\{[^}]*\buseState\b[^}]*\}\s*from\s*"react"/);
  });

  it("tracks user-edit state via a ref (not state) so it doesn't trigger re-render", () => {
    // userEditedTextRef = useRef(false). Refs avoid state-update
    // re-renders that a useState boolean would cause every time the
    // textarea onChange fires.
    expect(src).toMatch(/userEditedTextRef\s*=\s*useRef\(false\)/);
  });

  it("tracks last position via a ref for the fresh-selection-delta heuristic", () => {
    expect(src).toMatch(/lastPositionRef\s*=\s*useRef\(position\)/);
  });

  it("syncs selectedText -> textarea via useEffect with [selectedText, position] deps", () => {
    // The dependency array must include both selectedText (the prop
    // that updates per keyup) and position (used to detect fresh
    // selection). It must NOT depend on text/userEditedTextRef
    // because those would either cause a sync loop or have no
    // re-render effect (refs).
    expect(src).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[selectedText,\s*position\]\)/);
  });

  it("textarea onChange flips the user-edited flag on the ref AND updates the local text state", () => {
    const onChange = src.match(/onChange=\{\(e\)\s*=>\s*\{[\s\S]*?\}\}/);
    expect(onChange).not.toBeNull();
    expect(onChange![0]).toMatch(/setText\(e\.target\.value\)/);
    expect(onChange![0]).toMatch(/userEditedTextRef\.current\s*=\s*true/);
  });

  it("resets the edit flag on a fresh-selection (large position jump)", () => {
    // The useEffect's "fresh selection" branch must:
    //   1. clear userEditedTextRef.current
    //   2. setText(selectedText) unconditionally
    // The threshold is a constant (FRESH_SELECTION_DELTA_PX) so it's
    // tunable in one place.
    expect(src).toMatch(/FRESH_SELECTION_DELTA_PX/);
    expect(src).toMatch(/userEditedTextRef\.current\s*=\s*false/);
    // Reset path setText must follow the flag clear inside the
    // useEffect — the source-parse can confirm both lines exist.
    expect(src).toMatch(/setText\(selectedText\)/);
  });

  it("preserves user edits when selection extends by a small delta (no fresh-selection trigger)", () => {
    // The non-fresh-selection branch must respect userEditedTextRef:
    // when the flag is set, no setText(selectedText) call should
    // fire. The conditional `if (!userEditedTextRef.current)` guards
    // this branch.
    expect(src).toMatch(/if\s*\(!userEditedTextRef\.current\)\s*\{[\s\S]*?setText\(selectedText\)/);
  });
});

describe("ManualDetectionPopover source — submit error safety net (Bug 4 fix)", () => {
  const src = stripComments(readFileSync(POPOVER_PATH, "utf-8"));
  const rawSrc = readFileSync(POPOVER_PATH, "utf-8");

  it("declares submitError state with stale-deploy / generic kind discriminant", () => {
    // The popover catches errors thrown by onSubmit and stores them
    // in local state so an inline banner can render. The kind
    // discriminant lets render code differentiate the refresh prompt
    // from the generic-retry prompt.
    expect(src).toMatch(/setSubmitError/);
    expect(src).toMatch(/kind:\s*"stale-deploy"\s*\|\s*"generic"/);
  });

  it("handleSubmit catches onSubmit rejection and detects 'Failed to find Server Action'", () => {
    // The exact regex /Failed to find Server Action/i is the Next.js
    // error message text emitted server-side and bubbled to the
    // client when a stale-bundle action hash hits a new deploy.
    // Pinning the literal here guards against accidental rewording
    // that would silently break the stale-deploy detection.
    expect(src).toMatch(/Failed to find Server Action/);
    expect(src).toMatch(/isStaleDeploy/);
  });

  it("surfaces a refresh prompt for stale-deploy errors", () => {
    // The user-facing message must include both a description ("the
    // app was updated") AND the recovery action (hard-refresh
    // keystroke). Both are part of the contract — without the
    // keystroke the user has no path forward.
    expect(rawSrc).toMatch(/the app was updated/);
    expect(rawSrc).toMatch(/Ctrl\/Cmd\+Shift\+R/);
  });

  it("surfaces a generic retry message for non-stale-deploy errors", () => {
    // The generic message also mentions refresh as a fallback —
    // in prod RSC error masking sometimes hides the stale-deploy
    // signal entirely, so the generic message has to cover both
    // recovery paths.
    expect(rawSrc).toMatch(/Couldn't add detection/);
    expect(rawSrc).toMatch(/refresh.*Ctrl\/Cmd\+Shift\+R/);
  });

  it("detects stale-deploy via err.digest matching Next.js E787 / E788 codes", () => {
    // In production, RSC error-formatting masks Error.message but
    // exposes the digest. Next 15.5.13's action-handler.js:472,608,822
    // sets __NEXT_ERROR_CODE = "E787" / "E788" on the not-found and
    // decode-failure errors, which surface as `digest` on the
    // serialised client-side error.
    expect(src).toMatch(/digest/);
    expect(src).toMatch(/E7\(87\|88\)/);
  });

  it("clears submitError on retry — setSubmitError(null) at start of handleSubmit", () => {
    // Re-clicking Add after seeing the banner must clear the error
    // state so the user sees the new attempt's outcome cleanly.
    expect(src).toMatch(/setSubmitting\(true\)\s*;\s*setSubmitError\(null\)/);
  });

  it("renders an alert-role banner when submitError is set", () => {
    // role="alert" so screen readers announce the error
    // immediately — accessibility contract for inline error surfaces.
    // data-error-kind exposes the kind for e2e / DOM grep.
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/data-error-kind=\{submitError\.kind\}/);
  });

  it("keeps submitting reset in the finally block (so the banner is interactable)", () => {
    // The button must return to "Add Detection" / re-enabled after
    // an error, otherwise the user can't retry. setSubmitting(false)
    // in finally guarantees this for both success and error paths.
    expect(src).toMatch(/finally\s*\{\s*setSubmitting\(false\)/);
  });

  it("onSubmit prop type is Promise<void> | void to allow throwing", () => {
    // Pre-fix: `onSubmit: (data: ...) => void` (return type was
    // discarded). New shape allows the popover to await + catch.
    expect(src).toMatch(/onSubmit:\s*\(data:[\s\S]*?\)\s*=>\s*Promise<void>\s*\|\s*void/);
  });
});

describe("next.config.ts source — server-action hash stability", () => {
  const CONFIG_PATH = join(process.cwd(), "next.config.ts");
  const cfgSrc = readFileSync(CONFIG_PATH, "utf-8");

  it("declares generateBuildId at the top level of NextConfig (not under experimental)", () => {
    // Per Next 15.5.13's NextConfig type definitions
    // (node_modules/next/dist/server/config-shared.d.ts:884),
    // generateBuildId is a top-level optional field returning
    // string | null | Promise<string | null>. Asserting structure
    // here guards against a future refactor accidentally moving it
    // back under `experimental` (which would silently no-op).
    expect(cfgSrc).toMatch(/generateBuildId:\s*\(\)\s*=>\s*process\.env\.NEXT_BUILD_ID/);
    // The fallback path returns null so unset-env local builds keep
    // working — Next falls through to its default per-build hash.
    expect(cfgSrc).toMatch(/process\.env\.NEXT_BUILD_ID\s*\?\?\s*null/);
  });

  it("warns on missing NEXT_SERVER_ACTIONS_ENCRYPTION_KEY in production builds", () => {
    // Next 15.5.13 reads NEXT_SERVER_ACTIONS_ENCRYPTION_KEY directly
    // (no config field exposed). A silent fallback to per-build keys
    // is the failure mode that triggered the cr21→cr22 hash
    // mismatch — the warning surfaces the regression in build logs
    // before it reaches a deploy.
    expect(cfgSrc).toMatch(/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/);
    expect(cfgSrc).toMatch(/NODE_ENV === "production"/);
    expect(cfgSrc).toMatch(/console\.warn/);
  });

  it("documents that the encryption key is build-time, not a config field, in 15.5.13", () => {
    // Comment block must mention the runtime resolution path so a
    // future maintainer doesn't try to add an
    // experimental.serverActions.encryptionKey field that doesn't
    // exist in 15.5.13.
    expect(cfgSrc).toMatch(/encryption-utils-server\.js/);
  });
});
