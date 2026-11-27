/**
 * What is on its way to a page: a file opened into Meno being read, before the app knows where it goes (`to` null: every page waits
 * for it - the app's start, too, until it knows whether a file was opened with it), or files given to a tab, or a paste, being read for
 * it (`to` the tab). While anything is on its way to a page, the page is waiting, not empty: its empty page's line does not show
 * (components/EmptyPageLine; docs/WORKSPACE.md, *First steps*).
 */
import { useSyncExternalStore } from "react";

/** How many things are on their way to each tab (`""`: to whichever page they will go to). */
const ways = new Map<string, number>();
const hearers = new Set<() => void>();
const keyOf = (to: string | null) => to ?? "";

/** Something on its way to tab `to` (null: to a page not yet known); the function returned says it has arrived - once, however often called. */
export function onItsWay(to: string | null): () => void {
  const key = keyOf(to);
  ways.set(key, (ways.get(key) ?? 0) + 1);
  hearers.forEach((h) => h());
  let arrived = false;
  return () => {
    if (arrived) return;
    arrived = true;
    const left = (ways.get(key) ?? 1) - 1;
    if (left > 0) ways.set(key, left);
    else ways.delete(key);
    hearers.forEach((h) => h());
  };
}

/** `work`, with what it brings on its way to tab `to` until it is done or has failed. */
export async function whileOnItsWay<T>(to: string | null, work: () => Promise<T>): Promise<T> {
  const arrived = onItsWay(to);
  try {
    return await work();
  } finally {
    arrived();
  }
}

/** Whether anything is on its way to tab `to`'s page: to it, or to a page not yet known. */
export function waitedFor(to: string): boolean {
  return ways.has(keyOf(to)) || ways.has("");
}

const hear = (h: () => void) => {
  hearers.add(h);
  return () => void hearers.delete(h);
};

/** `waitedFor`, as it changes. */
export function useWaitedFor(to: string): boolean {
  return useSyncExternalStore(hear, () => waitedFor(to));
}
