/**
 * The sets of texts WholeTexts2D draws (Labels2D): the one shown, the one
 * being set - shown in its place once every letter of it is set - and the
 * latest given, to be set next. Sets given faster than they are set - words
 * made wider by their edge, a long text broken into lines again at each
 * move - the one being set is set to the end and shown, then the latest:
 * those between are never set. (Each one given up for the next, the words
 * stood still until the pointer did.)
 */
export type TextSets<T> = { at: [T | null, T | null]; front: 0 | 1; told: T | null; next: T | null };

export const noTextSets = <T>(): TextSets<T> => ({ at: [null, null], front: 0, told: null, next: null });

/** `texts` given: shown at once where nothing is yet; else set behind the one shown - or, one being set, next after it; the one shown again, nothing more to set. */
export function textsGiven<T>(s: TextSets<T>, texts: T, same: (a: T, b: T) => boolean): void {
  const back = (1 - s.front) as 0 | 1;
  const front = s.at[s.front];
  const setting = s.at[back];
  if (!front) s.at[s.front] = texts;
  else if (same(front, texts)) {
    s.at[back] = null;
    s.next = null;
  } else if (setting && same(setting, texts)) s.next = null;
  else if (setting) s.next = texts;
  else s.at[back] = texts;
}

/**
 * Set `i` drawn as `items`, every letter of it set: "shown" where it now is
 * in place of the other - the latest waiting put where that was, to be set
 * - "told" where it was shown already; null where it is no longer the set
 * there, or was told so already.
 */
export function setDrawn<T>(s: TextSets<T>, i: 0 | 1, items: T): "shown" | "told" | null {
  if (s.at[i] !== items || s.told === items) return null;
  const shown = i !== s.front;
  if (shown) {
    s.front = i;
    s.at[(1 - i) as 0 | 1] = s.next;
    s.next = null;
  }
  s.told = items;
  return shown ? "shown" : "told";
}
