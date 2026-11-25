/**
 * A step's line names what it set aside or did not compare by count and
 * why, in parentheses after the count: "3 set aside (2: stereo open;
 * 1: too many)". `whyCounted` writes those parentheses, for every step
 * that says them; `countsOnly` takes them out again, for a card too narrow
 * for the whole line (pageGl/cardFace `cardLines`), the tip saying it whole.
 * One grammar, one owner: a line whose parentheses were not written here
 * is left as it is, and its card cuts it with an ellipsis as before.
 */

/** Each why with its count, "n: why", in parentheses. A why holds no parenthesis or semicolon. */
export function whyCounted(kinds: Iterable<readonly [why: string, count: number]>): string {
  return `(${[...kinds].map(([why, n]) => `${n}: ${why}`).join("; ")})`;
}

const WHYS_IN_PARENTHESES = / \(\d+: [^();]+(?:; \d+: [^();]+)*\)/g;

/** The line without its whys in parentheses: its counts only. */
export const countsOnly = (line: string): string => line.replace(WHYS_IN_PARENTHESES, "");
