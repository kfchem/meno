/**
 * Of two enantiomers, which one the page makes, and which it gives as the
 * other's mirror image (docs/WORKSPACE.md, *3D structures*): so that a
 * structure and its mirror image, drawn apart or asked for apart, come to
 * the page with the same conformers - each the other's reflection - and the
 * same shares. Which is made is Meno's choice, not the plugin's (the plugin
 * boundary, 2026-10-31): the one whose identity with its configuration
 * (lib/chem/identity) comes first. The other is made as that one's mirror
 * image: its drawing's wedges turned over and its chosen configuration
 * turned with them, made by the plugin as asked, and each conformer
 * reflected through a plane - every x turned - and its R and S turned.
 */
import { identityText, type IdentityInput } from "../../../../lib/chem/identity";
import type { Configuration } from "../../../../lib/chem/stereoOpen";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Conformers } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { identityInputOf } from "./identityOf";

/** A drawing seen in a mirror: each wedge turned over (up for down), each depth turned (a cage drawn in perspective). */
export function mirroredPart(part: Model): Model {
  return {
    ...part,
    atoms: part.atoms.map((a) => (a.z != null ? { ...a, z: -a.z } : a)),
    bonds: part.bonds.map((b) => (b.stereo === "up" ? { ...b, stereo: "down" as const } : b.stereo === "down" ? { ...b, stereo: "up" as const } : b)),
  };
}

/** A configuration seen in a mirror: each centre's sense turned; a double bond's cis or trans as it is. */
export function mirroredConfiguration(c: Configuration): Configuration {
  return { centres: c.centres.map((x) => ({ ...x, sense: x.sense > 0 ? -1 : 1 })), doubles: c.doubles };
}

/**
 * Of a structure drawn (`part`, as its block is written: its atoms in
 * order, every one an element) and one of its stereoisomers (`isomer`: the
 * configuration chosen of what it leaves open), whether the page makes it
 * itself or as its mirror image's reflection: `mirror` where its mirror
 * image's identity comes first. Itself where they are one (no stereo, a
 * meso form), or where the drawing cannot be read whole - a wedge it does
 * not read, a label written out, a ring bound to a metal through a star -
 * so that nothing is taken for a mirror image that is not one.
 */
export function madeAs(part: Model, isomer: Configuration): "itself" | "mirror" {
  if (part.atoms.some((a) => !isElementSymbol(a.el) || a.abbrev) || part.bonds.some((b) => b.endpoints?.length)) return "itself";
  const { input, unread } = identityInputOf(part);
  if (unread.length) return "itself";
  const own = withConfiguration(input, isomer);
  if (!own) return "itself";
  const text = identityText(own);
  const mirror = identityText(turned(own));
  return mirror < text ? "mirror" : "itself";
}

/** `input` with `isomer`'s centres and double bonds given their configurations - none where one names an atom or bond it does not have. */
function withConfiguration(input: IdentityInput, isomer: Configuration): IdentityInput | null {
  const atoms = input.atoms.map((a) => ({ ...a }));
  for (const c of isomer.centres) {
    const a = atoms[c.atom];
    if (!a) return null;
    // (an H not drawn as an atom the fourth, last: the sense is the first three's)
    const neighbours = c.neighbours.length === 3 && (a.hs ?? 0) === 1 ? [...c.neighbours, -1] : [...c.neighbours];
    atoms[c.atom] = { ...a, tetra: { neighbours, volume: c.sense } };
  }
  const bonds = input.bonds.map((b) => ({ ...b }));
  for (const d of isomer.doubles) {
    const b = bonds[d.bond];
    if (!b) return null;
    const bondedTo = (x: number, end: number) => input.bonds.some((o) => (o.a === x && o.b === end) || (o.b === x && o.a === end));
    const [p, q] = d.ends;
    const refs: [number, number] | null = bondedTo(p, b.a) && bondedTo(q, b.b) ? [p, q] : bondedTo(q, b.a) && bondedTo(p, b.b) ? [q, p] : null;
    if (!refs) return null;
    bonds[d.bond] = { ...b, stereo: { refs, cis: d.cis } };
  }
  return { ...input, atoms, bonds };
}

/** `input` seen in a mirror: each centre's sense and each axis's turned. */
function turned(input: IdentityInput): IdentityInput {
  return {
    ...input,
    atoms: input.atoms.map((a) => (a.tetra ? { ...a, tetra: { ...a.tetra, volume: a.tetra.volume > 0 ? -1 : 1 } } : a)),
    ...(input.axes ? { axes: input.axes.map((x) => ({ ...x, sense: x.sense > 0 ? -1 : 1 })) } : {}),
  };
}

/** A CIP label seen in a mirror: R and S, M and P turned; r, s, m, p and E and Z as they are. */
const TURNED: Record<string, string> = { R: "S", S: "R", M: "P", P: "M" };

/** A SMILES seen in a mirror: each @ and @@ turned (a SMILES of the mirror image, not written as any toolkit would write it). */
const turnedSmiles = (s: string) => s.replace(/@@|@/g, (m) => (m === "@@" ? "@" : "@@"));

/**
 * Conformers made of a stereoisomer's mirror image, given as the
 * stereoisomer's own: each frame reflected through the plane x = 0, each
 * centre's R or S and each axis's M or P turned.
 */
export function reflectedConformers<C extends Omit<Conformers, "chosen">>(c: C): C {
  const flip = (labels: Record<string, string>) => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, TURNED[v] ?? v]));
  return {
    ...c,
    frames: c.frames.map((f) => f.map((v, k) => (k % 3 === 0 ? -v : v))),
    cip: { atoms: flip(c.cip.atoms), bonds: c.cip.bonds },
    smiles: turnedSmiles(c.smiles),
  };
}

/**
 * Whether conformers have every configuration a stereoisomer asks for - its
 * chosen centres and double bonds (`isomer`), and those its drawing shows
 * (`drawn`, identity's input of it) - in every frame: a centre's the sign
 * of the volume its first three neighbours span, a double bond's cis or
 * trans by the dihedral of an atom on each end. A conformer that has not
 * (a reflection that did not give the stereoisomer after all) says it is
 * to be made itself.
 */
export function hasConfiguration(c: Pick<Conformers, "frames">, part: Model, isomer: Configuration): boolean {
  const { input } = identityInputOf(part);
  const own = withConfiguration(input, isomer);
  if (!own) return false;
  const at = (f: number[], i: number) => [f[3 * i], f[3 * i + 1], f[3 * i + 2]];
  const minus = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p: number[], q: number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return c.frames.every((f) =>
    own.atoms.every((a, i) => {
      if (!a.tetra) return true;
      const [u, v, w] = a.tetra.neighbours.slice(0, 3).map((n) => minus(at(f, n), at(f, i)));
      return Math.sign(dot(u, cross(v, w))) === a.tetra.volume;
    }) &&
    own.bonds.every((b) => {
      if (!b.stereo) return true;
      const axis = minus(at(f, b.b), at(f, b.a));
      const side = dot(cross(axis, minus(at(f, b.stereo.refs[0]), at(f, b.a))), cross(axis, minus(at(f, b.stereo.refs[1]), at(f, b.b))));
      return side > 0 === b.stereo.cis;
    }),
  );
}
