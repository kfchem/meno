import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import type { Model } from "../store/types";
import { drawnBox } from "../../../../utils/importers";
import { frameAround, structureBox } from "./fitFrames";

const bonds = [
  { id: 10, a: 1, b: 2, order: 1 },
  { id: 11, a: 2, b: 3, order: 1, hydrogen: true },
];

describe("what the box takes beside a hydrogen bond, and what it still takes alone", () => {
  it("methanol...water: a frame round both is at least as high and as low as the pair's drawing (the labels' own heights)", () => {
    const model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0 },
        { id: 2, el: "O", x: 1.8, y: 0 },
        { id: 3, el: "O", x: 4.68, y: 0 },
      ],
      bonds,
    } as unknown as Model;
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    const whole = drawnBox(model);
    const frame = frameAround([structureBox(model, byId, [1, 2]), structureBox(model, byId, [3])]);
    expect(frame.y1).toBeGreaterThanOrEqual(whole.maxY - 1e-9);
    expect(frame.y0).toBeLessThanOrEqual(whole.minY + 1e-9);
  });

  it("a structure joined to nothing keeps its notes in its box: an enhanced stereo group's note beneath it is held", () => {
    const model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0, stereoGroup: { kind: "and", n: 1 } },
        { id: 2, el: "O", x: 1.8, y: 0 },
      ],
      bonds: [bonds[0]],
    } as unknown as Model;
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    const whole = drawnBox(model);
    const box = structureBox(model, byId, [1, 2]);
    expect(box.x0).toBeLessThanOrEqual(whole.minX + 1e-9);
    expect(box.y0).toBeLessThanOrEqual(whole.minY + 1e-9);
  });

  it("a wedge's broad end, drawn beside a hydrogen bond, is held (the box takes what its own bonds draw, not only its atoms)", () => {
    const model = {
      atoms: [
        { id: 1, el: "C", x: 0, y: 0 },
        { id: 2, el: "O", x: 1.8, y: 0 },
        { id: 3, el: "O", x: 4.68, y: 0 },
        { id: 4, el: "C", x: -0.9, y: 1.559 },
      ],
      bonds: [
        { id: 10, a: 1, b: 2, order: 1 },
        { id: 11, a: 2, b: 3, order: 1, hydrogen: true },
        { id: 12, a: 1, b: 4, order: 1, stereo: "wedge" },
      ],
    } as unknown as Model;
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    const whole = drawnBox(model);
    const box = structureBox(model, byId, [1, 2, 4]);
    expect(box.y1).toBeGreaterThanOrEqual(whole.maxY - 1e-9);
    expect(box.x0).toBeLessThanOrEqual(whole.minX + 1e-9);
  });
});
