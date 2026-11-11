import type { Offer } from "../../../lib/plugins/catalogue";

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
