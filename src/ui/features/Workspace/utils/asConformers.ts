/**
 * Frames taken as conformers, on purpose (docs/WORKSPACE.md, *Frames taken
 * as conformers*): a molecule read from a file stays a molecule with frames,
 * and a file's records stay compounds of their own, until the chemist says
 * otherwise - on the molecule's menu, *Frames are conformers*, or, with
 * several molecules of one compound selected, *Join as conformers*. Nothing
 * is asked as a file is read.
 */
import type { Molecule3D } from "../store/types";
import { frameBondsOf } from "./molecule3d";
import { frameXyz } from "../workflow/entries";
import { constitutionOf } from "../workflow/meno";

type Framed = Pick<Molecule3D, "atoms" | "bonds" | "frames"> & Partial<Pick<Molecule3D, "bondsFrom" | "atomsDiffer" | "path">>;

/**
 * Whether each of its frames has the same atoms in the same order and the
 * same joins, as Meno perceives them - bonds where its atoms stand close
 * enough, frame by frame, for a file that gives none (`frameBondsOf`); the
 * file's own, the same in every frame, for one that gives them. A file whose
 * frames' elements differ (`atomsDiffer`), or a path, has not.
 */
export function framesAlike(m: Framed): boolean {
  if (m.atomsDiffer || m.path) return false;
  const each = frameBondsOf(m);
  return !each || each.present.every((p) => p.every(Boolean));
}

/** Whether *Frames are conformers* is offered on its menu: it has several frames, each alike (`framesAlike`). */
export const conformersOffered = (m: Framed): boolean => (m.frames?.length ?? 0) > 0 && framesAlike(m);

/** The frame of the lowest energy, where every frame has one; else none - the frame shown stays. */
export function lowestFrame(m: Pick<Molecule3D, "frames" | "energies">): number | null {
  const n = 1 + (m.frames?.length ?? 0);
  if (m.energies?.length !== n || !m.energies.every(Number.isFinite)) return null;
  return m.energies.reduce((lo, e, k) => (e < m.energies![lo] ? k : lo), 0);
}

/** One compound by the workflow's same-constitution check (workflow/meno `constitutionOf`): the same atoms in the same order, bonded the same way, of the same charge and spin. */
const constitution = (m: Molecule3D): string =>
  constitutionOf({
    atoms: m.atoms,
    bonds: m.bonds,
    ...(Number.isInteger(m.calc?.charge) ? { charge: m.calc!.charge! } : {}),
    ...(Number.isInteger(m.calc?.multiplicity) && m.calc!.multiplicity! > 0 ? { multiplicity: m.calc!.multiplicity! } : {}),
  });

/** Whether *Join as conformers* is offered for these molecules: two or more, each with its frames alike, all one compound. */
export function joinable(ms: readonly Molecule3D[]): boolean {
  if (ms.length < 2 || !ms.every(framesAlike) || ms.some((m) => m.biopolymer)) return false;
  const first = constitution(ms[0]);
  return ms.every((m) => m.atoms.length === ms[0].atoms.length && constitution(m) === first);
}

/**
 * Molecules of one compound as one conformer set, in the order given: the
 * first's atoms, bonds and place, and every frame of each after it - each
 * frame with its energy, where it had one (NaN, none, where it had not), and
 * its name: its own, else its molecule's title (an SD record's). Why a frame
 * failed is kept; what was worked out of the molecules as wholes - numbers,
 * shares, a calculation's results - is not, as it is of none of the set.
 */
export function joined(ms: readonly Molecule3D[]): Molecule3D {
  const [base] = ms;
  const each = ms.flatMap((m) => Array.from({ length: 1 + (m.frames?.length ?? 0) }, (_, f) => ({ m, f })));
  const xyz = each.map(({ m, f }) => frameXyz(m, f));
  const energies = each.map(({ m, f }) => (m.energies?.length === 1 + (m.frames?.length ?? 0) && Number.isFinite(m.energies[f]) ? m.energies[f] : NaN));
  const names = each.map(({ m, f }) => m.frameNames?.[f] || m.title || "");
  const failed = each.map(({ m, f }) => m.failed?.[f] ?? null);
  const calc = base.calc ? (({ results: _r, imaginary: _i, ...rest }) => rest)(base.calc) : undefined;
  const {
    frames: _frames,
    energies: _energies,
    frameNames: _names,
    failed: _failed,
    numbers: _numbers,
    shares: _shares,
    degeneracies: _degeneracies,
    properties: _properties,
    imaginary: _imaginary,
    converged: _converged,
    mirrors: _mirrors,
    entryFrames: _entryFrames,
    noEntryWhy: _noEntryWhy,
    partOf: _partOf,
    partsAlone: _partsAlone,
    title: _title,
    calc: _calc,
    ...rest
  } = base;
  return {
    ...rest,
    atoms: base.atoms.map((a, k) => ({ ...a, x: xyz[0][3 * k], y: xyz[0][3 * k + 1], z: xyz[0][3 * k + 2] })),
    frames: xyz.slice(1),
    ...(energies.some(Number.isFinite) ? { energies } : {}),
    ...(names.some(Boolean) ? { frameNames: names } : {}),
    ...(failed.some(Boolean) ? { failed } : {}),
    ...(calc ? { calc } : {}),
    conformerSet: true,
  };
}
