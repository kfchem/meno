import { describe, expect, it } from "vitest";
import { heldEach } from "./heldEach";

describe("files held one by one", () => {
  it("holds those it can and names each refused with why, the rest put down all the same", async () => {
    const files = [{ name: "a.pdf" }, { name: "big.pdf" }, { name: "b.pdf" }, { name: "notes.pdf" }];
    const { held, refused } = await heldEach(files, async (f) => {
      if (f.name === "big.pdf") throw "it is too large";
      if (f.name === "notes.pdf") throw new Error("it is not a PDF");
      return f.name.toUpperCase();
    });
    expect(held).toEqual(["A.PDF", "B.PDF"]);
    expect(refused).toBe("big.pdf could not be opened: it is too large\nnotes.pdf could not be opened: it is not a PDF");
  });

  it("refuses none where all are held", async () => {
    expect(await heldEach([{ name: "a.pdf" }], async () => 1)).toEqual({ held: [1], refused: "" });
  });
});
