// Held beside heardShown.test.ts: a reply with no line break, cut where its last 4000 units begin, never keeps half a character - whichever low half it is: the first (U+DC00) or the last (U+DFFF) of the range.
import { describe, expect, it } from "vitest";
import { HEARD_SHOWN, heardShown } from "./conversationCard";

describe("the words of a reply coming in with no line break, as a card shows them", () => {
  it("drop the second half of a character the cut would split, at either end of the range of second halves", () => {
    for (const pair of ["\u{10000}", "\u{103ff}", "\u{1f600}"]) {
      const text = `a${pair}${"y".repeat(HEARD_SHOWN - 1)}`;
      expect(text.length).toBe(HEARD_SHOWN + 2);
      expect(heardShown(text)).toBe(`\u2026\n${"y".repeat(HEARD_SHOWN - 1)}`);
    }
  });
});
