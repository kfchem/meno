import { describe, expect, it } from "vitest";
import { pdfHold } from "./pdfHold";

describe("a press held still on a PDF", () => {
  it("takes hold of an icon anywhere, as of any other thing on the page", () => {
    expect(pdfHold({ icon: true }, { rim: false, readable: true, selected: false })).toBe("take");
    expect(pdfHold({ icon: true }, { rim: true, readable: false, selected: false })).toBe("take");
  });
  it("leaves an icon selected with the rest: a drag on it moves the selection", () => {
    expect(pdfHold({ icon: true }, { rim: false, readable: true, selected: true })).toBeNull();
  });
  it("takes hold of a full-size stack on its rim, or where its words are too small to read", () => {
    expect(pdfHold({}, { rim: true, readable: true, selected: false })).toBe("take");
    expect(pdfHold({ icon: false }, { rim: false, readable: false, selected: false })).toBe("take");
    expect(pdfHold({}, { rim: true, readable: true, selected: true })).toBe("take");
  });
  it("selects words, or draws a box, elsewhere on a full-size stack", () => {
    expect(pdfHold({}, { rim: false, readable: true, selected: false })).toBe("words");
  });
});
