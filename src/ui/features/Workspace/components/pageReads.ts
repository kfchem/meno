/**
 * The column's pages read ahead (docs/PDF.md, *In the column, as built*):
 * each page's letters and figures asked for once it is shown, in idle time,
 * once - again where the reading failed, a few times at most - and asked
 * for again once its PDF is shown again.
 */
import { whenIdle } from "../../../../lib/core/idle";
import { figuresHad } from "../../../../lib/pdf/figures";
import { textHad } from "../../../../lib/pdf/text";

/** The pages whose letters and figures have been asked for, once shown (`readWhenIdle`). */
const readAsked = new Set<string>();

/** How many times a page's reading may fail before the column stops asking for it, until its PDF is shown again. */
const READ_TRIES = 3;
/** How many times each page's reading has failed, while its PDF is shown. */
const readFailed = new Map<string, number>();

/** A page's letters and figures read in idle time, once - after it is drawn, not with it (lib/core/idle); asked for again where the reading failed, READ_TRIES times at most. */
export function readWhenIdle(sha256: string, page: number): void {
  const key = `${sha256}:${page}`;
  if (readAsked.has(key)) return;
  readAsked.add(key);
  // (counted once a try, its letters and its figures failing alike)
  let counted = false;
  const failed = () => {
    if (counted) return;
    counted = true;
    const n = (readFailed.get(key) ?? 0) + 1;
    readFailed.set(key, n);
    if (n < READ_TRIES) readAsked.delete(key);
  };
  whenIdle(() => {
    textHad(sha256, page, undefined, failed);
    figuresHad(sha256, page, undefined, { failed });
  });
}

/** A PDF gone from the column: its pages asked for again, should it come back. */
export function readForgotten(sha256: string): void {
  for (const key of readAsked) if (key.startsWith(`${sha256}:`)) readAsked.delete(key);
  for (const key of readFailed.keys()) if (key.startsWith(`${sha256}:`)) readFailed.delete(key);
}
