import { describe, expect, it } from "vitest";
import { labelBox, labelSetOf, layoutMolecule, segmentMeetsBox, type Atom, type Bond, type LayoutOptions, type TextItem } from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";

const L = NOMINAL_BOND_LENGTH;
const opts = (): LayoutOptions => acsWorldOptions([], [], { units: "world" });

// trans-2-methylcyclohexan-1-ol's (S)-sec-butyl ether, laid out by hand as a page draws it: the ring's two centres in and1, the
// side chain's centre wedged and in no group - so "and1" is written at each ring centre, not "and enantiomer" beneath
const at = (x: number, y: number) => ({ x: (x / 75) * L, y: (-y / 75) * L });
const and1 = { kind: "and" as const, n: 1 };
const ether = (): { atoms: Atom[]; bonds: Bond[] } => {
  const atoms: Atom[] = [
    { id: 1, ...at(908, 592), el: "C" },
    { id: 2, ...at(969, 635), el: "C" },
    { id: 3, ...at(962, 710), el: "C", stereoGroup: and1 },
    { id: 4, ...at(893, 740), el: "C", stereoGroup: and1 },
    { id: 5, ...at(833, 697), el: "C" },
    { id: 6, ...at(840, 622), el: "C" },
    { id: 7, ...at(1022, 755), el: "O" },
    { id: 8, ...at(886, 815), el: "C" },
    { id: 9, ...at(1092, 722), el: "C" },
    { id: 10, ...at(1152, 765), el: "C" },
    { id: 11, ...at(1099, 648), el: "C" },
    { id: 12, ...at(1167, 617), el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 1 },
    { a1: 3, a2: 4, order: 1 },
    { a1: 4, a2: 5, order: 1 },
    { a1: 5, a2: 0, order: 1 },
    { a1: 2, a2: 6, order: 1, stereo: "up" },
    { a1: 3, a2: 7, order: 1, stereo: "down" },
    { a1: 6, a2: 8, order: 1 },
    { a1: 8, a2: 9, order: 1, stereo: "down" },
    { a1: 8, a2: 10, order: 1 },
    { a1: 10, a2: 11, order: 1 },
  ];
  return { atoms, bonds };
};

const boxOf = (t: TextItem, o: LayoutOptions) => {
  const b = labelBox(t, t.fontPx, labelSetOf(o));
  return { minX: t.x - b.left, maxX: t.x + b.right, minY: t.y - b.bottom, maxY: t.y + b.top };
};
const meet = (p: ReturnType<typeof boxOf>, q: ReturnType<typeof boxOf>) => p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;

describe("an atom's enhanced stereo group, written at its centre (GR-11.1)", () => {
  it("is clear of every bond and every other label: never across a ring's bond", () => {
    const { atoms, bonds } = ether();
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 40);
    const groups = layout.texts.filter((t) => t.text === "and1");
    expect(groups).toHaveLength(2);
    expect(layout.texts.some((t) => t.text === "and enantiomer")).toBe(false);
    for (const g of groups) {
      const box = boxOf(g, o);
      for (const b of bonds) expect(segmentMeetsBox(atoms[b.a1], atoms[b.a2], box), `bond ${b.a1}-${b.a2}`).toBe(false);
      for (const t of layout.texts) if (t !== g) expect(meet(box, boxOf(t, o)), t.text).toBe(false);
    }
  });

  it("stands outside the ring its centre is on, where a clear place outside is: inside, it would read as the ring's", () => {
    const { atoms, bonds } = ether();
    const ring = atoms.slice(0, 6);
    // (a point inside the ring's polygon, by the crossings of a ray from it)
    const inside = (p: { x: number; y: number }) => {
      let odd = false;
      for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
        const [u, v] = [ring[k], ring[j]];
        if (u.y > p.y !== v.y > p.y && p.x < ((v.x - u.x) * (p.y - u.y)) / (v.y - u.y) + u.x) odd = !odd;
      }
      return odd;
    };
    const groups = layoutMolecule(atoms, bonds, opts(), 40).texts.filter((t) => t.text === "and1");
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(inside(g), `${g.x},${g.y}`).toBe(false);
  });

  it("stays close to its atom: within a bond's length", () => {
    const { atoms, bonds } = ether();
    const layout = layoutMolecule(atoms, bonds, opts(), 40);
    const [ring1, ring2] = [atoms[2], atoms[3]];
    const groups = layout.texts.filter((t) => t.text === "and1");
    const near = (a: Atom) => Math.min(...groups.map((g) => Math.hypot(g.x - a.x, g.y - a.y)));
    expect(near(ring1)).toBeLessThan(L);
    expect(near(ring2)).toBeLessThan(L);
  });

  it("goes where its bonds leave most room when nothing is in the way, as before: above a bare chain's centre", () => {
    // butan-2-ol, C2 in or1 beside an ungrouped wedge: the label's way the one its bonds and GR-11.1 give
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L * 0.866, y: L / 2, el: "C", stereoGroup: { kind: "or", n: 1 } },
      { id: 3, x: L * 1.732, y: 0, el: "C" },
      { id: 4, x: L * 2.598, y: L / 2, el: "C" },
      { id: 5, x: L * 1.732, y: -L, el: "O" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 1 },
      { a1: 2, a2: 3, order: 1 },
      { a1: 2, a2: 4, order: 1, stereo: "up" },
    ];
    const layout = layoutMolecule(atoms, bonds, opts(), 40);
    const g = layout.texts.find((t) => t.text === "or1")!;
    expect(g).toBeDefined();
    expect(g.y).toBeGreaterThan(atoms[1].y);
    expect(Math.abs(g.x - atoms[1].x)).toBeLessThan(L * 0.2);
  });
});

describe("a racemic drawing, all its centres in one group", () => {
  it("still says 'and enantiomer' once beneath it, with plain atoms beside the group and no label at a centre", () => {
    // the ether's ring alone: its two centres in and1, wedged; its CH2s and the methyl plain atoms, the narrow ends of no wedge
    const { atoms, bonds } = ether();
    const ring = atoms.slice(0, 8);
    const ringBonds = bonds.slice(0, 8);
    const t = layoutMolecule(ring, ringBonds, opts(), 40).texts.map((x) => x.text);
    expect(t.filter((x) => x === "and enantiomer")).toHaveLength(1);
    expect(t).not.toContain("and1");
  });
});

describe("segmentMeetsBox", () => {
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  it("meets a line through, into or along the box, and not one that passes by", () => {
    expect(segmentMeetsBox({ x: -1, y: 0.5 }, { x: 2, y: 0.5 }, box)).toBe(true);
    expect(segmentMeetsBox({ x: 0.5, y: 0.5 }, { x: 3, y: 3 }, box)).toBe(true);
    expect(segmentMeetsBox({ x: -1, y: 1.5 }, { x: 2, y: 1.5 }, box)).toBe(false);
    expect(segmentMeetsBox({ x: -1, y: 1 }, { x: 1, y: 3 }, box)).toBe(false);
    expect(segmentMeetsBox({ x: 1.5, y: -1 }, { x: 1.5, y: 2 }, box)).toBe(false);
  });
});

describe("what is said beside an atom, among labels and other notes", () => {
  const zigzag = (n: number, map = true): { atoms: Atom[]; bonds: Bond[] } => ({
    atoms: Array.from({ length: n }, (_, i) => ({ id: i + 1, x: i * L * 0.866, y: i % 2 ? L / 2 : 0, el: i === 3 ? "O" : "C", ...(map ? { map: i + 1 } : {}) })),
    bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 as const })),
  });

  it("keeps a mapping number off a label beside it and off its neighbours' notes, long ones too", () => {
    // (each note long - a map number, inv, exact - so that two neighbours set the same way would meet)
    const { atoms: plainAtoms, bonds } = zigzag(8);
    const atoms = plainAtoms.map((a, i) => ({ ...a, map: 10 + i, invRet: "invert" as const, exactChange: true }));
    const o = opts();
    const texts = layoutMolecule(atoms, bonds, o, 40).texts;
    const notes = texts.filter((t) => t.beside && t.atom == null);
    const labelsOnly = texts.filter((t) => t.atom != null);
    for (const n of notes) {
      const box = boxOf(n, o);
      for (const lab of labelsOnly) expect(meet(box, boxOf(lab, o)), `${n.text} on ${lab.text}`).toBe(false);
      for (const m of notes) if (m !== n) expect(meet(box, boxOf(m, o)), `${n.text} on ${m.text}`).toBe(false);
    }
  });

  it("is placed by what lies near it alone: the start of a long chain's notes is as the same start of a short one's", () => {
    const place = (n: number) =>
      layoutMolecule(zigzag(n).atoms, zigzag(n).bonds, opts(), 40)
        .texts.filter((t) => t.beside && t.atom == null)
        .slice(0, 10)
        .map((t) => `${t.text}@${t.x.toFixed(6)},${t.y.toFixed(6)}`);
    expect(place(400)).toEqual(place(20));
  });
});

describe("placing every note of a large mapped drawing", () => {
  /** How many times longer `run` takes on `large` than on `small`, by the CPU time of the least of several tries (as cleanUp.test's). */
  function slower<T>(small: T, large: T, run: (x: T) => void): number {
    const least = [Infinity, Infinity];
    run(small);
    run(large);
    for (let k = 0; k < 5; k++) {
      [small, large].forEach((x, i) => {
        const started = process.cpuUsage();
        let times = 0;
        let spent = 0;
        do {
          run(x);
          times++;
          const used = process.cpuUsage(started);
          spent = used.user + used.system;
        } while (spent < 50_000);
        least[i] = Math.min(least[i], spent / times);
      });
    }
    return least[1] / least[0];
  }

  it("takes time as its notes do: a chain three times as long takes well under nine times as long", () => {
    const chain = (n: number) => ({
      atoms: Array.from({ length: n }, (_, i) => ({ id: i + 1, x: i * L * 0.866, y: i % 2 ? L / 2 : 0, el: "C", map: i + 1 })) as Atom[],
      bonds: Array.from({ length: n - 1 }, (_, i) => ({ a1: i, a2: i + 1, order: 1 as const })) as Bond[],
    });
    const o = opts();
    expect(slower(chain(300), chain(900), (c) => layoutMolecule(c.atoms, c.bonds, o, 40))).toBeLessThan(6);
  });
});

describe("the notes of a crowded drawing, as every bond and label looked at once placed them", () => {
  /** A made-up grid of atoms, some O and N, most mapped, a few charged, a few in a group; bonds across and, most, up: a fixed seed. */
  const grid = (w: number, h: number): { atoms: Atom[]; bonds: Bond[] } => {
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const r = rnd();
        atoms.push({
          id: i + 1,
          x: x * L * 0.9 + (y % 2) * L * 0.45,
          y: y * L * 0.8,
          el: r < 0.2 ? "O" : r < 0.3 ? "N" : "C",
          ...(r < 0.7 ? { map: i + 1 } : {}),
          ...(r > 0.9 ? { charge: 1 } : {}),
          ...(r > 0.45 && r < 0.55 ? { stereoGroup: { kind: "and" as const, n: 1 } } : {}),
        });
        if (x) bonds.push({ a1: i - 1, a2: i, order: 1 });
        if (y && rnd() < 0.8) bonds.push({ a1: i - w, a2: i, order: 1 });
      }
    }
    return { atoms, bonds };
  };

  it("are where they were: the search near each atom gives what the search over the whole drawing gave", () => {
    const { atoms, bonds } = grid(5, 4);
    const notes = layoutMolecule(atoms, bonds, opts(), 40)
      .texts.filter((t) => t.beside || /and|or|\d/.test(t.text))
      .map((t) => `${t.text}@${t.x.toFixed(2)},${t.y.toFixed(2)}`);
    // (as the whole scan placed them, before the search was kept near each atom)
    const was = [
      ["+", 5.04, 0.66], ["+", 2.61, 2.1], ["+", 4.4, 2.04], ["1", 0, 0.61], ["2", 1.3, -1.19], ["3", 2.9, 0.59], ["5", 7.07, -0.16],
      ["6", 1.15, 2.03], ["9", 5.95, 2.48], ["10", 8.19, 2.34], ["11", -0.9, 3.78], ["12", 1.22, 3.57], ["14", 5.76, 3.78], ["15", 6.88, 3.57],
      ["18", 4.05, 5.34], ["and enantiomer", 3.65, -2.22],
    ] as const;
    expect(notes).toEqual(was.map(([t, x, y]) => `${t}@${x.toFixed(2)},${y.toFixed(2)}`));
  });

  it("and so are a larger grid's, each note as far out as it may reach", () => {
    const { atoms, bonds } = grid(12, 12);
    const notes = layoutMolecule(atoms, bonds, opts(), 40)
      .texts.filter((t) => t.beside || /and|or|\d/.test(t.text))
      .map((t) => `${t.text}@${t.x.toFixed(2)},${t.y.toFixed(2)}`);
    // (as the whole scan placed them: text@x,y, six to a line)
    const was = [
      "+@5.04,0.66|+@11.52,0.66|+@14.76,-0.66|+@1.16,2.04|+@6.01,2.03|+@10.88,4.92",
      "+@10.71,7.86|+@10.99,9.24|+@15.85,12.12|+@14.12,13.56|+@0.99,16.51|+@4.23,16.50",
      "+@10.71,16.50|1@-0.48,0.48|2@1.30,-1.19|3@2.90,0.59|5@6.14,0.59|6@7.76,0.59",
      "9@12.66,-1.13|11@16.20,1.01|12@19.05,-0.33|14@2.83,2.13|15@4.95,2.34|18@9.31,2.13",
      "19@9.51,0.42|20@12.15,2.46|21@14.67,2.34|25@-0.90,3.78|26@0.72,3.78|27@2.84,3.57",
      "30@9.27,3.56|31@9.32,3.57|32@12.51,3.56|33@12.56,3.57|35@15.80,2.19|36@18.93,2.88",
      "37@1.21,5.01|38@2.83,5.01|39@4.45,5.01|41@6.34,3.37|42@9.31,5.01|44@12.55,5.01",
      "45@14.17,5.01|46@14.17,3.62|47@17.41,5.01|48@20.05,5.74|50@1.81,6.45|51@3.24,6.77",
      "53@6.08,5.07|55@9.32,6.45|57@11.99,6.73|59@15.30,6.66|60@17.82,6.78|61@-0.30,7.20",
      "62@2.83,7.89|64@4.50,7.88|65@7.69,6.51|68@12.55,7.89|69@14.17,7.89|71@17.75,7.63",
      "73@-0.90,9.54|74@1.22,9.33|75@3.24,9.66|77@6.08,9.33|78@7.15,7.69|79@9.32,9.33",
      "81@12.56,9.33|83@15.80,9.33|84@19.05,8.31|85@1.21,10.77|86@2.83,10.77|87@4.45,9.39",
      "88@6.07,10.77|89@6.14,9.42|90@9.31,10.77|91@10.93,10.77|92@12.55,10.77|94@15.79,10.77",
      "97@-0.90,12.42|98@0.72,12.42|100@3.85,12.53|102@7.09,12.53|103@8.71,12.53|104@12.25,12.04",
      "105@13.87,12.04|108@19.16,11.52|109@1.52,13.67|110@3.34,13.48|111@5.06,13.97|112@6.68,13.97",
      "113@8.30,13.97|114@8.91,13.57|115@10.53,13.97|116@12.86,13.67|118@15.39,13.57|119@17.01,13.97",
      "121@-1.01,15.41|123@3.24,15.42|124@4.86,15.41|125@6.48,15.01|128@11.34,15.42|129@13.87,14.92",
      "131@15.49,13.69|136@5.67,16.45|138@8.91,16.45|141@13.77,16.86|142@15.39,16.86|143@17.01,16.86",
      "144@18.63,16.85|and enantiomer@9.31,-2.22",
    ].flatMap((line) => line.split("|"));
    expect(notes).toEqual(was);
  });
});
