import type { ConfiguredCentre, IsomerConfiguration } from "../../../../../lib/chem/stereoOpen";
import { smilesInput } from "../../../../../lib/layout/smilesInput";
import type { Model } from "../../store/types";
import { drawnFromSmiles } from "../../utils/smilesDrawn";

/**
 * A structure as a plugin hands it over, for tests (backlog 106 B): its picture as a MOL block, and the configuration it sends beside it -
 * each worked out here, not by the code under test.
 */

type V = [number, number, number];
const sub = (p: V, q: V): V => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const det = (u: V, v: V, w: V) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);

/**
 * A centre as the plugin gives one (`sense` +1 where det(n1 - c, n2 - c, n3 - c) is positive in a right-handed frame, the neighbours in the
 * order given): worked out here from a solid made by hand - the H (or the lowest group) pointing away from the viewer, down -z, and the three
 * named at the angles given, seen from +z - so that the known answer does not rest on Meno's own conversion.
 */
export function centreFrom(atom: number, named: { at: number; deg: number }[]): ConfiguredCentre {
  const c: V = [0, 0, 0];
  const p = (deg: number): V => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 1 / 3];
  const [u, v, w] = named.map((n) => sub(p(n.deg), c));
  return { atom, neighbours: named.map((n) => n.at), sense: det(u, v, w) > 0 ? 1 : -1 };
}

/** The plugin's picture of a structure: its atoms and bonds in the SMILES's order, as the engine lays them out, with no wedge - stating no configuration. */
export function plainPicture(smiles: string): Model {
  const m = drawnFromSmiles(smiles.replace(/@+/g, ""));
  return { ...m, bonds: m.bonds.map(({ stereo: _s, narrow: _n, display: _d, ...b }) => b) as Model["bonds"] };
}

/** The plugin's picture of a macrocycle: a regular polygon, its groups straight out of it, no wedge (as the plugin lays out a ring of 36 or more: its centres state nothing). */
export function polygon(smiles: string): Model {
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
export function configurationOf(smiles: string): IsomerConfiguration {
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

/** A drawing as a plugin's V2000 MOL block: its atoms where they are, its bonds - a wedge or hashes from its narrow end (1, 6). */
export function molblockOf(m: Model): string {
  const index = new Map(m.atoms.map((a, i) => [a.id, i + 1]));
  const pad = (v: string | number, n: number) => String(v).padStart(n);
  const atoms = m.atoms.map((a) => `${pad(a.x.toFixed(4), 10)}${pad(a.y.toFixed(4), 10)}${pad("0.0000", 10)} ${(a.el ?? "C").padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  const bonds = m.bonds.map((b) => {
    const wedge = b.stereo === "up" ? 1 : b.stereo === "down" ? 6 : 0;
    const [p, q] = wedge && b.narrow === b.b ? [b.b, b.a] : [b.a, b.b];
    return `${pad(index.get(p)!, 3)}${pad(index.get(q)!, 3)}${pad(b.order, 3)}${pad(wedge, 3)}`;
  });
  return ["", "  test", "", `${pad(m.atoms.length, 3)}${pad(m.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, "M  END", ""].join("\n");
}
