import type { CatalogueEntry, Offer } from "../../../lib/plugins/catalogue";

/** The offers to update a plugin that its own card offers too: one added or not, not one being added or taken away. */
export function updatable(offers: readonly Offer[], states: Readonly<Record<string, string | undefined>>): Offer[] {
  return offers.filter((o) => o.offer === "update" && (states[o.entry.id] === "added" || states[o.entry.id] === "absent"));
}

/**
 * `one` done to each of `list`, one after another - set-ups run one at a
 * time - each however the one before it went: how many came out well, and how
 * many did not (each said by its own plugin's problem).
 */
export async function updateEach<T>(list: readonly T[], one: (x: T) => Promise<void>): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const x of list) {
    try {
      await one(x);
      done++;
    } catch {
      failed++;
    }
  }
  return { done, failed };
}

/** What the line says once Update all is done: none where every one was updated, else how many were and how many were not. */
export function updatedSaid({ done, failed }: { done: number; failed: number }): string | null {
  if (!failed) return null;
  return `${done} of ${done + failed} updated; ${failed === 1 ? "one" : failed} did not - its card says why.`;
}

/** What updating a plugin does to its files and set-up: the parts a test stands in for. */
export type Updating<P extends { id: string }> = {
  /** Gets the newer version in place. */
  get: (entry: CatalogueEntry) => Promise<unknown>;
  /** The plugin as it is now, once got. */
  now: (id: string) => P | undefined;
  /** Which of `plugins` stand set up as they are (their environment is the one they need). */
  setUp: (plugins: readonly P[]) => Promise<ReadonlySet<string>>;
  /** Sets a plugin up again. */
  add: (plugin: P) => Promise<unknown>;
};

/** A plugin's newer version got, then set up again only where it was added and its environment is no longer the one it needs. */
export async function updateOne<P extends { id: string }>(entry: CatalogueEntry, state: string | undefined, was: P, using: Updating<P>): Promise<void> {
  await using.get(entry);
  const now = using.now(was.id) ?? was;
  if (state === "added" && !(await using.setUp([now])).has(now.id)) await using.add(now);
}
