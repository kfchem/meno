import { describe, expect, it } from "vitest";
import { layout2D } from "../engine";
import { fromSmiles } from "./fromSmiles";
import { asSeen, shuffled, SHUFFLE_SEEDS } from "./shuffled";
import { measured } from "../../../testing/timeouts";

/**
 * The molecules the engine still draws differently in another order of
 * their atoms (`npm run layout-order`): some choice on the way is still
 * made by which atom, bond or ring comes first, not by the structure or
 * by trying each way. Their tests are skipped, by name, until that choice
 * is made order-free; a molecule leaves this list when it passes.
 */
export const NOT_YET_ORDER_FREE: ReadonlySet<string> = new Set([]);

/**
 * Every molecule listed drawn alike with its atoms in any order: eight
 * orders besides its SMILES's, each the same drawing, from the engine's
 * own choices alone. (A list to a test file, the lists side by side; each
 * with the time its slowest molecule was measured to take, which sets their
 * timeout: testing/timeouts.)
 */
export function drawsAlikeInAnyOrder(list: string, molecules: readonly { name: string; smiles: string }[], slowestMs: number): void {
  describe(`a drawing the same whatever order its atoms come in, on ${list}`, () => {
    for (const { name, smiles } of molecules) {
      const run = NOT_YET_ORDER_FREE.has(name) ? it.skip : it;
      run(
        `${name} comes out the same in eight other orders${NOT_YET_ORDER_FREE.has(name) ? " (not yet: a choice still follows the order)" : ""}`,
        () => {
          const g = fromSmiles(smiles);
          const seen = asSeen(g, layout2D(g));
          SHUFFLE_SEEDS.forEach((seed, k) => {
            const other = shuffled(g, seed);
            expect(asSeen(other, layout2D(other)), `order ${k + 1}`).toBe(seen);
          });
        },
        measured(slowestMs),
      );
    }
  });
}
