import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import type { Model } from "../store/types";
import { drawnBox } from "../../../../utils/importers";
import { frameAround, structureBox } from "./fitFrames";

/**
 * Methanol O-H...O water as two entries; something is said of the methanol that the page draws apart from its atoms' labels: an enhanced
 * stereo group of its centre whose one note ("and enantiomer") hangs beneath the structure, wider than the structure itself.
 * The note is put by the methanol's own atoms, as the methanol alone has it: its box reaches the note's left and bottom edges.
 */
describe("a structure beside a hydrogen bond keeps the notes the page draws for it", () => {
  const model = {
    atoms: [
      { id: 1, el: "C", x: 0, y: 0, stereoGroup: { kind: "and", n: 1 } },
      { id: 2, el: "O", x: 1.8, y: 0 },
      { id: 3, el: "O", x: 4.68, y: 0 },
    ],
    bonds: [
      { id: 10, a: 1, b: 2, order: 1 },
      { id: 11, a: 2, b: 3, order: 1, hydrogen: true },
    ],
  } as unknown as Model;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const whole = drawnBox(model);
  const frame = frameAround([structureBox(model, byId, [1, 2]), structureBox(model, byId, [3])]);

  it("the frame round both reaches as far left as the note does", () => {
    expect(frame.x0).toBeLessThanOrEqual(whole.minX + 1e-9);
  });
  it("and as far down", () => {
    expect(frame.y0).toBeLessThanOrEqual(whole.minY + 1e-9);
  });
  it("the methanol's own box holds the note", () => {
    const m = structureBox(model, byId, [1, 2]);
    expect(m.x0).toBeLessThanOrEqual(whole.minX + 1e-9);
  });
});
