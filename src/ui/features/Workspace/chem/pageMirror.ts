/**
 * Of two enantiomers, which one the page makes, and which it gives as the
 * other's mirror image (docs/WORKSPACE.md, *3D structures*): so that a
 * structure and its mirror image, drawn apart or asked for apart, come to
 * the page with the same conformers - each the other's reflection - and the
 * same shares. Which is made is Meno's choice, not the plugin's (the plugin
 * boundary, 2026-10-31): the one whose identity with its configuration
 * (lib/chem/identity) comes first - a choice either way would be as right,
 * this one fixed so that a pair is always made alike. The other is made as
 * that one's mirror image: its drawing's wedges turned over and its chosen
 * configuration turned with them, made by the plugin as asked, and each
 * conformer reflected through a plane - every x turned - and its R and S
 * turned.
 */
import type { IdentityInput } from "../../../../lib/chem/identity";
import { identitiesAsked } from "./identityOff";
import type { IsomerConfiguration } from "../../../../lib/chem/stereoOpen";
import type { ConfiguredAxis, ConfiguredRun } from "../../../../lib/chem/perception/stereo/configuration";
import { isElementSymbol } from "../../../../lib/roles/molblock";
import type { Conformers } from "../../../../lib/roles/client";
import type { Model } from "../store/types";
import { identityInputOf } from "./identityOf";
import { EXACT, sideOfLine, torsionSense, volumeSign } from "../../../../lib/chem/perception/stereo/geometry";

/** A drawing seen in a mirror: each wedge turned over (up for down), each depth turned (a cage drawn in perspective). */
export function mirroredPart(part: Model): Model {
  return {
    ...part,
    atoms: part.atoms.map((a) => (a.z != null ? { ...a, z: -a.z } : a)),
    bonds: part.bonds.map((b) => (b.stereo === "up" ? { ...b, stereo: "down" as const } : b.stereo === "down" ? { ...b, stereo: "up" as const } : b)),
  };
}

/** A configuration seen in a mirror: each centre's sense turned; a double bond's cis or trans as it is. */
export function mirroredConfiguration<C extends IsomerConfiguration>(c: C): C {
  return { ...c, centres: c.centres.map((x) => ({ ...x, sense: x.sense > 0 ? -1 : 1 })) };
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
export async function madeAs(part: Model, isomer: IsomerConfiguration): Promise<"itself" | "mirror"> {
  if (part.atoms.some((a) => !isElementSymbol(a.el) || a.abbrev) || part.bonds.some((b) => b.endpoints?.length)) return "itself";
  const { input, unread } = identityInputOf(part);
  if (unread.length) return "itself";
  const own = withConfiguration(input, isomer);
  if (!own) return "itself";
  // (the two identities worked out off the drawing thread - chem/identityOff)
  const [text, mirror] = (await identitiesAsked([own, turned(own)])).map((f) => f.text);
  return mirror < text ? "mirror" : "itself";
}

/** `input` with `isomer`'s centres and double bonds given their configurations - none where one names an atom or bond it does not have. */
export function withConfiguration(input: IdentityInput, isomer: IsomerConfiguration): IdentityInput | null {
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

/** A SMILES seen in a mirror: each @ and @@ turned (a SMILES of the mirror image, not written as any toolkit would write it). */
const turnedSmiles = (s: string) => s.replace(/@@|@/g, (m) => (m === "@@" ? "@" : "@@"));

/**
 * Conformers made of a stereoisomer's mirror image, given as the
 * stereoisomer's own: each frame reflected through the plane x = 0 - their
 * R and S read from it after (chem/openStereo `withOwnCip`).
 */
export function reflectedConformers<C extends Omit<Conformers, "chosen">>(c: C): C {
  return {
    ...c,
    frames: c.frames.map((f) => f.map((v, k) => (k % 3 === 0 ? -v : v))),
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
export function hasConfiguration(c: Pick<Conformers, "frames">, part: Model, isomer: IsomerConfiguration): boolean {
  const missed = notKept(c, part, isomer);
  return missed != null && !missed.length;
}

/**
 * Where conformers do not have a configuration a stereoisomer asks for, or its drawing shows (`hasConfiguration`), in any frame:
 * each such centre by its atom ("N9", numbered from 1) and double bond by its atoms ("C2=C3") - none where every one is kept;
 * null where `isomer` names an atom or a bond the structure has not. So what was asked and not made in 3D is said, never passed
 * by: a bridgehead N whose given sense the toolkit drops (Troeger's base's).
 */
export function notKept(c: Pick<Conformers, "frames">, part: Model, isomer: IsomerConfiguration): string[] | null {
  const { input } = identityInputOf(part);
  const own = withConfiguration(input, isomer);
  if (!own) return null;
  const at = (f: number[], i: number) => [f[3 * i], f[3 * i + 1], f[3 * i + 2]];
  const name = (i: number) => `${own.atoms[i].el}${i + 1}`;
  const out: string[] = [];
  own.atoms.forEach((a, i) => {
    if (!a.tetra) return;
    const t = a.tetra;
    const kept = c.frames.every((f) => {
      const [u, v, w] = t.neighbours.slice(0, 3).map((n) => at(f, n));
      return volumeSign(u, v, w, at(f, i), EXACT) === t.volume;
    });
    if (!kept) out.push(name(i));
  });
  own.bonds.forEach((b) => {
    const st = b.stereo;
    if (!st) return;
    if (!c.frames.every((f) => sideOfLine(at(f, b.a), at(f, b.b), at(f, st.refs[0]), at(f, st.refs[1])) > 0 === st.cis)) out.push(`${name(b.a)}=${name(b.b)}`);
  });
  // (an axis's and a run's, Meno's own: read from each frame's torsion about them)
  for (const x of isomer.axes ?? []) if (!c.frames.every((f) => axisHeld(f, x))) out.push(`${name(x.atoms[0])}~${name(x.atoms[1])}`);
  for (const x of isomer.cumulated ?? []) if (!c.frames.every((f) => runHeld(f, x))) out.push(`${name(x.atoms[0])}=..=${name(x.atoms[1])}`);
  return out;
}

/** A frame's place of atom `i`. */
const placeOf = (f: readonly number[], i: number): [number, number, number] => [f[3 * i], f[3 * i + 1], f[3 * i + 2]];
/** Whether a frame has an axis's configuration (`ConfiguredAxis`): the torsion of its refs about it of its sense - the core's torsion, identity's (geometry `torsionSense`). */
const axisHeld = (f: readonly number[], x: ConfiguredAxis) => torsionSense(placeOf(f, x.refs[0]), placeOf(f, x.atoms[0]), placeOf(f, x.atoms[1]), placeOf(f, x.refs[1])) === x.sense;
/** Whether a frame has a run's cis or trans (`ConfiguredRun`): its refs on one side of the line of its ends, or on two - the core's rule for a double bond (geometry `sideOfLine`). */
const runHeld = (f: readonly number[], x: ConfiguredRun) => sideOfLine(placeOf(f, x.atoms[0]), placeOf(f, x.atoms[1]), placeOf(f, x.refs[0]), placeOf(f, x.refs[1])) > 0 === x.cis;

/**
 * Of conformers made of a stereoisomer that gives an axis, an odd run, or a centre of three bonds and a lone pair its configuration -
 * an axis's and a run's Meno's own, never the plugin's to give; a cage's bridgehead N's or a ring's N the toolkit's embedding does not
 * hold (MEASURED: Troeger's base's two N each way about half the time) - those whose frames have it, each frame kept or not with its
 * energies, and how many were set aside and where, said; null where none has it: that stereoisomer cannot be made in 3D (Troeger's
 * base given in,out never comes back so). `c` itself where it gives none. A centre of three is only ever one the candidates hold, so an
 * amine's N, which inverts, is never one (the chemistry check's ruling). `part`, where given, names the atoms said (`N5`).
 */
export function bySense<T extends Pick<Conformers, "frames" | "energies" | "modelEnergies" | "how">>(c: T, isomer: IsomerConfiguration, part?: Model): T | null {
  const pyramids = isomer.centres.filter((x) => x.neighbours.length === 3);
  if (!isomer.axes?.length && !isomer.cumulated?.length && !pyramids.length) return c;
  const pyramidHeld = (f: readonly number[], x: (typeof pyramids)[number]) =>
    volumeSign(placeOf(f, x.neighbours[0]), placeOf(f, x.neighbours[1]), placeOf(f, x.neighbours[2]), placeOf(f, x.atom), EXACT) === x.sense;
  const turned = c.frames.map((f) => (isomer.axes ?? []).every((x) => axisHeld(f, x)) && (isomer.cumulated ?? []).every((x) => runHeld(f, x)));
  const pyramided = c.frames.map((f) => pyramids.every((x) => pyramidHeld(f, x)));
  const keep = c.frames.map((_, k) => turned[k] && pyramided[k]);
  const kept = keep.filter(Boolean).length;
  if (!kept) return null;
  const pick = <V,>(xs: readonly V[] | undefined) => xs && xs.filter((_, k) => keep[k]);
  const offTurned = turned.filter((t) => !t).length;
  const offPyramid = c.frames.filter((_, k) => turned[k] && !pyramided[k]).length;
  const inputAtoms = part ? identityInputOf(part).input.atoms : undefined;
  const name = (i: number) => `${inputAtoms?.[i]?.el ?? "atom "}${i + 1}`;
  const at = pyramids.filter((x) => c.frames.some((f) => !pyramidHeld(f, x))).map((x) => name(x.atom));
  return {
    ...c,
    frames: pick(c.frames)!,
    ...(c.energies ? { energies: pick(c.energies) } : {}),
    ...(c.modelEnergies ? { modelEnergies: pick(c.modelEnergies) } : {}),
    how: [
      ...(c.how ?? []),
      ...(offTurned ? [{ label: "Stereo", text: `${offTurned} of ${c.frames.length} embedded with the other configuration at its axis or run: set aside` }] : []),
      ...(offPyramid ? [{ label: "Stereo", text: `${offPyramid} of ${c.frames.length} came out as the mirror form at ${at.join(", ")}: set aside` }] : []),
    ],
  };
}
