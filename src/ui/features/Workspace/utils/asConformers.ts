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
import { asConformers, constitutionOf } from "../workflow/meno";
import { howUnlike, setEntries } from "../workflow/entries";
import { stereoIdentity } from "../../../../lib/entry";
import { perceiveStereo, type Asker } from "../workflow/configurations";

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

/**
 * The molecules *Join as conformers* is offered for, as a right-click opens
 * its menu (`menu`, Workspace `MenuTarget`): with the selection, the molecules
 * in 3D it holds, in page order - on one of them, or on the page beside them
 * (where it is the selection's menu); none where they are not `joinable`.
 */
export function joinOffered(
  molecules: readonly Molecule3D[],
  sel3d: ReadonlySet<number>,
  menu: { kind?: string | null; id?: number | null; selection?: string } | null | undefined,
): number[] {
  if (menu?.selection !== "here") return [];
  if (menu.kind != null && !(menu.kind === "molecule3d" && menu.id != null && sel3d.has(menu.id))) return [];
  const ms = molecules.filter((m) => sel3d.has(m.id));
  return ms.length >= 2 && joinable(ms) ? ms.map((m) => m.id) : [];
}

/** Whether *Join as conformers* is offered for these molecules: two or more, each with its frames alike, all one compound. */
export function joinable(ms: readonly Molecule3D[]): boolean {
  if (ms.length < 2 || !ms.every(framesAlike) || ms.some((m) => m.biopolymer)) return false;
  const first = constitution(ms[0]);
  return ms.every((m) => m.atoms.length === ms[0].atoms.length && constitution(m) === first);
}

/** The words a join refused says: why, of the molecules selected, in one plain sentence (docs/WORKSPACE.md, *Frames taken as conformers*). */
export const JOIN_REFUSED = {
  stereoisomers: "Not joined as conformers: the selected molecules are not all the same stereoisomer.",
  nothingTells: "Not joined as conformers: nothing added tells which stereoisomer the selected molecules are.",
  notTold: "Not joined as conformers: which stereoisomer one of the selected molecules is could not be told.",
  unspecified: "Not joined as conformers: one of the selected molecules has a stereocentre or double bond left unspecified.",
  calculations: "Not joined as conformers: the selected molecules come from different calculations.",
  sources: "Not joined as conformers: the selected molecules' energies come from different sources.",
  labels: "Not joined as conformers: the selected molecules' stereo labels differ, so they may be different stereoisomers.",
} as const;

/**
 * Why these molecules are not one compound's conformers, judged as *As
 * conformers* judges them (workflow/meno `asConformers`): which stereoisomer
 * each geometry is asked first, as that step asks it (workflow/configurations
 * `perceiveStereo`), then the same judgement - the same constitution and the
 * same stereoisomer, made alike (workflow/entries `unlikeMade`). Null where
 * they are one compound; else why not, in one plain sentence (`JOIN_REFUSED`).
 */
export async function notOneCompound(ms: readonly Molecule3D[], asker: Asker): Promise<string | null> {
  await perceiveStereo(setEntries(ms, "molecules"), asker);
  const entries = setEntries(ms, "molecules");
  const out = asConformers(entries);
  if (out.ok) return new Set(out.kept.map((e) => e.compound)).size > 1 ? JOIN_REFUSED.stereoisomers : null;
  // (refused: a molecule whose stereoisomer is not known - nothing to ask, not told, or left unspecified - else made unlike)
  const unknown = entries.find((e) => stereoIdentity(e.stereo) == null);
  if (unknown) return "none" in asker ? JOIN_REFUSED.nothingTells : unknown.stereo?.perceived ? JOIN_REFUSED.unspecified : JOIN_REFUSED.notTold;
  return JOIN_REFUSED[howUnlike(entries) ?? "stereoisomers"];
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
