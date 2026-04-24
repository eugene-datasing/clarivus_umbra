/**
 * Keyboard-activation handler for PDF detection overlay boxes.
 *
 * Kept in a plain `.ts` module (not inside the `.tsx` component) so
 * unit tests can import it without pulling JSX through vite's
 * transform — the project's `tsconfig.json` sets `jsx: "preserve"`
 * for Next.js, which vitest's default pipeline can't handle.
 *
 * Contract — matches the WAI-ARIA "button" pattern:
 *   - Enter triggers activation.
 *   - Space (" ") triggers activation.
 *   - Spacebar (legacy key name from some screen readers) triggers activation.
 *   - Any other key returns false and does not invoke the callback.
 *
 * Returns true when the key was handled so callers can preventDefault /
 * stopPropagation on the synthetic event.
 */
export function handleOverlayBoxKeyDown(
  key: string,
  onActivate: () => void,
): boolean {
  if (key === "Enter" || key === " " || key === "Spacebar") {
    onActivate();
    return true;
  }
  return false;
}
