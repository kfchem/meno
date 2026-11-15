import { describe, expect, it } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import { identity } from "../../../../lib/chem/identity";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import type { ConfiguredCentre, Configuration } from "../../../../lib/chem/stereoOpen";
import type { Model } from "../store/types";
import { cipMarksOf } from "./cipMarks";
import { laidOut, notShownOf } from "./cleanUp";
import { identityOfDrawn } from "./identityOf";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { asCameSaid } from "./fromSmiles";

/**
 * A structure laid out from the configuration its source gives beside its drawing (backlog 106 B; chem/givenConfiguration): the plugin's
 * picture is only places, and Meno's engine draws the configuration given - each centre and double bond as given, by the block's atom and
 * bond numbers - not what the picture's wedges say.
 */

type V = [number, number, number];
const sub = (p: V, q: V): V => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const det = (u: V, v: V, w: V) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);

/**
 * A centre as the plugin gives one (`sense` +1 where det(n1 - c, n2 - c, n3 - c) is positive in a right-handed frame, the neighbours in the
 * order given): worked out here from a solid made by hand - the H (or the lowest group) pointing away from the viewer, down -z, and the three
 * named at the angles given, seen from +z - so that the known answer does not rest on Meno's own conversion.
 */
function centreFrom(atom: number, named: { at: number; deg: number }[]): ConfiguredCentre {
  const c: V = [0, 0, 0];
  const p = (deg: number): V => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 1 / 3];
  const [u, v, w] = named.map((n) => sub(p(n.deg), c));
  return { atom, neighbours: named.map((n) => n.at), sense: det(u, v, w) > 0 ? 1 : -1 };
}

/** The plugin's picture of a structure: its atoms and bonds in the SMILES's order, as the engine lays them out, with no wedge - stating no configuration. */
function plainPicture(smiles: string): Model {
  const m = drawnFromSmiles(smiles.replace(/@+/g, ""));
  return { ...m, bonds: m.bonds.map(({ stereo: _s, narrow: _n, display: _d, ...b }) => b) as Model["bonds"] };
}

/** R or S at the atom at `index`, read by Meno's own CIP on what was laid out. */
async function labelOf(smiles: string, configuration: Configuration, index: number): Promise<string | undefined> {
  const laid = await laidOut(plainPicture(smiles), MENO, { axes: [], cumulated: [], configuration });
  const id = laid.atoms[index].id;
  const asked: Model = { ...laid, atoms: laid.atoms.map((a) => (a.id === id ? { ...a, stereoShown: true as const } : a)) };
  return cipMarksOf(asked).centres.get(id);
}

describe("a centre given beside the plugin's drawing: its sense, by hand", () => {
  // (R: the H away, Br, Cl, F clockwise as seen - priorities Br > Cl > F > H. FC(Cl)Br: F 0, C 1, Cl 2, Br 3)
  const br = { at: 3, deg: 90 };
  const cl = { at: 2, deg: -30 };
  const f = { at: 0, deg: 210 };
  const mirror = (c: ConfiguredCentre): ConfiguredCentre => ({ ...c, sense: (-c.sense) as 1 | -1 });

  it("lays (R)-bromochlorofluoromethane out as R, its mirror as S - whatever order the neighbours are named in", async () => {
    for (const order of [[f, cl, br], [br, f, cl], [cl, br, f], [br, cl, f]]) {
      const centre = centreFrom(1, order);
      expect(await labelOf("FC(Cl)Br", { centres: [centre], doubles: [] }, 1), order.map((n) => n.at).join()).toBe("R");
      expect(await labelOf("FC(Cl)Br", { centres: [mirror(centre)], doubles: [] }, 1), order.map((n) => n.at).join()).toBe("S");
    }
  });

  it("lays L-alanine out as S, from either way of writing it", async () => {
    // (S: the H away, N, COOH, CH3 counterclockwise as seen. C[C@H](N)C(=O)O: CH3 0, Ca 1, N 2, C 3; N[C@@H](C)C(=O)O: N 0, Ca 1, CH3 2, C 3)
    expect(await labelOf("CC(N)C(=O)O", { centres: [centreFrom(1, [{ at: 0, deg: 330 }, { at: 2, deg: 90 }, { at: 3, deg: 210 }])], doubles: [] }, 1)).toBe("S");
    expect(await labelOf("NC(C)C(=O)O", { centres: [centreFrom(1, [{ at: 0, deg: 90 }, { at: 2, deg: 330 }, { at: 3, deg: 210 }])], doubles: [] }, 1)).toBe("S");
  });

  it("lays L-proline out as S, its centre in a ring", async () => {
    // (OC(=O)C1CCCN1: O 0, C 1, O 2, Ca 3, C 4, C 5, C 6, N 7; S: N, COOH, C4 counterclockwise as seen, the H away)
    for (const order of [[{ at: 1, deg: 210 }, { at: 4, deg: 330 }, { at: 7, deg: 90 }], [{ at: 7, deg: 90 }, { at: 1, deg: 210 }, { at: 4, deg: 330 }]]) {
      expect(await labelOf("OC(=O)C1CCCN1", { centres: [centreFrom(3, order)], doubles: [] }, 3)).toBe("S");
    }
  });
});

/** The plugin's picture of a macrocycle: a regular polygon, its groups straight out of it, no wedge (as the plugin lays out a ring of 36 or more: its centres state nothing). */
function polygon(smiles: string): Model {
  const m = plainPicture(smiles);
  const input = smilesInput(smiles.replace(/@+/g, ""));
  // (the ring: the longest cycle through the atoms of degree two or more, found as the atoms left when the ones of degree one are taken off)
  const degree = new Map<number, number>();
  for (const b of input.bonds) [b.a, b.b].forEach((x) => degree.set(x, (degree.get(x) ?? 0) + 1));
  const ring = [...degree.keys()].filter((x) => (degree.get(x) ?? 0) > 1).sort((p, q) => p - q);
  const at = new Map<number, { x: number; y: number }>();
  const r = ring.length / (2 * Math.PI);
  ring.forEach((x, k) => at.set(x, { x: r * Math.cos((2 * Math.PI * k) / ring.length), y: r * Math.sin((2 * Math.PI * k) / ring.length) }));
  for (const b of input.bonds) {
    for (const [inner, outer] of [[b.a, b.b], [b.b, b.a]]) {
      if (at.has(inner) && !at.has(outer)) {
        const p = at.get(inner)!;
        const len = Math.hypot(p.x, p.y);
        at.set(outer, { x: p.x * (1 + 1 / len), y: p.y * (1 + 1 / len) });
      }
    }
  }
  return { ...m, atoms: m.atoms.map((a, i) => ({ ...a, ...(at.get(i) ?? {}) })) };
}

/** The configuration the SMILES states, as the plugin would send it: Meno's own reading of the text, in the field's terms (each centre's named neighbours and its sense). */
function configurationOf(smiles: string): Configuration {
  const input = smilesInput(smiles);
  return {
    centres: input.atoms.flatMap((a, i) => {
      if (!a.tetra) return [];
      const named = a.tetra.neighbours.filter((n) => n !== -1);
      return [{ atom: i, neighbours: named, sense: a.tetra.volume }];
    }),
    doubles: [],
  };
}

describe("a macrocycle given beside the plugin's polygon", () => {
  const lactone36 = "C[C@@H]1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC(=O)O1";
  const diol36 = "O[C@@H]1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC[C@H]1O";

  it("is laid out by Meno, not as a polygon, and states every centre given: the ring-36 lactone and trans-diol are their SMILES", async () => {
    for (const smi of [lactone36, diol36]) {
      const laid = await laidOut(polygon(smi), MENO, { axes: [], cumulated: [], configuration: configurationOf(smi) });
      expect(identityOfDrawn(laid).text, smi).toBe(identity(smilesInput(smi)).text);
    }
  });

  it("states nothing given as the polygon came, and says how much: the drawing kept as it came shows none of the centres given", () => {
    const came = polygon(diol36);
    const lost = notShownOf(came, { axes: [], cumulated: [], configuration: configurationOf(diol36) });
    expect(lost).toEqual({ centres: [2, 2], doubles: [0, 0], axes: [0, 0] });
    expect(asCameSaid({ asCame: "the structure could not be laid out", notShown: lost! })).toBe("Drawn as it came: it could not be laid out. 2 of its 2 stereocentres are not shown by this drawing.");
  });
});
