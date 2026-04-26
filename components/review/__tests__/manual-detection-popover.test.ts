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

describe("ManualDetectionPopover source — variant-C grouped grounds dropdown (Bug 1 fix)", () => {
  const src = stripComments(readFileSync(POPOVER_PATH, "utf-8"));
  const rawSrc = readFileSync(POPOVER_PATH, "utf-8");

  it("does NOT use the pre-fix .filter((g) => g.common) shortlist for the dropdown", () => {
    // The pre-2026-04-27 dropdown rendered only 5 of 27 grounds via
    // `lgoimaGrounds.filter((g) => g.common)`, hiding the other 22
    // entirely. Cr24 verification flagged this as Bug 1. The fix
    // structurally replaces the filter with a grouped shape — guard
    // against the filter pattern accidentally returning to source.
    expect(src).not.toMatch(/lgoimaGrounds\.filter\(\(g\)\s*=>\s*g\.common\)\s*;/);
  });

  it("declares groundGroups with 4 optgroups: Common + s6 + s7 + s17", () => {
    // Variant-C contract: the dropdown renders four <optgroup>s in a
    // fixed order — Common (5 commons, top-of-list shortcut), then
    // the three sections with their full lists. The structure is
    // built up-front so the JSX is a tight .map() over groundGroups.
    expect(src).toMatch(/const\s+groundGroups\s*=\s*\[/);
    expect(rawSrc).toMatch(/label:\s*"Common"/);
    expect(rawSrc).toMatch(/label:\s*"Section 6 — Conclusive reasons"/);
    expect(rawSrc).toMatch(/label:\s*"Section 7 — Other reasons"/);
    expect(rawSrc).toMatch(/label:\s*"Section 17 — Refusal grounds"/);
  });

  it("each section group filters lgoimaGrounds by g.section", () => {
    // s6 / s7 / s17 sections each pull their ground rows from the
    // canonical lgoimaGrounds array via section equality. This must
    // stay tied to the source data so a future ground addition shows
    // up in the dropdown without a popover code change.
    expect(src).toMatch(/lgoimaGrounds\.filter\(\(g\)\s*=>\s*g\.section\s*===\s*"s6"\)/);
    expect(src).toMatch(/lgoimaGrounds\.filter\(\(g\)\s*=>\s*g\.section\s*===\s*"s7"\)/);
    expect(src).toMatch(/lgoimaGrounds\.filter\(\(g\)\s*=>\s*g\.section\s*===\s*"s17"\)/);
  });

  it("Common optgroup uses g.common (preserves the existing shortlist semantics)", () => {
    // Removing the .filter((g) => g.common) at the top-level pattern
    // is the regression we guard against. The same expression
    // surviving INSIDE the groundGroups array (driving the Common
    // optgroup) is exactly the desired shape.
    expect(src).toMatch(/grounds:\s*lgoimaGrounds\.filter\(\(g\)\s*=>\s*g\.common\)/);
  });

  it("renders <optgroup> elements with each group's label and grounds via .map()", () => {
    // The dropdown JSX is `groundGroups.map(grp => <optgroup
    // label={grp.label}>{grp.grounds.map(g => <option…/>)}</optgroup>)`.
    // Tag/structure check — keys must use the group label as a prefix
    // so duplicate ground ids across Common + Section optgroups don't
    // collide on React's reconciliation key.
    expect(src).toMatch(/groundGroups\.map\(\(grp\)/);
    expect(src).toMatch(/<optgroup\s+key=\{grp\.label\}\s+label=\{grp\.label\}>/);
    expect(src).toMatch(/key=\{`\$\{grp\.label\}::\$\{g\.id\}`\}\s+value=\{g\.id\}/);
  });

  it("data-grounds-select attribute exposes the dropdown for DOM probing", () => {
    // E2E / live verification scripts grep the running DOM for the
    // dropdown to count options + assert structure. Without a
    // stable hook the only selector is "the second select on the
    // popover" which is brittle.
    expect(src).toMatch(/data-grounds-select="true"/);
  });

  it("retains the empty 'Select ground (optional)' placeholder option", () => {
    // The Withholding Ground field is optional — a manual detection
    // can be created without a ground. The placeholder option must
    // stay so the user can land on the dropdown without committing
    // a ground.
    expect(rawSrc).toMatch(/<option value="">Select ground \(optional\)<\/option>/);
  });
});

// Pure-data test: assert lgoimaGrounds gives us exactly the 27/4/14/9
// counts the popover relies on. If a ground is added/removed in
// lgoima-grounds.ts the dropdown structure stays correct (the popover
// code derives from the canonical source) but the documented contract
// changes — this test forces the change to be deliberate.
describe("lgoima-grounds canonical counts (drives the variant-C dropdown shape)", () => {
  it("yields 27 total grounds, 4 in s6, 14 in s7, 9 in s17, 5 marked common", async () => {
    const { lgoimaGrounds } = await import("@/lib/lgoima-grounds");
    const all = lgoimaGrounds;
    const s6 = all.filter((g) => g.section === "s6");
    const s7 = all.filter((g) => g.section === "s7");
    const s17 = all.filter((g) => g.section === "s17");
    const common = all.filter((g) => g.common);

    expect(all).toHaveLength(27);
    expect(s6).toHaveLength(4);
    expect(s7).toHaveLength(14);
    expect(s17).toHaveLength(9);
    expect(common).toHaveLength(5);

    // Variant-C flat counts:
    //   - 4 optgroups
    //   - 5 + 4 + 14 + 9 = 32 <option> elements (5 commons appear
    //     twice — once in the Common optgroup, once in their section
    //     optgroup; that's intentional)
    //   - 27 unique ground values
    expect(s6.length + s7.length + s17.length).toBe(27);
    expect(common.length + s6.length + s7.length + s17.length).toBe(32);
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
