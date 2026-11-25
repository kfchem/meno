import { describe, expect, it, vi } from "vitest";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { readSmiles } from "../../../../lib/chem/smiles";
import { MENO } from "../../../../lib/chem/style";
import { readStereo } from "../../../../lib/layout/drawn";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { drawingOf } from "./drawing";

/**
 * An N-aryl oxaziridine's N, pasted as a SMILES, through `structureFromSmiles` itself - what a paste and Quick Add call - with the plugin
 * stood in for as it answers: its drawing of the SMILES (a MOL block with no wedge) and its configuration, which holds the ring carbon and
 * not the N (its toolkit keeps no configuration at an N bonded to an aromatic ring). Meno keeps one there (perception/stereo/lonePairs),
 * so the N's configuration is Meno's own reading of the text. Meno's layout and reading back are not stood in for.
 *
 * Atoms of C[C@@]1(c2ccccc2)[N@](c2ccccc2)O1, in the order written: C0 (methyl), C1 (ring C), c2-c7 (C-phenyl), N8, c9-c14 (N-phenyl),
 * O15. The N is written after C1, then its branch c9, then O15: no ring-closure digit at the N.
 */
const ARYL = (n: "@" | "@@") => `C[C@@]1(c2ccccc2)[N${n}](c2ccccc2)O1`;
const N = 8;
const [C1, C9, O15] = [1, 9, 15];

let configuration: unknown = undefined;
vi.mock("../../../../lib/roles/worker", () => ({
  chemWorker: async () => ({
    request: async (op: string, args: { smiles?: string }) => {
      if (op === "from_smiles") return { molblock: pluginBlock(args.smiles ?? ""), ...(configuration ? { configuration } : {}) };
      return { read: true, elements: [] };
    },
  }),
}));

/** The plugin's picture: the same atoms and bonds, flat, no wedge. */
function pluginBlock(smi: string): string {
  const m = drawnFromSmiles(smi.replace(/\[([CN])@+\]/g, "$1"));
  return writeMolfile({ atoms: m.atoms.map(({ id, x, y, el }) => ({ id, x, y, el })), bonds: m.bonds.map(({ id, a, b, order }) => ({ id, a, b, order })) });
}

/**
 * By hand, from the drawing alone: the sign of det(b - a, c - a, d - a) for the N's four places in the order SMILES takes them -
 * a = C1 (written before it), b = its lone pair (where SMILES puts an implicit H: next after the atom before it), c = c9, d = O15.
 * Each place is its atom's x and y as drawn, and a depth: +1 (toward the viewer) for the far end of a wedge from the N,
 * -1 for a hashed bond's, 0 for a plain bond's. The lone pair points away from the three: minus the sum of their unit directions.
 * Positive means b, c, d run clockwise seen from a (OpenSMILES `@@`), negative anticlockwise (`@`): with a at the origin, b, c, d at
 * angles 0, 120 and 240 degrees in the plane z = 2, det = +5.2, and seen from below - from a, looking along +z - rising angles turn
 * clockwise.
 */
function handSense(drawn: Awaited<ReturnType<typeof paste>>, centre = N, order: (number | "lp")[] = [C1, "lp", C9, O15]): number {
  const id = (i: number) => drawn.atoms[i].id;
  const at = (i: number) => drawn.atoms[i];
  const depth = (k: number) => {
    const b = drawn.bonds.find((x) => (x.a === id(centre) && x.b === id(k)) || (x.b === id(centre) && x.a === id(k)));
    if (!b || !b.stereo || b.stereo === "none") return 0;
    // (its narrow end: the one it names, or else the end with more bonds, `a` on a tie - store/types `Bond.narrow`)
    const degree = (x: number) => drawn.bonds.filter((y) => y.a === x || y.b === x).length;
    const narrow = b.narrow ?? (degree(b.a) >= degree(b.b) ? b.a : b.b);
    expect(narrow, "a wedge or hashed bond at the centre is narrow at it").toBe(id(centre));
    return b.stereo === "up" ? 1 : b.stereo === "down" ? -1 : 0;
  };
  // (x, y and the depth as a right-handed frame: the model's y as a MOL block's, which the drawing is read from unturned - the frame
  //  checked on the ring carbon, whose configuration the plugin gives and whose drawing the given-configuration tests pin by hand)
  const place = (k: number): [number, number, number] => [at(k).x, at(k).y, depth(k)];
  const c: [number, number, number] = [at(centre).x, at(centre).y, 0];
  const sub = (p: number[], q: number[]) => p.map((v, i) => v - q[i]);
  const unit = (v: number[]) => v.map((x) => x / Math.hypot(...v));
  const atomsOf = order.filter((k): k is number => k !== "lp");
  const ways = atomsOf.map((k) => unit(sub(place(k), c)));
  const lp = sub(c, ways.reduce((s, w) => s.map((v, i) => v + w[i]), [0, 0, 0]));
  const [a, b1, c1, d1] = order.map((k) => (k === "lp" ? lp : place(k)));
  const [u, v, w] = [sub(b1, a), sub(c1, a), sub(d1, a)];
  return Math.sign(u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]));
}

async function paste(smi: string) {
  const { structureFromSmiles } = await import("./fromSmiles");
  return structureFromSmiles(smi, MENO);
}

describe("an N-aryl oxaziridine's N, pasted as a SMILES", () => {
  it("is read with its configuration by Meno's reader, each mark its own", () => {
    const [at, other] = [readSmiles(ARYL("@")).atoms[N].tetra, readSmiles(ARYL("@@")).atoms[N].tetra];
    expect(at?.neighbours).toEqual([C1, C9, O15]);
    expect(other?.neighbours).toEqual([C1, C9, O15]);
    expect(at!.volume).toBe(-other!.volume);
  });

  it("is drawn with a wedge or hashed bond at the N stating what the SMILES says, the twins opposite, and read back so", async () => {
    // (the plugin's configuration, as its toolkit gives it for this text: the ring carbon only)
    configuration = { centres: [{ atom: 1, neighbours: [0, 2, 8, 15], sense: -1 }], doubles: [] };
    const senses: number[] = [];
    const read: number[] = [];
    for (const n of ["@", "@@"] as const) {
      const drawn = await paste(ARYL(n));
      const d = drawingOf(drawn);
      // (a bond at the N drawn wedged or hashed)
      expect(drawn.bonds.some((b) => (b.a === drawn.atoms[N].id || b.b === drawn.atoms[N].id) && (b.stereo === "up" || b.stereo === "down")), n).toBe(true);
      const sense = handSense(drawn);
      // (the ring carbon, [C@@], its neighbours in the order SMILES takes them: C0, O15 by the ring-closure digit written at it, c2, N8 - clockwise seen from C0)
      expect(handSense(drawn, C1, [0, O15, 2, N]), `C1 ${n}`).toBe(1);
      // (by hand: [N@] is anticlockwise seen from C1, so negative; [N@@] positive)
      expect(sense, n).toBe(n === "@" ? -1 : 1);
      senses.push(sense);
      // (Meno's reading back of the drawing holds a configuration at the N, the ring carbon's too)
      const back = readStereo(d.atoms, d.bonds).tetra;
      expect(back.has(N), n).toBe(true);
      expect(back.has(C1), n).toBe(true);
      read.push(back.get(N)!.volume * (back.get(N)!.neighbours.join() === readSmiles(ARYL(n)).atoms[N].tetra!.neighbours.join() ? 1 : NaN));
    }
    expect(senses[0]).toBe(-senses[1]);
    // (read back as the reader read the text: the same neighbours, the same sign)
    expect(read).toEqual([readSmiles(ARYL("@")).atoms[N].tetra!.volume, readSmiles(ARYL("@@")).atoms[N].tetra!.volume]);
  });

  it("does not say the N is left open: what the plugin leaves open, less the centres Meno's own reading gives", async () => {
    const { lonePairsGivenOf, specified } = await import("./fromSmiles");
    const plugin = { centres: [{ atom: 1, neighbours: [0, 2, 8, 15], sense: -1 as const }], doubles: [] };
    const own = lonePairsGivenOf(ARYL("@"), pluginBlock(ARYL("@")), plugin);
    expect(own.map((c) => c.atom)).toEqual([N]);
    // (the plugin's own count, the ring carbon configured: the N alone left open)
    const left = { atoms: [N], bonds: [], cumulenes: [], cumulated: [] };
    expect(specified(left as never, [], pluginBlock(ARYL("@")), own).atoms).toEqual([]);
    // (a centre the plugin's reading holds is never read again by Meno's)
    expect(lonePairsGivenOf(ARYL("@"), pluginBlock(ARYL("@")), { centres: [...plugin.centres, { atom: N, neighbours: [1, 9, 15], sense: 1 }], doubles: [] })).toEqual([]);
  });

  it("draws no wedge at an N-acyl oxaziridine's N, written with @: it keeps no configuration", async () => {
    // (CC(=O)[N@]1OC1(C)C: C0 C1 O2 N3 O4 C5 C6 C7 - the plugin's configuration holds nothing)
    configuration = { centres: [], doubles: [] };
    const drawn = await paste("CC(=O)[N@]1OC1(C)C");
    const n = drawn.atoms[3].id;
    expect(drawn.bonds.filter((b) => (b.a === n || b.b === n) && (b.stereo === "up" || b.stereo === "down"))).toEqual([]);
  });
});
