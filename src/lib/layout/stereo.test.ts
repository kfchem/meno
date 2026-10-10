import { describe, expect, it } from "vitest";
import { layout2D } from "./engine";
import type { LayoutInput } from "./perceive";
import { drawnVolume, placeStereo } from "./stereo";
import { perceive } from "./perceive";

/** Reads a centre's configuration back off the drawing, the way the drawing shows it. */
function readBack(input: LayoutInput, centre: number): number {
  const out = layout2D(input);
  const t = input.atoms[centre].tetra!;
  const h = out.hydrogens.find((x) => x.on === centre);
  const point = (n: number) =>
    n === -1 ? (h ? h.at : null) : { x: out.x[n], y: out.y[n] };
  const lift = t.neighbours.map((n) => {
    const w = out.wedges.find((x) => x.from === centre && x.to === n);
    return w ? (w.stereo === "up" ? 1 : -1) : 0;
  });
  return drawnVolume({ x: out.x[centre], y: out.y[centre] }, t.neighbours.map(point), lift);
}

describe("drawnVolume", () => {
  // four bonds, three of them in the page within 180 degrees of each
  // other: read from the angles alone, two of them and the wedge would say
  // one thing and the other two the opposite
  const at = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
  const fan = [at(0), at(-40), at(-128), at(116)];
  const lift = [0, 0, 0, 1];

  it("reads the same whichever three bonds it is asked about", () => {
    const orders = [
      [0, 1, 2, 3],
      [1, 2, 0, 3],
      [3, 0, 1, 2],
      [2, 3, 1, 0],
    ];
    const reads = orders.map((o) => {
      const v = drawnVolume({ x: 0, y: 0 }, o.map((i) => fan[i]), o.map((i) => lift[i]));
      // (an odd reordering of the four turns the sign)
      const odd = o.reduce((n, a, i) => n + o.slice(i + 1).filter((b) => b < a).length, 0) % 2;
      return odd ? -v : v;
    });
    expect(new Set(reads).size).toBe(1);
  });

  it("reads a T as RDKit does, the H in the widest gap", () => {
    // F, Cl and Br (on a wedge) at 0, 180 and 90 degrees: RDKit reads R,
    // which with the H last is a volume of +1; the wedge on F instead, S
    expect(drawnVolume({ x: 0, y: 0 }, [at(0), at(180), at(90), null], [0, 0, 1, 0])).toBe(1);
    expect(drawnVolume({ x: 0, y: 0 }, [at(0), at(180), at(90), null], [1, 0, 0, 0])).toBe(-1);
  });

  it("reads a centre drawn with a wedge and hashes side by side", () => {
    // two ring bonds in the page, the groups on the ring atom one in front
    // and one behind (erythromycin's tertiary alcohols)
    const v = drawnVolume({ x: 0, y: 0 }, [at(150), at(210), at(60), at(-60)], [0, 0, 1, -1]);
    expect(v).toBe(-drawnVolume({ x: 0, y: 0 }, [at(150), at(210), at(60), at(-60)], [0, 0, -1, 1]));
    expect(v).not.toBe(0);
  });
});

describe("stereo", () => {
  // butan-2-ol: C0-C1(O4)-C2-C3, C1 the centre with an implicit H
  const butanol = (volume: 1 | -1): LayoutInput => ({
    atoms: [
      { el: "C" },
      { el: "C", tetra: { neighbours: [0, 2, 4, -1], volume } },
      { el: "C" },
      { el: "C" },
      { el: "O" },
    ],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 1, b: 2, order: 1 },
      { a: 2, b: 3, order: 1 },
      { a: 1, b: 4, order: 1 },
    ],
  });

  it("puts one wedge on a centre, and it says what the configuration is", () => {
    for (const volume of [1, -1] as const) {
      const out = layout2D(butanol(volume));
      expect(out.wedges.filter((w) => w.from === 1)).toHaveLength(1);
      expect(readBack(butanol(volume), 1)).toBe(volume);
    }
  });

  it("wedges an end atom out of a chain before the chain", () => {
    const out = layout2D(butanol(1));
    // the methyl or the OH, not the ethyl
    expect([0, 4]).toContain(out.wedges[0].to);
  });

  it("shows both of a ring atom's two groups, one in front and one behind", () => {
    // a ring carbon (0) with an OH (6) and a methyl (7), as erythromycin's C6
    for (const volume of [1, -1] as const) {
      const input: LayoutInput = {
        atoms: Array.from({ length: 8 }, (_, i) =>
          i === 0
            ? { el: "C", tetra: { neighbours: [1, 5, 6, 7], volume } }
            : i === 6
              ? { el: "O", hs: 1 }
              : { el: "C" },
        ),
        bonds: [
          ...[0, 1, 2, 3, 4, 5].map((i) => ({ a: i, b: (i + 1) % 6, order: 1 })),
          { a: 0, b: 6, order: 1 },
          { a: 0, b: 7, order: 1 },
        ],
      };
      const out = layout2D(input);
      const marks = out.wedges.filter((w) => w.from === 0);
      expect(marks.map((w) => w.to).sort()).toEqual([6, 7]);
      expect(new Set(marks.map((w) => w.stereo)).size).toBe(2);
      expect(readBack(input, 0)).toBe(volume);
    }
  });

  it("draws an H at a ring fusion with no other way to show it, upright", () => {
    // decalin, one fusion carbon (0) a centre: its other bonds all in rings
    const bonds: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [5, 6], [6, 7], [7, 8], [8, 9], [9, 0],
    ];
    for (const volume of [1, -1] as const) {
      const input: LayoutInput = {
        atoms: Array.from({ length: 10 }, (_, i) =>
          i === 0 ? { el: "C", tetra: { neighbours: [1, 5, 9, -1], volume } } : { el: "C" },
        ),
        bonds: bonds.map(([a, b]) => ({ a, b, order: 1 })),
      };
      const out = layout2D(input);
      expect(out.hydrogens).toHaveLength(1);
      expect(out.wedges[0].to).toBe(-1);
      expect(readBack(input, 0)).toBe(volume);
      // on no ring bond
      expect(out.wedges.every((w) => w.to === -1)).toBe(true);
    }
  });
});

describe("a wedge that says nothing for sure", () => {
  // a centre with an H and three bonds in the page, two of them in a line:
  // a wedge on the third says the configuration only by luck
  const at = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
  const input: LayoutInput = {
    atoms: [{ el: "C", tetra: { neighbours: [1, 2, 3, -1], volume: 1 } }, { el: "C" }, { el: "C" }, { el: "O" }],
    bonds: [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
    ],
  };
  const mol = perceive(input);
  const pos = new Map([
    [0, { x: 0, y: 0 }],
    [1, at(-90)],
    [2, at(0)],
    [3, at(180)],
  ]);

  it("is not drawn: the centre is shown so that it reads the same with any bond turned a little", () => {
    const { wedges, hydrogens } = placeStereo(mol, pos, mol.tetra);
    const lift = [1, 2, 3, -1].map((n) => {
      const w = wedges.find((x) => x.from === 0 && x.to === n);
      return w ? (w.stereo === "up" ? 1 : -1) : 0;
    });
    const h = hydrogens.find((x) => x.on === 0)?.at ?? null;
    const drawn = (turn: number, which: number) =>
      [1, 2, 3, -1].map((n, i) => {
        const p = n === -1 ? h : pos.get(n)!;
        if (!p || i !== which) return p;
        const t = (turn * Math.PI) / 180;
        return { x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) };
      });
    expect(drawnVolume({ x: 0, y: 0 }, drawn(0, -1), lift)).toBe(1);
    for (const which of [0, 1, 2]) for (const turn of [-12, 12]) expect(drawnVolume({ x: 0, y: 0 }, drawn(turn, which), lift)).toBe(1);
  });
});
