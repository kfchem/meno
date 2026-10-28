/**
 * Work put off until the window is idle: where the webview has idle callbacks
 * (Windows' WebView2), when it says it is - and within `most` ms whatever
 * happens; else (macOS' WebKit has none) a moment after now, past the frame
 * being drawn. So what a page needs read waits until it is shown, never
 * held up by it, nor holding up its turn.
 */
const SOON_MS = 60;

export function whenIdle(work: () => void, most = 500): void {
  const w = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(work, { timeout: most });
  else setTimeout(work, SOON_MS);
}

/** A promise kept once the window is idle (`whenIdle`). */
export function idle(most = 500): Promise<void> {
  return new Promise((done) => whenIdle(() => done(), most));
}
