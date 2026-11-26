// Held beside conversationCard.test.ts: a reply of exactly the characters a card shows is shown whole; one a character longer is cut at a line.
import { describe, expect, it } from "vitest";
import { HEARD_SHOWN, heardShown } from "./conversationCard";

describe("the words of a reply coming in, as a card shows them", () => {
  it("are all of a reply of exactly the most it shows, and the end of one a character longer, from a line's start", () => {
    const line = "x".repeat(39);
    const exact = Array.from({ length: HEARD_SHOWN / 40 }, () => line).join("\n");
    expect(exact.length).toBe(HEARD_SHOWN - 1);
    const whole = `${exact}\n`.slice(0, HEARD_SHOWN);
    expect(whole.length).toBe(HEARD_SHOWN);
    expect(heardShown(whole)).toBe(whole);
    const longer = `a\n${whole}`;
    expect(longer.length).toBe(HEARD_SHOWN + 2);
    expect(heardShown(longer).startsWith("\u2026\n")).toBe(true);
    expect(heardShown(longer).length).toBeLessThan(longer.length);
  });
});
