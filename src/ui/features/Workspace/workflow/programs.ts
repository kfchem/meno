/**
 * Steps a plugin's program does (docs/WORKFLOWS.md, *What changes in the
 * contract*): what the plugin is given of each entry, its jobs as it
 * prepares them, what a job gave as it reads it back, and what the step
 * says it did. Plain data, checked on the way in, whoever sent it; the
 * runs themselves are the store's (store/slices/workflowSlice).
 */
import { isId } from "../../../../lib/plugins/manifest";
import { valueText } from "../../../../lib/calc/results";
import { speciesOf, type WrittenMolecule } from "../../../../lib/io/writers";
import { ENTRY_SCHEMA, geometryKey, type By, type Property, type Restraint } from "../../../../lib/entry";
import { factor } from "../../../../lib/units";
import { isUnit, type Unit } from "../../../../lib/units";
import { isotopeMass } from "../../../../lib/chem/isotopes";
import { fragmentsOf } from "../../../../lib/chem/fragments";
import { COORDINATION_BOND } from "../../../../lib/chem/molecule";
import { skeletonWhy } from "../../../../lib/chem/skeleton";
import { calcOf, OUTPUT_SCHEMA, type CalcInfo, type CalcSource, type ReaderOutput } from "../../../../lib/calc/output";
import type { JobFile } from "../../../../lib/jobs";
import { CALC_CARRIED, calcProperties, setEntries, withoutCarried, type SetEntry } from "./entries";
import { convergedAt, convergedOf } from "./converged";
import { inputOf, type Flow } from "./flow";
import { levelKey, levelSaid, matchesOf, mostOf, pairEntries, PATH_PAIR, sideUnlike, type PairAs } from "./pairs";
import type { OptionValues } from "../../../../lib/options";
import { bondedPairs, bondRadii } from "../../../../utils/structureParsers";
import type { Worked } from "./run";
import { failureKindOf, WORDS_MOST, type Failure, type FailureKind } from "./failures";
import { inputsOf, kindInfo, type Holds3D, type StepKind } from "./kinds";

/**
 * An entry as a plugin is given it: Meno's plain data - its atoms, each its
 * element, place in ångströms, charge and radical; its bonds by index with
 * their orders; its name - and its charge and spin multiplicity, as Export
 * reads them (lib/io/writers `speciesOf`).
 */
/** An entry as a plugin is given it: the entry's version (lib/entry `ENTRY_SCHEMA`); its molecule - each isotope's mass with it, in daltons, where Meno knows it - its charge and multiplicity, and its files (docs/PLUGINS.md, *The entry a plugin is given*). */
export type PluginEntry = Omit<WrittenMolecule, "atoms"> & {
  schema: number;
  atoms: (WrittenMolecule["atoms"][number] & { mass?: number })[];
  charge: number;
  multiplicity: number;
  /** The molecules its bonds make of its atoms, each its atoms by number (lib/chem/fragments, Meno's one rule). */
  fragments: number[][];
  files?: EntryFile[];
  end?: PluginEntry;
  /** Its restraints (the entry record's `Restraint`, each held by the energy the record states), where it carries some - and where a minimisation first held them (`start`: x, y and z by atom in turn). */
  restraints?: Restraint[];
  start?: number[];
};

/** A file an entry is given besides its geometry (a step's `files`): its kind, by id, its name and its text - the output its molecule was read from. */
export type EntryFile = { kind: string; name: string; text: string };

/**
 * The file an entry's molecule was read from, or the wavefunction kept with
 * it - the first of them of one of `kinds` (a step's `files`) - where the
 * entry is that molecule's last frame, the geometry an output ends on; its
 * text held this session (`held`). None, where there is none.
 */
export async function entryFiles(
  e: Pick<SetEntry, "last">,
  sources: readonly ({ name: string; sha256: string; kind?: string } | undefined)[],
  kinds: readonly string[],
  held: (sha256: string) => Promise<{ name: string; text: string } | undefined>,
): Promise<EntryFile[]> {
  if (!kinds.length || e.last === false) return [];
  for (const source of sources) {
    if (!source?.kind || !kinds.includes(source.kind)) continue;
    const got = await held(source.sha256);
    if (got) return [{ kind: source.kind, name: source.name, text: got.text }];
  }
  return [];
}

export function pluginEntry(e: SetEntry): PluginEntry {
  const molecule: WrittenMolecule = {
    ...(e.name ? { name: e.name } : {}),
    atoms: e.atoms.map((a, i) => ({
      el: a.el,
      x: e.xyz[3 * i],
      y: e.xyz[3 * i + 1],
      z: e.xyz[3 * i + 2],
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.radical ? { radical: a.radical } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
    })),
    // (a coordination bond single and marked, as the entry record holds one: docs/PLUGINS.md, *The entry a plugin is given*)
    bonds: e.bonds.map((b) => (b.order === COORDINATION_BOND ? { a1: b.a1, a2: b.a2, order: 1, coordination: true as const } : { a1: b.a1, a2: b.a2, order: b.order })),
  };
  // (an isotope's mass with it, where NIST gives a measured one: what a program's input takes - ORCA's "M =")
  const atoms = molecule.atoms.map((a) => {
    const mass = a.isotope ? isotopeMass(a.el, a.isotope) : undefined;
    return mass != null ? { ...a, mass } : a;
  });
  // (a molecule read from a calculation: the state it was in there; else what its atoms say - Meno's one rule)
  const species = speciesOf({ ...molecule, ...(e.skeleton ? { skeleton: true } : {}) }, e);
  // (a skeleton is refused before anything is sent - stepRuns, `skeletonsRefused` - so none comes here)
  if (!species) throw new Error(skeletonWhy());
  const { charge, multiplicity } = species;
  // (its restraints, as Restraints and Torsion restraints left them: what a plugin that minimises with them holds - and where they were first held)
  const held = e.properties?.restraints;
  const restraints = held?.status === "computed" && typeof held.value === "object" && held.value !== null && "restraints" in held.value ? held.value : undefined;
  return {
    schema: ENTRY_SCHEMA,
    ...molecule,
    atoms,
    charge,
    multiplicity,
    fragments: fragmentsOf(atoms.length, molecule.bonds),
    // (the end it is paired with, where it is a pair's start: given as it is, beside it - Path search's)
    ...(e.end ? { end: pluginEntry(e.end) } : {}),
    // (its sides, where it is a guess paired with them: each given as it is - Optimise to a saddle point's)
    ...(e.sides ? { sides: { reactant: pluginEntry(e.sides.reactant), product: pluginEntry(e.sides.product) } } : {}),
    ...(restraints?.restraints.length ? { restraints: restraints.restraints.map((r) => ({ ...r, atoms: [...r.atoms] })) } : {}),
    ...(restraints?.start ? { start: [...restraints.start] } : {}),
  };
}

/**
 * A job as a plugin prepares it: the entries it is for, by their place; its
 * program, by name; its arguments; its input files, and the one of them its
 * program reads as its input, where it reads one (Gaussian's, run as
 * `g16 <input`); the programs installed beside its own run after it, each
 * by its name and with its arguments (ORCA's orca_2mkl: its manifest's
 * `installed[].beside`); and the files it reads back.
 */
export type Prepared = {
  entries: number[];
  program: string;
  args: string[];
  files: JobFile[];
  stdin?: string;
  then?: Then[];
  reads: string[];
  /** The memory it takes, in MiB, as its plugin declares it (ORCA's, Gaussian's, from what they are given): counted against what jobs may use. */
  memory?: number;
  /** The other plugins whose programs it needs, by id - each one its plugin's manifest declares (`needs`): ORCA's xTB methods, the xTB plugin's xtb. */
  needs?: string[];
  /** The cores it takes, where its plugin says fewer than it was given (ORCA with no MPI to run its processes with: one): never more. */
  cores?: number;
};

/** The most memory a job may say it takes, in MiB: 64 TiB. */
const MEMORY_MOST = 64 * 1024 * 1024;

/** A program installed beside a job's own, run after it: by its name there, with its arguments. */
export type Then = { program: string; args: string[] };

const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

/** A file's name in a job's folder: inside it, never above it. */
const inside = (name: string) => !!name && name.length <= 200 && !name.startsWith("/") && !/^[A-Za-z]:/.test(name) && name.split(/[\\/]/).every((p) => p && p !== "." && p !== "..");
const KIND_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const texts = (v: unknown, most: number) => (Array.isArray(v) && v.length <= most && v.every((t) => typeof t === "string") ? (v as string[]) : null);

/** An entry a plugin would not prepare a job for, by its place among those sent - and why, its kind one of core's (`refused` where it names none). */
export type Refusal = { entry: number; kind: FailureKind; why: string };

/**
 * The entries a plugin refused as it prepared the others' jobs (`refused`
 * beside `jobs`: `{"entry": 2, "why": "..."}`), each among the `count`
 * sent and named once; none where it named none, or named one wrongly.
 */
export function readRefused(raw: unknown, count: number): Refusal[] {
  const list = (raw as { refused?: unknown } | null)?.refused;
  if (!Array.isArray(list) || list.length > count) return [];
  const out: Refusal[] = [];
  for (const r of list) {
    const g = r as { entry?: unknown; why?: unknown; kind?: unknown } | null;
    const entry = g?.entry;
    if (!Number.isInteger(entry) || (entry as number) < 0 || (entry as number) >= count || out.some((o) => o.entry === entry) || typeof g?.why !== "string") return [];
    out.push({ entry: entry as number, kind: g.kind === undefined ? "refused" : failureKindOf(g.kind), why: g.why.trim().slice(0, WORDS_MOST) || "It did not say why" });
  }
  return out;
}

/**
 * What a plugin says of how it prepared a step's jobs, in a line of plain
 * words beside them (`"note": "frequencies computed numerically"`) - said
 * on the step's line, so that nothing it chose for the chemist is hidden;
 * none where it says none, or what it says is no line of words.
 */
export function readNote(raw: unknown): string | undefined {
  const note = (raw as { note?: unknown } | null)?.note;
  if (typeof note !== "string") return undefined;
  const line = note.replace(/\s+/g, " ").trim().slice(0, WORDS_MOST);
  return line || undefined;
}

/**
 * The jobs a plugin prepared for `count` entries, checked: each its entries
 * among those, every entry in one - or refused (`readRefused`), and then in
 * none; its program a name; its files inside its folder. Why not, where
 * they are not.
 */
export function readPrepared(raw: unknown, count: number): Prepared[] | string {
  const jobs = (raw as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs) || !jobs.length) return "It prepared no job";
  const out: Prepared[] = [];
  const refused = new Set(readRefused(raw, count).map((r) => r.entry));
  const covered = new Set<number>(refused);
  for (const j of jobs) {
    const r = j as Record<string, unknown> | null;
    const entries = Array.isArray(r?.entries) && r.entries.every((i) => Number.isInteger(i) && i >= 0 && i < count) ? (r.entries as number[]) : null;
    const program = typeof r?.program === "string" && PROGRAM.test(r.program) ? r.program : null;
    const args = texts(r?.args, 200);
    const reads = texts(r?.reads ?? [], 50);
    const then =
      r?.then === undefined
        ? []
        : Array.isArray(r.then) && r.then.length <= 4
          ? r.then.map((t: unknown) => {
              const g = t as { program?: unknown; args?: unknown } | null;
              const a = texts(g?.args ?? [], 50);
              return typeof g?.program === "string" && PROGRAM.test(g.program) && a ? { program: g.program, args: [...a] } : null;
            })
          : [null];
    const files = Array.isArray(r?.files)
      ? r.files.flatMap((f: unknown) => {
          const g = f as { name?: unknown; text?: unknown } | null;
          return typeof g?.name === "string" && inside(g.name) && typeof g.text === "string" ? [{ name: g.name, text: g.text }] : [];
        })
      : [];
    const stdin = r?.stdin;
    const given = stdin === undefined || (typeof stdin === "string" && files.some((f) => f.name === stdin));
    // (other plugins' programs it needs, by their ids: a few, each once)
    const needs = r?.needs === undefined ? [] : Array.isArray(r.needs) && r.needs.length <= 4 && r.needs.every(isId) && new Set(r.needs).size === r.needs.length ? (r.needs as string[]) : null;
    if (!entries?.length || !program || !args || !reads || reads.some((n) => !inside(n)) || files.length !== (r?.files as unknown[]).length || !given || then.some((t) => !t) || !needs)
      return "It prepared a job Meno cannot run";
    if (entries.some((i) => refused.has(i))) return "It prepared a job for what it refused";
    entries.forEach((i) => covered.add(i));
    out.push({
      entries: [...entries],
      program,
      args: [...args],
      files,
      ...(typeof stdin === "string" ? { stdin } : {}),
      ...(then.length ? { then: then as Then[] } : {}),
      reads: [...reads],
      // (a whole number of MiB, within reason; any other, none said)
      ...(Number.isInteger(r?.memory) && (r!.memory as number) > 0 && (r!.memory as number) <= MEMORY_MOST ? { memory: r!.memory as number } : {}),
      // (fewer cores than it was given, where its plugin says so: a whole number, at least one - never more, the step sees to that)
      ...(Number.isInteger(r?.cores) && (r!.cores as number) >= 1 ? { cores: r!.cores as number } : {}),
      ...(needs.length ? { needs: [...needs] } : {}),
    });
  }
  if (covered.size !== count) return "It prepared no job for some of what came in";
  return out;
}

/**
 * An output a job wrote that Meno is to read with its readers, as it reads
 * one opened (lib/calc/read): its kind, by id; and where it is - a file the
 * job's `prepare` said it reads back, or what the program printed, its log
 * - and the name it goes by; and, where the job wrote one, the wavefunction
 * to keep with the molecules read from it (a file it reads back, its kind
 * and the name it goes by: lib/calc/output `CalcInfo.wavefunction`).
 */
export type ToRead = { kind: string; name: string; wavefunction?: { kind: string; file: string; name: string } } & ({ file: string } | { log: true });

/**
 * Surfaces a job wrote for an entry, as grids in cube files Meno reads
 * itself (lib/calc/cube): a list of them, by what it is called, each row
 * its file, the value it is drawn at, and - where another grid colours it
 * (lib/calc/results `SurfaceColour`) - that grid's file and the values its
 * scale runs between, and what they are. NCI's: an RDG surface coloured by
 * sign(λ2)ρ.
 */
export type ToSurfaces = {
  name: string;
  rows: { label: string; file: string; iso?: number; colour?: { file: string; from: number; to: number; label?: string } }[];
};

function surfacesOf(v: unknown): ToSurfaces | null {
  const s = v as { name?: unknown; rows?: unknown } | null;
  const name = typeof s?.name === "string" && s.name.trim() ? s.name.trim().slice(0, 80) : null;
  if (!name || !Array.isArray(s?.rows) || !s.rows.length || s.rows.length > 20) return null;
  const rows: ToSurfaces["rows"] = [];
  for (const x of s.rows as Record<string, unknown>[]) {
    const label = typeof x?.label === "string" && x.label.trim() ? x.label.trim().slice(0, 80) : null;
    const file = typeof x?.file === "string" && inside(x.file) ? x.file : null;
    const iso = typeof x?.iso === "number" && Number.isFinite(x.iso) && x.iso > 0 ? x.iso : undefined;
    const c = x?.colour as Record<string, unknown> | undefined;
    const colour =
      c === undefined
        ? undefined
        : typeof c?.file === "string" && inside(c.file) && typeof c.from === "number" && typeof c.to === "number" && Number.isFinite(c.from) && Number.isFinite(c.to) && c.from < c.to
          ? { file: c.file, from: c.from, to: c.to, ...(typeof c.label === "string" && c.label.trim() ? { label: c.label.trim().slice(0, 80) } : {}) }
          : null;
    if (!label || !file || colour === null) return null;
    rows.push({ label, file, ...(iso != null ? { iso } : {}), ...(colour ? { colour } : {}) });
  }
  return { name, rows };
}

/** What a plugin said to read, one for each entry, each its kind and where (a file, or the job's log); or why that cannot be read. */
function readsOf(list: unknown, count: number): { read: ToRead[] } | { why: string } {
  if (!Array.isArray(list) || list.length !== count) return { why: "It read back nothing for it" };
  const read: ToRead[] = [];
  for (const x of list as Record<string, unknown>[]) {
      const kind = typeof x?.kind === "string" && KIND_ID.test(x.kind) ? x.kind : null;
      const file = typeof x?.file === "string" && inside(x.file) ? x.file : null;
      const name = typeof x?.name === "string" && inside(x.name) ? x.name : file;
      const w = x?.wavefunction as Record<string, unknown> | undefined;
      const wavefunction =
        w === undefined
          ? undefined
          : typeof w?.kind === "string" && KIND_ID.test(w.kind) && typeof w.file === "string" && inside(w.file) && typeof w.name === "string" && inside(w.name)
            ? { kind: w.kind, file: w.file, name: w.name }
            : null;
      if (!kind || !name || (!file && x?.log !== true) || wavefunction === null) return { why: "It said to read what Meno cannot" };
      read.push({ ...(file ? { kind, name, file } : { kind, name, log: true as const }), ...(wavefunction ? { wavefunction } : {}) });
  }
  return { read };
}

/**
 * What a plugin read back of a job: an output for each of its entries, in
 * Meno's own form - or, for each, an output for Meno's readers to read
 * (ORCA's, Gaussian's: a program installed separately), or surfaces in
 * files Meno reads itself (`ToSurfaces`); or why the job did not give one.
 * An output may be why that entry alone failed (`{why, kind}`: its kind
 * one of core's, else `failed` - its words kept), the rest of the job's
 * taken as they are.
 */
export function readCollected(raw: unknown, count: number): (ReaderOutput | Failure)[] | { read: ToRead[] } | { surfaces: ToSurfaces[] } | { why: string; kind?: FailureKind; partial?: ToRead[] } {
  const r = raw as { outputs?: unknown; read?: unknown; surfaces?: unknown; why?: unknown; kind?: unknown; partial?: unknown } | null;
  // (the job as a whole did not give what it was for: its program's words, as its plugin read them - of the kind it says,
  //  one of core's (an optimisation that did not converge), else a program's error - and, where it says to, what the run
  //  wrote, read for the geometry it reached alone: one it cannot read leaves the failure as it is)
  if (typeof r?.why === "string") {
    const partial = r.partial === undefined ? null : readsOf(r.partial, count);
    const kind = r.kind === undefined ? "program-error" : failureKindOf(r.kind);
    return { why: r.why.trim().slice(0, WORDS_MOST) || "It did not say why", kind, ...(partial && !("why" in partial) ? { partial: partial.read } : {}) };
  }
  if (r?.surfaces !== undefined) {
    if (!Array.isArray(r.surfaces) || r.surfaces.length !== count) return { why: "It read back nothing for it" };
    const surfaces = r.surfaces.map(surfacesOf);
    return surfaces.every((s): s is ToSurfaces => s != null) ? { surfaces } : { why: "It said to read what Meno cannot" };
  }
  if (r?.read !== undefined) return readsOf(r.read, count);
  if (!Array.isArray(r?.outputs) || r.outputs.length !== count) return { why: "It read back nothing for it" };

  const outs: (ReaderOutput | Failure)[] = [];
  for (const o of r.outputs as ReaderOutput[]) {
    // (that entry alone failed, saying why)
    const why = (o as { why?: unknown } | null)?.why;
    if (typeof why === "string") {
      outs.push({ kind: failureKindOf((o as { kind?: unknown }).kind), why: why.trim().slice(0, WORDS_MOST) || "It did not say why" });
      continue;
    }
    // (an output Meno cannot take fails its entry alone)
    if (o?.schema != null && o.schema !== OUTPUT_SCHEMA) outs.push({ kind: "failed", why: "It read it back in a form this Meno does not read" });
    else if (!Array.isArray(o?.atoms) || !Array.isArray(o.frames) || !o.frames.some((f) => Array.isArray(f) && f.length === 3 * o.atoms.length)) outs.push({ kind: "no-geometry", why: "It read back no geometry" });
    // (every frame a list: one it could not read, given as null, is not taken)
    else if (!o.frames.every(Array.isArray)) outs.push({ kind: "no-geometry", why: "It read back a geometry Meno cannot read" });
    else outs.push(o);
  }
  return outs;
}

/**
 * An entry as a program works it out anew: what went in, without the
 * calculation it came with or what its molecule kept - how it was made,
 * what its energies were from - none of which is so of what the program
 * gives back (entries `SetEntry.calc`, `keep`); nor its marks - why it
 * failed, its imaginary frequencies, that its marks did not read - which
 * were of the geometry it came with: the new calculation's own output
 * marks it again, or does not. Nor what it carries of a calculation - a
 * conformer's free energy, its vibrations (entries `CALC_CARRIED`) - which
 * the new one reads again, or is no longer so.
 */
const anew = ({ calc: _calc, keep: _keep, failed: _failed, imaginary: _imaginary, marksUnread: _unread, end: _end, sides: _sides, paired: _paired, converged: _converged, ...entry }: SetEntry): SetEntry => withoutCarried(entry);

/** The property a path search writes on each path: how its start and end were paired ("in order, by place: start a #2 with end b #2"). */
export const PAIRED = "path.paired";

/** An entry worked out anew by a calculation whose energy is its own - an optimisation's, frequencies', a conformer search's: without the energy it came with, which is another calculation's, where the new one read none. */
const anewWithoutEnergy = (entry: SetEntry): SetEntry => {
  const { energy: _energy, ...rest } = anew(entry);
  return rest;
};

/** A failed run's entry as a step starts from it (docs/WORKFLOWS.md, *Runs again*): its geometry alone - worked out anew, and without the energy it came with, as no result. */
const startOnly = anewWithoutEnergy;

/** What an entry worked out anew says where its bonds are no longer those it came with: no longer the structure drawn it was made from. */
export const UNLINKED_WHY = "its bonds or charge changed in the calculation: no longer the structure drawn it was made from";

/**
 * Whether a geometry a program gave an entry is still of the compound it
 * came as: its atoms are the entry's, in order (`workedOf` checks them);
 * each atom bonded to the same others as where it stood before - by the
 * bonds each geometry's places give (`bondedPairs`), orders aside, so that
 * what is read the one way of both is not taken for a change; and of the
 * charge it went with, where the calculation says one. A bond broken or
 * formed, or another charge, is another compound.
 */
export function sameCompound(entry: Pick<SetEntry, "atoms" | "xyz" | "charge" | "multiplicity" | "skeleton">, xyz: readonly number[], charge?: number | null): boolean {
  const radii = bondRadii(entry.atoms.map((a) => a.el));
  if (bondedPairs(entry.xyz, radii).join() !== bondedPairs(xyz, radii).join()) return false;
  if (charge == null) return true;
  const atoms = entry.atoms.map((a, i) => ({ ...a, x: entry.xyz[3 * i], y: entry.xyz[3 * i + 1], z: entry.xyz[3 * i + 2] }));
  return speciesOf({ atoms, bonds: [], ...(entry.skeleton ? { skeleton: true } : {}) }, entry)?.charge === charge;
}

/**
 * What an entry a program worked out anew keeps of what it came with: the
 * structure drawn it was made from (`drawnFrom`, `drawnAs`) and its bonds
 * to ring centres - where it is still that compound (`sameCompound`) - so
 * that what it comes to stands by its structure drawn. Never how it was
 * made, nor its stereo labels: those were of the geometry it came with, not
 * of this one - its configurations are perceived anew from its own. Where
 * its bonds or charge changed, none of them: and it says so, in how it was
 * made.
 */
function keptAnew(entry: SetEntry, xyz: readonly number[], charge?: number | null): Pick<SetEntry, "keep"> {
  const k = entry.keep;
  if (!k?.drawnFrom && !k?.drawnAs) return {};
  if (!sameCompound(entry, xyz, charge)) return { keep: { made: { how: [{ label: "Drawing", text: UNLINKED_WHY }] } } };
  return { keep: { drawnFrom: k.drawnFrom, drawnAs: k.drawnAs, ...(k.centres?.length ? { centres: k.centres } : {}) } };
}

/**
 * An entry as a job worked it out (lib/calc/output): its last geometry and
 * energy - an optimisation's path before it, kept where the step is
 * *Optimise* - and what the calculation says of it, read by `readers` from
 * the output kept as `source`. Why not, where what came back is not the
 * molecule that went, or no geometry came back. An optimisation the output
 * says did not converge (`optimised: false`) is not done: its last
 * geometry, as far as it came, is the entry of the step's Failed exit -
 * never passed on as a minimum (until 2026-10-22 it was).
 */
export function workedOf(kind: StepKind, entry: SetEntry, out: ReaderOutput, readers: readonly string[], source?: CalcSource): Worked | Failure {
  const n = entry.atoms.length;
  if (out.atoms.length !== n || out.atoms.some((el, i) => el !== entry.atoms[i].el)) return { kind: "wrong-molecule", why: "What came back is not the molecule that went" };
  const frames = out.frames.filter((f) => f.length === 3 * n && f.every(Number.isFinite));
  if (!frames.length) return { kind: "no-geometry", why: "It read back no geometry" };
  const energies = out.energies?.length === frames.length && out.energies.every(Number.isFinite) ? out.energies : undefined;
  const last = frames[frames.length - 1];
  // (an optimisation's way there - to a minimum, or to a saddle point - its frames before its last)
  const optimising = kind === "optimise" || kind === "saddle-point";
  const path = optimising && frames.length > 1 ? frames.slice(0, -1) : undefined;
  const calc = calcOf(out, readers, source);
  if (kind === "path-search") return pathWorked(entry, out, frames, energies, calc);
  if (kind === "energy") return singlePointWorked(entry, last, energies, calc);
  if (kind === "reaction-path") return reactionPathWorked(entry, out, frames, energies, calc);
  const failed =
    out.optimised === false && (optimising || kind === "frequencies")
      ? { kind: "not-converged" as const, why: "The optimisation did not converge" }
      : // (a saddle point's optimisation whose reader could not say whether it converged: never passed on as converged)
        kind === "saddle-point" && out.optimised == null
        ? { kind: "failed" as const, why: "Whether the optimisation converged could not be read" }
        : undefined;
  // (where it ended converged, as the program said: an optimisation's, a saddle point's - or, frequencies at the geometry
  //  one converged at, that still: carried on, at the geometry as the program gave it back)
  const was = convergedOf(entry);
  const converged = failed
    ? undefined
    : kind === "optimise" && out.optimised === true
      ? convergedAt("optimisation", last)
      : kind === "saddle-point" && out.optimised === true
        ? convergedAt("saddle point optimisation", last)
        : kind === "frequencies" && was && sameShape(entry.xyz, last)
          ? convergedAt(was.how, last)
          : undefined;
  return {
    // (a failed run's entry taken as a start geometry alone: nothing of it a result - its energy, calculation and mark dropped)
    ...(entry.failed ? startOnly(entry) : kind === "optimise" || kind === "frequencies" ? anewWithoutEnergy(entry) : anew(entry)),
    // (what it came as - its structure drawn - where it still is that compound)
    ...keptAnew(entry, last, calc?.charge),
    xyz: [...last],
    ...(energies ? { energy: energies[energies.length - 1] } : {}),
    ...(path ? { path, ...(energies ? { pathEnergies: energies.slice(0, -1) } : {}) } : {}),
    calc,
    ...(failed ? { failed } : {}),
    ...(out.optimised === false && kind === "minimise" ? { failed: { kind: "not-converged" as const, why: "The minimisation did not converge in the steps it was given" } } : {}),
    ...(kind === "minimise" ? firstHeld(entry) : {}),
    ...(converged ? { converged } : {}),
  };
}

/**
 * Where a run that stopped got to (docs/WORKFLOWS.md, *Runs again*): what
 * it wrote, read, as its entry - its way there as frames, beginning with
 * the geometry it came in with, so that *Take frames*' first is a start
 * from the beginning and its last a start from where it stopped - for a
 * step after it to start from; never a result: no energy of the run's is
 * on it, its frames' none, since a frame's energy stands as its entry's
 * where a step takes it. None where what it wrote holds no geometry.
 */
export function stoppedAt(kind: StepKind, entry: SetEntry, out: ReaderOutput, readers: readonly string[], source?: CalcSource): Worked | null {
  const w = workedOf(kind, entry, { ...out, energies: undefined }, readers, source);
  if (isFailure(w)) return null;
  const { energy: _energy, pathEnergies: _pathEnergies, failed: _failed, ...at } = w as Worked & { pathEnergies?: number[] };
  return { ...at, path: [[...entry.xyz], ...(w.path ?? [])] };
}

/**
 * An entry's restraints once a minimisation has held them, saying where
 * they were first held (`start`): where they already say, as they say;
 * else where the entry stood as it came - so that a later minimisation,
 * asked to, starts again from there, as case F's rounds each start from the
 * geometry before the first (docs/WORKFLOWS-FOUNDATION.md, F15). Nothing
 * where it held none.
 */
function firstHeld(entry: SetEntry): Pick<SetEntry, "properties"> | Record<string, never> {
  const held = entry.properties?.restraints;
  if (held?.status !== "computed" || typeof held.value !== "object" || held.value === null || !("restraints" in held.value) || held.value.start) return {};
  return { properties: { ...anew(entry).properties, restraints: { ...held, value: { ...held.value, start: [...entry.xyz] } } } };
}

/** How far, in Å, a distance between two atoms may differ in what a single point printed back - its program's rounding - before an atom is taken to have moved. */
const SAME_PLACE = 1e-3;

/**
 * Whether two geometries of the same atoms are one shape - each distance
 * between two atoms within `SAME_PLACE` - however turned or moved as a
 * whole; and of one hand, not each other's mirror image (whose distances
 * are the same): the two, each about its centre, are turned one onto the
 * other, not reflected - their cross-covariance's determinant is not
 * negative. A flat geometry's mirror image is itself turned over.
 */
function sameShape(a: readonly number[], b: readonly number[]): boolean {
  const n = a.length / 3;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = (x: readonly number[]) => Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]);
      if (Math.abs(d(a) - d(b)) > SAME_PLACE) return false;
    }
  const centre = (x: readonly number[]) => [0, 1, 2].map((c) => x.reduce((s, v, k) => (k % 3 === c ? s + v : s), 0) / n);
  const [ca, cb] = [centre(a), centre(b)];
  const h = [0, 1, 2].map((r) => [0, 1, 2].map((c) => Array.from({ length: n }, (_, k) => (a[3 * k + r] - ca[r]) * (b[3 * k + c] - cb[c])).reduce((s, v) => s + v, 0)));
  const det = h[0][0] * (h[1][1] * h[2][2] - h[1][2] * h[2][1]) - h[0][1] * (h[1][0] * h[2][2] - h[1][2] * h[2][0]) + h[0][2] * (h[1][0] * h[2][1] - h[1][1] * h[2][0]);
  // (how large a determinant the geometry's own spread would give: a flat one's is next to none, of either sign)
  const spread = Array.from({ length: n }, (_, k) => [0, 1, 2].reduce((s, c) => s + (a[3 * k + c] - ca[c]) ** 2, 0)).reduce((s, v) => s + v, 0);
  return det >= -1e-6 * spread ** 3;
}

/**
 * A single point's entry (an *Energy* step's): its energy at the entry's
 * own geometry, kept as it came - its key with it - though its program
 * turned it to its own orientation or printed it rounded; and what the
 * entry carried of the calculation it came from (entries `CALC_CARRIED`:
 * a Frequencies step's thermochemistry, its vibrations), of that geometry
 * still, each with its own level: so an energy at one level and a
 * correction to G at another stand on one geometry, for *Add* to sum. A
 * program that moved an atom ran no single point: that entry fails.
 */
function singlePointWorked(entry: SetEntry, last: number[], energies: readonly number[] | undefined, calc: CalcInfo): Worked | Failure {
  if (!energies) return { kind: "failed", why: "It read back no energy" };
  if (!sameShape(entry.xyz, last)) return { kind: "failed", why: "Its atoms moved in what was to be a single point: its energy is of another geometry" };
  const was = anew(entry);
  const carried = { ...calcProperties(entry), ...Object.fromEntries(CALC_CARRIED.flatMap((k) => (entry.properties?.[k] ? [[k, entry.properties[k]]] : []))) };
  const properties = { ...was.properties, ...carried };
  return {
    ...was,
    ...keptAnew(entry, entry.xyz, calc?.charge),
    xyz: [...entry.xyz],
    energy: energies[energies.length - 1],
    calc,
    ...(Object.keys(properties).length ? { properties } : {}),
    // (where a run ended converged at it, that still: its geometry is the entry's own)
    ...(convergedOf(entry) ? { converged: entry.converged } : {}),
  };
}

/**
 * A reaction path, as its program followed it from the point given (docs/
 * WORKFLOWS.md, *Follow the reaction path*): one molecule, its frames the
 * path from one end to the other in the order its program gave them, each
 * with its energy, its entry the point it started from (the run's one
 * converged geometry), between them. A side that stopped before its end -
 * its program's iteration cap reached - leaves the path as far as it came,
 * out of *Failed*, its program's words on it: its end no minimum. The path
 * is one only at the level its start was found at - a saddle point at one
 * level is no stationary point at another - so the path's own level, as
 * its output says it, must be its start's: else it fails, naming both.
 */
function reactionPathWorked(entry: SetEntry, out: ReaderOutput, frames: number[][], energies: readonly number[] | undefined, calc: CalcInfo): Worked | Failure {
  const k = out.converged?.length === frames.length ? out.converged.indexOf(true) : -1;
  if (k < 0 || out.converged!.lastIndexOf(true) !== k) return { kind: "no-geometry", why: "It read back no one point the path started from" };
  if (!energies || frames.length < 3 || k === 0 || k === frames.length - 1) return { kind: "no-geometry", why: "It read back no path with energies, the point it started from between its ends" };
  if (!calc.method) return { kind: "failed", why: "It did not say the path's level: whether it is its start's cannot be told" };
  if (levelKey(calc) !== levelKey(entry.calc))
    return { kind: "failed", why: `The path is at ${levelSaid(calc)}, its start was found at ${levelSaid(entry.calc)}: run it at the start's level` };
  const stopped = out.optimised === false ? (out.warnings?.map((w) => w.text).join("; ") ?? "") || "A side stopped before its end" : null;
  return {
    ...anew(entry),
    ...keptAnew(entry, frames[k], calc.charge),
    xyz: [...frames[k]],
    energy: energies[k],
    path: frames.slice(0, k),
    pathEnergies: energies.slice(0, k),
    after: frames.slice(k + 1),
    afterEnergies: energies.slice(k + 1),
    calc,
    ...(stopped ? { failed: { kind: "not-converged" as const, why: stopped } } : {}),
  };
}

/** Kilocalories per mole in a hartree (Meno's units table). */
const KCAL_PER_HARTREE = factor("Eh", "kcal/mol");

/**
 * A path search's pair, as its program worked it out (docs/WORKFLOWS.md,
 * *Path search*): one molecule, its frames the path in the order the
 * program gave them - its images, and the highest point it refined where
 * it put it - each with its energy, its entry the point refined (the run's
 * one converged geometry). On that point, the barriers each way, worked
 * out by Meno from the energies printed: its own, less the first frame's
 * (`path.E-barrier`), and less the last frame's (`path.E-reverse-barrier`), in
 * kcal/mol, each saying so - electronic, at the path's level, which must be
 * its ends' (as they were optimised: pairs `unlike`), else that pair fails,
 * naming both. Meno calls none of it a saddle point: the chemist does, by
 * its frequencies, where they were worked out.
 */
function pathWorked(entry: SetEntry, out: ReaderOutput, frames: number[][], energies: readonly number[] | undefined, calc: CalcInfo): Worked | Failure {
  const k = out.converged?.length === frames.length ? out.converged.indexOf(true) : -1;
  if (k < 0 || out.converged!.lastIndexOf(true) !== k) return { kind: "no-geometry", why: "It read back no one point refined on its path" };
  if (!energies || frames.length < 3 || k === 0 || k === frames.length - 1) return { kind: "no-geometry", why: "It read back no path with energies, its point refined between its ends" };
  // (a barrier from its start is one only where its start is a minimum at the path's own level)
  if (!calc.method) return { kind: "failed", why: "It did not say the path's level: whether it is its ends' cannot be told" };
  if (levelKey(calc) !== levelKey(entry.calc))
    return { kind: "failed", why: `The path is at ${levelSaid(calc)}, its ends were optimised at ${levelSaid(entry.calc)}: optimise them at the path's level first` };
  const at = { geometry: geometryKey(frames[k]) };
  const by = (treatment: string): By => ({ ...(calc.program ? { program: calc.program } : {}), ...(calc.method ? { method: calc.method } : {}), treatment });
  const barrier = (e: number, treatment: string): Property => ({ value: (energies[k] - e) * KCAL_PER_HARTREE, unit: "kcal/mol", at, by: by(treatment), status: "computed" });
  const was = anew(entry);
  return {
    ...was,
    ...keptAnew(entry, frames[k], calc.charge),
    xyz: [...frames[k]],
    energy: energies[k],
    path: frames.slice(0, k),
    pathEnergies: energies.slice(0, k),
    after: frames.slice(k + 1),
    afterEnergies: energies.slice(k + 1),
    calc,
    // (the point it refined: where it ended converged)
    converged: convergedAt("highest point refined", frames[k]),
    properties: {
      ...was.properties,
      "path.E-barrier": barrier(energies[0], `electronic, at ${levelSaid(calc)}: the energy of the highest point refined, less that of the path's start (its first image)`),
      "path.E-reverse-barrier": barrier(energies[energies.length - 1], `electronic, at ${levelSaid(calc)}: the energy of the highest point refined, less that of the path's end (its last image)`),
      // (how its start and end were paired: in order is by place, never a match of which is which)
      ...(entry.paired ? { [PAIRED]: { value: entry.paired, unit: "none" as const, status: "computed" as const } } : {}),
    },
  };
}

/**
 * An entry's conformers, as a conformer search worked them out: each
 * geometry it gave a conformer of the entry's compound, numbered in order,
 * with its energy - and what the calculation was, kept with each, what it
 * found besides (its results) with the first alone: the conformers of one
 * compound are of one calculation (entries `unlikeMade`). They are the
 * compound's conformers as that search found them, whole, not a part of
 * another's (`partOf`); each linked to the structure drawn as `workedOf`
 * keeps it (`keptAnew`).
 */
export function conformersWorked(entry: SetEntry, out: ReaderOutput, readers: readonly string[], source?: CalcSource): Worked[] | Failure {
  const n = entry.atoms.length;
  if (out.atoms.length !== n || out.atoms.some((el, i) => el !== entry.atoms[i].el)) return { kind: "wrong-molecule", why: "What came back is not the molecule that went" };
  const frames = out.frames.filter((f) => f.length === 3 * n && f.every(Number.isFinite));
  if (!frames.length) return { kind: "no-geometry", why: "It found no conformer" };
  const energies = out.energies?.length === frames.length && out.energies.every(Number.isFinite) ? out.energies : undefined;
  // (the program's own populations, where it gives one for each - and each one's degeneracy, a whole number)
  const shares = out.populations?.length === frames.length && out.populations.every((p) => Number.isFinite(p) && p >= 0) ? out.populations : undefined;
  const degeneracies = out.degeneracies?.length === frames.length && out.degeneracies.every((d) => Number.isInteger(d) && d >= 1) ? out.degeneracies : undefined;
  const calc = calcOf(out, readers, source);
  // (a search of its own: all the conformers it found, whole - whatever the entry it began from was a part of)
  const { partOf: _part, ...from } = entry;
  return frames.map((f, k) => ({
    ...anewWithoutEnergy(from),
    // (each still linked to the structure drawn the entry was made from, where it is still that compound)
    ...keptAnew(entry, f, calc?.charge),
    number: k + 1,
    xyz: [...f],
    ...(energies ? { energy: energies[k] } : {}),
    ...(shares ? { share: shares[k] } : {}),
    ...(degeneracies ? { degeneracy: degeneracies[k] } : {}),
    calc: k === 0 ? calc : { ...calc, results: undefined },
  }));
}

/**
 * What a program step takes as its entries now, from the flow `d`: what
 * came into its one input (`jobEntries`) - or, for a kind of two inputs
 * whose program works on pairs (Path search), each start paired with an end
 * as its options say (workflow/pairs), those that cannot be worked out
 * refused, with why; or why nothing can be taken. None where nothing comes in.
 */
export function programEntries(d: Flow, step: number, kind: StepKind, options: OptionValues): { entries: SetEntry[]; holds: Holds3D; refused: { entry: number; why: string }[]; paired?: string } | { why: string } | null {
  const ports = inputsOf(kind);
  if (kind === "saddle-point") return guessesWithSides(d, step, options);
  if (kindInfo(kind).runs === "program" && ports.length === 2) {
    const [start, end] = ports.map((p) => inputOf(d, step, p.id));
    if (!start || start.holds === "structures") return null;
    if (!end || end.holds === "structures") return { why: `Nothing comes into ${ports[1].name}` };
    // (each with each, at most as many pairs as the step says)
    const paired = pairEntries(
      setEntries(start.molecules, start.holds),
      setEntries(end.molecules, end.holds),
      options.pairs === "each" || options.pairs === "property" ? options.pairs : "order",
      String(options.property ?? ""),
      PATH_PAIR,
      mostOf(options),
    );
    // (two conformer sets paired in order: by place alone - said on the step's line, so that it is never taken for a match)
    const byPlace = (options.pairs ?? "order") === "order" && (start.holds === "conformers" || end.holds === "conformers");
    return "why" in paired ? paired : { ...paired, holds: "molecules", ...(byPlace ? { paired: "paired in order, by place" } : {}) };
  }
  const input = inputOf(d, step);
  if (!input || input.holds === "structures") return null;
  return { entries: jobEntries(kind, setEntries(input.molecules, input.holds), input.holds), holds: input.holds, refused: [] };
}

/**
 * The guesses an *Optimise to a saddle point* step takes: each that came
 * in - or, where its sides are wired, both of them, each guess paired with
 * a reactant side and a product side as its *Pairs* option says (pairs
 * `pairEntries`), one guess for each such three; a guess paired with none,
 * or with a side of other atoms, another numbering, charge or spin, kept
 * and refused with why. One side wired without the other: none of it runs.
 */
function guessesWithSides(d: Flow, step: number, options: OptionValues): { entries: SetEntry[]; holds: Holds3D; refused: { entry: number; why: string }[] } | { why: string } | null {
  const [guesses, reactant, product] = ["guesses", "reactant", "product"].map((port) => inputOf(d, step, port));
  if (!guesses || guesses.holds === "structures") return null;
  const taken = setEntries(guesses.molecules, guesses.holds);
  if (!reactant && !product) return { entries: taken, holds: "molecules", refused: [] };
  if (!reactant || !product) return { why: `${reactant ? "Reactant side" : "Product side"} is wired: wire ${reactant ? "Product side" : "Reactant side"} too, or neither` };
  if (reactant.holds === "structures" || product.holds === "structures") return { why: "Its sides must be molecules in 3D" };
  const pairing = options.pairs === "each" || options.pairs === "property" ? options.pairs : "order";
  const property = String(options.property ?? "");
  const as = (second: string, other: string): PairAs => ({ first: "Guesses", second, one: "guess", other, unlike: sideUnlike(other) });
  const [reactants, products] = [reactant, product].map((x) => setEntries(x.molecules, x.holds as "molecules" | "conformers"));
  // (its sides paired each with each as many as they make: At most is Path search's alone)
  const r = matchesOf(taken, reactants, pairing, property, as("Reactant side", "reactant side"), Infinity);
  if (!("ends" in r)) return r;
  const p = matchesOf(taken, products, pairing, property, as("Product side", "product side"), Infinity);
  if (!("ends" in p)) return p;
  // (each guess with each reactant side and each product side it is paired with - one of each, but each with each)
  const entries: SetEntry[] = [];
  const refused: { entry: number; why: string }[] = [];
  taken.forEach((guess, k) => {
    const none = r.why[k] ?? p.why[k] ?? (!r.ends[k].length ? "it is paired with no reactant side" : !p.ends[k].length ? "it is paired with no product side" : undefined);
    if (none) {
      refused.push({ entry: entries.length, why: none });
      entries.push({ ...guess });
      return;
    }
    for (const i of r.ends[k])
      for (const j of p.ends[k]) {
        const why = sideUnlike("reactant side")(guess, reactants[i]) ?? sideUnlike("product side")(guess, products[j]);
        if (why) refused.push({ entry: entries.length, why });
        entries.push({ ...guess, sides: { reactant: reactants[i], product: products[j] } });
      }
  });
  return { entries, holds: "molecules", refused };
}

/** The entries a step's jobs are prepared for: each that came in - but a conformer search on a conformer set searches each compound once, from its first conformer. */
export function jobEntries(kind: StepKind, entries: readonly SetEntry[], holds: string): SetEntry[] {
  if (kind !== "conformers" || holds !== "conformers") return [...entries];
  const seen = new Set<number>();
  return entries.filter((e) => !seen.has(e.compound) && !!seen.add(e.compound));
}

/**
 * What a plugin's step on structures drawn said of one of them (`run`,
 * docs/PLUGINS.md, *Steps on structures drawn*): kept as drawn; made anew,
 * as drawings - a MOL block each, its stereoisomers, say, and each one's
 * own SMILES beside, where given - each with values it worked out, where
 * it did; or set aside, why and what kind of reason it is.
 */
export type DrawnAnswer =
  | { as: "drawn"; properties?: Record<string, DrawnValue> }
  | { made: string[]; smiles?: string[]; properties?: Record<string, DrawnValue> }
  | { aside: string; kind: string };
/** A value a step worked out of a structure drawn, as its plugin says it: a number, a text or true/false, its unit from Meno's units table or "none", and how it was worked out. */
export type DrawnValue = { value: number | string | boolean; unit: Unit | "none"; method?: string };

/** The most structures a step on structures drawn makes of one. */
export const MADE_OF_ONE = 64;

/** What a plugin's step on structures drawn said of each of `count`, in their order; why not, where it said nothing Meno can take - nothing taken in part. */
export function readDrawnAnswers(raw: unknown, count: number): DrawnAnswer[] | string {
  const list = (raw as { structures?: unknown } | null)?.structures;
  if (!Array.isArray(list) || list.length !== count) return "It said nothing Meno can take";
  const out: DrawnAnswer[] = [];
  // (the values a structure was given, each its value, a unit Meno knows and how; none, where none was given; null where any is not one)
  const valuesIn = (given: unknown): Record<string, DrawnValue> | undefined | null => {
    if (given == null) return undefined;
    if (typeof given !== "object" || Array.isArray(given)) return null;
    const properties: Record<string, DrawnValue> = {};
    for (const [name, p] of Object.entries(given as Record<string, { value?: unknown; unit?: unknown; method?: unknown }>)) {
      const v = p?.value;
      const value = typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" || typeof v === "boolean" ? v : null;
      const unit = p?.unit === "none" || (typeof p?.unit === "string" && isUnit(p.unit)) ? (p.unit as Unit | "none") : null;
      if (value == null || unit == null || !name.trim()) return null;
      properties[name] = { value, unit, ...(typeof p.method === "string" && p.method.trim() ? { method: p.method.trim().slice(0, 200) } : {}) };
    }
    return properties;
  };
  for (const a of list as { as?: unknown; made?: unknown; aside?: unknown; kind?: unknown; properties?: unknown }[]) {
    if (a?.as === "drawn") {
      const properties = valuesIn(a.properties);
      if (properties === null) return "It said nothing Meno can take";
      out.push(properties ? { as: "drawn", properties } : { as: "drawn" });
    }
    else if (Array.isArray(a?.made) && a.made.length && a.made.length <= MADE_OF_ONE && a.made.every((b) => typeof b === "string" && b.length)) {
      // (each one's own SMILES, where given one for each: else none; and what was worked out, of each alike)
      const smiles = (a as { smiles?: unknown }).smiles;
      const named = Array.isArray(smiles) && smiles.length === a.made.length && smiles.every((x) => typeof x === "string" && x.length && x.length <= 2000);
      const properties = valuesIn(a.properties);
      if (properties === null) return "It said nothing Meno can take";
      out.push({ made: a.made as string[], ...(named ? { smiles: smiles as string[] } : {}), ...(properties ? { properties } : {}) });
    }
    else if (typeof a?.aside === "string" && a.aside.trim()) out.push({ aside: a.aside.trim().slice(0, 200), kind: typeof a.kind === "string" && a.kind.trim() ? a.kind.trim().slice(0, 40) : "other" });
    else return "It said nothing Meno can take";
  }
  return out;
}

/**
 * What a step on structures drawn says it did: how many it kept of how
 * many, or - where it made any anew - how many came in and went out, and
 * how many it made of how many; and how many it set aside, by kind,
 * the most first: *40 in · 52 out · 14 made from 2 · 3 set aside (2:
 * stereo open; 1: too many)*.
 */
export function drawnSaid(answers: readonly DrawnAnswer[]): string {
  const n = answers.length;
  const made = answers.filter((a): a is { made: string[] } => "made" in a);
  const madeCount = made.reduce((k, a) => k + a.made.length, 0);
  const kept = answers.filter((a) => "as" in a).length + madeCount;
  const kinds = new Map<string, number>();
  for (const a of answers) if ("aside" in a) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
  const aside = n - answers.filter((a) => !("aside" in a)).length;
  const head = made.length ? `${n} in \u00b7 ${kept} out \u00b7 ${madeCount} made from ${made.length}` : `${kept} of ${n} kept`;
  const why = [...kinds].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c}: ${k}`).join("; ");
  return aside ? `${head} \u00b7 ${aside} set aside (${why})` : head;
}

/** What a plugin did at once (`run`): the entries it kept, by their place among those it was given; why not, where it said nothing it can be taken at. */
export function readKept(raw: unknown, count: number): number[] | string {
  const kept = (raw as { kept?: unknown } | null)?.kept;
  if (!Array.isArray(kept) || !kept.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return "It said nothing Meno can take";
  return [...new Set(kept as number[])].sort((a, b) => a - b);
}

/** How many SMILES not read a step's line names, the rest counted. */
export const NOT_READ_NAMED = 5;

/** Why a SMILES could not be read, from what the roles' `from_smiles` said: its words after "could not be read", else none known. */
export function unreadWhy(said: string): string {
  const m = /could not be read: (.+?)\.?$/.exec(said.trim());
  return m ? m[1] : "not read";
}

/**
 * The SMILES a step could not read, as its line says them: how many, and the
 * first few (`NOT_READ_NAMED`) each with why - long ones cut short - the rest
 * counted: *2 not read: C1CC (a ring left open), Xx (no element Xx)*.
 */
export function notReadSaid(notRead: readonly { smiles: string; why: string }[]): string {
  const cut = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}\u2026` : s);
  const named = notRead.slice(0, NOT_READ_NAMED).map((x) => `${cut(x.smiles)} (${x.why})`);
  const more = notRead.length - named.length;
  return `${notRead.length} not read: ${named.join(", ")}${more ? `, and ${more} more` : ""}`;
}

/** The most a step that makes them (Generate) brings in from one run. */
export const GENERATED_MOST = 1000;

/**
 * One structure a generative model made, as its plugin hands it on
 * (docs/PLUGINS.md, *Generate*): the SMILES it gave, exactly; its own
 * values, named, each a number, a text or true/false with its unit from
 * Meno's units table or "none"; and, where it was made from one of the
 * structures that came in, that one's place among them (`seed`).
 */
export type Generated = { smiles: string; properties: Record<string, { value: number | string | boolean; unit: Unit | "none" }>; seed?: number };

/**
 * What a plugin's Generate gave (`run`): each structure as `Generated`; what
 * made them all (`by`: the program, its version, the model, how); and what
 * the plugin says of the run (`said`). Why not, where any of it is not what
 * Meno takes - nothing taken in part. A SMILES is not read here: Meno reads
 * each itself, as one pasted, and counts those it cannot read.
 */
export function readGenerated(raw: unknown, seeds = 0): { made: Generated[]; by: By; said: string; seeds?: SeedTally[] } | string {
  const r = raw as { outputs?: unknown; said?: unknown; by?: unknown } | null;
  if (!Array.isArray(r?.outputs)) return "It said nothing Meno can take";
  if (r.outputs.length > GENERATED_MOST) return `It made more than ${GENERATED_MOST}`;
  const made: Generated[] = [];
  for (const [i, x] of (r.outputs as { smiles?: unknown; properties?: unknown; seed?: unknown }[]).entries()) {
    if (typeof x?.smiles !== "string" || !x.smiles.trim() || x.smiles.length > 2000) return `Structure ${i + 1} has no SMILES Meno can take`;
    const properties: Generated["properties"] = {};
    if (x.properties != null && (typeof x.properties !== "object" || Array.isArray(x.properties))) return `Structure ${i + 1}'s values are not named`;
    for (const [name, p] of Object.entries((x.properties ?? {}) as Record<string, { value?: unknown; unit?: unknown }>)) {
      // (a value the model gave none of - an NLL that was no number, written as none: the plugin counts it - is not kept)
      if (p?.value === null) continue;
      const v = p?.value;
      const value = typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" || typeof v === "boolean" ? v : null;
      const unit = p?.unit === "none" || (typeof p?.unit === "string" && isUnit(p.unit)) ? (p.unit as Unit | "none") : null;
      if (value == null || unit == null || !name.trim()) return `Structure ${i + 1}'s ${name || "value"} is not one Meno can take`;
      properties[name] = { value, unit };
    }
    if (x.seed != null && !(Number.isInteger(x.seed) && (x.seed as number) >= 0 && (x.seed as number) < seeds)) return `Structure ${i + 1} names a seed that did not come in`;
    made.push({ smiles: x.smiles.trim(), properties, ...(x.seed != null ? { seed: x.seed as number } : {}) });
  }
  const given = (r.by ?? {}) as Record<string, unknown>;
  const by: By = Object.fromEntries(["program", "version", "model", "method"].flatMap((k) => (typeof given[k] === "string" && (given[k] as string).trim() ? [[k, (given[k] as string).trim().slice(0, 300)]] : [])));
  const tally = seedTally((r as { seeds?: unknown }).seeds, seeds);
  if (typeof tally === "string") return tally;
  return { made, by, said: typeof r.said === "string" && r.said.trim() ? r.said.trim().slice(0, 300) : `${made.length} made`, ...(tally ? { seeds: tally } : {}) };
}

/** What a generator made of each seed, by its place: how many, or why it could not read it. */
export type SeedTally = { place: number; made: number } | { place: number; why: string };

/** A generator's tally of its seeds (`seeds`), one for each that came in, in their order: none where it gave none; why not, where it is not that. */
function seedTally(v: unknown, seeds: number): SeedTally[] | undefined | string {
  if (v == null) return undefined;
  if (!Array.isArray(v) || v.length !== seeds) return "Its seeds are not told one by one";
  const out: SeedTally[] = [];
  for (const [i, s] of (v as { place?: unknown; made?: unknown; why?: unknown }[]).entries()) {
    if (s?.place !== i) return "Its seeds are not told one by one";
    if (Number.isInteger(s.made) && (s.made as number) >= 0) out.push({ place: i, made: s.made as number });
    else if (typeof s.why === "string" && s.why.trim()) out.push({ place: i, why: s.why.trim().slice(0, 120) });
    else return `Seed ${i + 1} is told neither made nor why not`;
  }
  return out;
}

/** The seeds Meno names on a step's line - those it made none of, and those not read, each with why - at most this many of each. */
export const SEEDS_NAMED = 5;

/**
 * The seeds a generator made nothing of, named on its step's line by their
 * numbers, from its tally - never from what it said, which is cut short:
 * *seeds 2 and 5 made none; seed 3 not read: a part RDKit cannot read* -
 * at most `most` of each, the rest counted (every one, `Infinity`).
 * Nothing, where each made some.
 */
export function seedsSaid(tally: readonly SeedTally[], most = SEEDS_NAMED): string {
  const list = (ns: number[]) => {
    const shown = ns.slice(0, most).map((n) => String(n + 1));
    const more = ns.length - shown.length;
    const words = more ? [...shown, `${more} more`] : shown;
    return `seed${ns.length === 1 ? "" : "s"} ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]}`;
  };
  const none = tally.filter((s) => "made" in s && s.made === 0).map((s) => s.place);
  const unread = tally.filter((s): s is { place: number; why: string } => "why" in s);
  const whys = [...new Set(unread.map((s) => s.why))];
  return [
    ...(none.length ? [`${list(none)} made none`] : []),
    ...whys.map((why) => `${list(unread.filter((s) => s.why === why).map((s) => s.place))} not read: ${why}`),
  ].join("; ");
}

/** What a step says of a program installed separately that is found nowhere: where to say where it is. */
export const notFound = (label: string) => `${label} is not found: locate it in Settings, Plugins`;

/** How long, as a clock says it: 0:42, 12:03, 1:02:03. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** An energy in hartrees as a card says it, as everywhere Meno writes one: −42.108710 Eh. */
export const hartrees = (e: number) => valueText(e, { quantity: "energy" });

/** What a step that ran jobs says it did: how long, and the number it is for - its entry's energy, said to be its electronic energy (E), or how many came out of how many. */
export function doneSaid(worked: readonly Worked[], total: number, took: number): string {
  if (total === 1 && worked.length === 1 && worked[0].energy != null) return `${clock(took)} · E ${hartrees(worked[0].energy)}`;
  return `${clock(took)} · ${worked.length} of ${total}`;
}

/** Whether what a job gave for an entry is why it failed, not what it made. */
export const isFailure = (x: unknown): x is Failure =>
  typeof (x as Failure)?.why === "string" && typeof (x as Failure)?.kind === "string" && !("xyz" in (x as object)) && !("atoms" in (x as object));
