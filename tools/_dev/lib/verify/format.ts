/**
 * Take a noisy stdout/stderr blob and produce a short, meaningful failure
 * detail string. Strategy:
 * 1. Drop common Node/pnpm noise (MaxListenersExceededWarning, deprecation, etc).
 * 2. Find anchor lines that signal a real failure (`Failed tasks:`, `Error:`,
 *    `FAIL`, `ELIFECYCLE`).
 * 3. Return the lines from the first anchor to the end, capped at maxLines.
 * 4. Fall back to last `maxLines` non-noise lines if no anchor matched.
 */
export function extractFailureContext(output: string, maxLines = 8): string {
  const lines = output.split("\n");
  const NOISE_PATTERNS = [
    /^\(node:\d+\)\s/,
    /MaxListenersExceededWarning/,
    /^\(Use `node --trace-warnings/,
    /^DeprecationWarning:/,
  ];
  const isNoise = (l: string) => NOISE_PATTERNS.some((re) => re.test(l));

  const ANCHOR_PATTERNS = [
    /^Failed tasks:/,
    /^\s*ELIFECYCLE\s/,
    /^Error:/,
    /^\s+FAIL\s/,
    /\sFAIL\s/,
    /^Warning: command "[^"]+" exited with non-zero/,
  ];
  const isAnchor = (l: string) => ANCHOR_PATTERNS.some((re) => re.test(l));

  const filtered = lines.filter((l) => l.trim().length > 0 && !isNoise(l));

  const anchorIdx = filtered.findIndex(isAnchor);
  const slice = anchorIdx === -1 ? filtered.slice(-maxLines) : filtered.slice(anchorIdx, anchorIdx + maxLines);
  return slice.map((l) => l.trim()).join(" / ");
}
