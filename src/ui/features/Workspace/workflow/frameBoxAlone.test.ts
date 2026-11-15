import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/calc/workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));
import type { Model } from "../store/types";
import { drawnBox } from "../../../../utils/importers";
import { structureBox } from "./fitFrames";

const box = (m: ReturnType<typeof drawnBox>) => [m.minX, m.maxX, m.minY, m.maxY];

describe("an entry's box beside a hydrogen bond, and one joined to nothing", () => {
  // methanol with an enhanced stereo group's note, a wedge and a charged centre, then a water bonded through a hydrogen bond
  const methanol = [
    { id: 1, el: "C", x: 0, y: 0, stereoGroup: { kind: "and", n: 1 } },
    { id: 2, el: "O", x: 1.8, y: 0 },
    { id: 4, el: "N", x: -1.8, y: 0, charge: 1 },
    { id: 5, el: "C", x: 0, y: 1.8 },
  ];
  const own = [
    { id: 10, a: 1, b: 2, order: 1 },
    { id: 12, a: 1, b: 4, order: 1, stereo: "wedge" },
    { id: 13, a: 1, b: 5, order: 2 },
  ];
  const alone = { atoms: methanol, bonds: own } as unknown as Model;
  const ids = new Set(methanol.map((a) => a.id));

  it("the own path for a structure with nothing beside it is the box of its drawing alone", () => {
    const a = box(drawnBox(alone));
    const o = box(drawnBox(alone, ids));
    o.forEach((v, i) => expect(v).toBeCloseTo(a[i], 6));
  });

  it("beside a hydrogen bond the entry's left and bottom edges are the structure's alone (its note as the structure alone has it)", () => {
    const beside = {
      atoms: [...methanol, { id: 3, el: "O", x: 4.68, y: 0 }],
      bonds: [...own, { id: 11, a: 2, b: 3, order: 1, hydrogen: true }],
    } as unknown as Model;
    const byId = new Map(beside.atoms.map((a) => [a.id, a]));
    const m = structureBox(beside, byId, [1, 2, 4, 5]);
    const a = drawnBox(alone);
    expect(m.x0).toBeCloseTo(a.minX, 6);
    expect(m.y0).toBeCloseTo(a.minY, 6);
  });
});
