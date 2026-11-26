import { describe, expect, it } from "vitest";
import { notComparedSaid } from "../../../../lib/chem/ligandsNotStated";
import { cardLines } from "./cardFace";

/** Whether a step's line is cut by its card: its state's two lines, the last ending in an ellipsis. */
const cut = (text: string) => cardLines({ summary: "Duplicates", state: { text, tone: "quiet" } }).state.join(" ").endsWith("…");

describe("a step's line on structures whose ligands are not stated", () => {
  it("says why in the short form, as a step that sets them aside does", () => {
    expect(notComparedSaid(4)).toBe("4 not compared (4: ligands not stated)");
  });

  it("fits its card whole where it says that and what it kept, for the counts a set commonly has", () => {
    for (const all of [2, 6, 12, 48, 120, 999])
      for (const n of [1, Math.ceil(all / 2), all - 1]) {
        expect(cut(`${all - n} of ${all} kept \u00b7 ${n} set aside (${n}: ligands not stated)`), `${all}, ${n}`).toBe(false);
        // (not compared, a longer word than set aside: whole up to a dozen; its full words are in the state's tip as it is pointed at)
        if (all <= 12) expect(cut(`${all - n} of ${all} kept \u00b7 ${notComparedSaid(n)}`), `${all}, ${n}`).toBe(false);
      }
  });
});
