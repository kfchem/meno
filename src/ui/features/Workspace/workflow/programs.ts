/**
 * Steps a plugin's program does (docs/WORKFLOWS.md, *What changes in the
 * contract*): what the plugin is given of each entry, its jobs as it
 * prepares them, what a job gave as it reads it back, and what the step
 * says it did. Plain data, checked on the way in, whoever sent it; the
 * runs themselves are the store's (store/slices/workflowSlice).
 */
import { valueText } from "../../../../lib/calc/results";
import { speciesOf, type WrittenMolecule } from "../../../../lib/io/writers";
import { ENTRY_SCHEMA } from "../../../../lib/entry";
import { isotopeMass } from "../../../../lib/chem/isotopes";
import { calcOf, OUTPUT_SCHEMA, type CalcSource, type ReaderOutput } from "../../../../lib/calc/output";
import type { JobFile } from "../../../../lib/jobs";
import type { SetEntry } from "./entries";
import type { Worked } from "./run";
import type { StepKind } from "./kinds";

/**
 * An entry as a plugin is given it: Meno's plain data - its atoms, each its
 * element, place in ångströms, charge and radical; its bonds by index with
 * their orders; its name - and its charge and spin multiplicity, as Export
 * reads them (lib/io/writers `speciesOf`).
 */
/** An entry as a plugin is given it: the entry's version (lib/entry `ENTRY_SCHEMA`); its molecule - each isotope's mass with it, in daltons, where Meno knows it - its charge and multiplicity, and its files (docs/PLUGINS.md, *The entry a plugin is given*). */
export type PluginEntry = Omit<WrittenMolecule, "atoms"> & { schema: number; atoms: (WrittenMolecule["atoms"][number] & { mass?: number })[]; charge: number; multiplicity: number; files?: EntryFile[] };

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
    bonds: e.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
  };
  // (an isotope's mass with it, where NIST gives a measured one: what a program's input takes - ORCA's "M =")
  const atoms = molecule.atoms.map((a) => {
    const mass = a.isotope ? isotopeMass(a.el, a.isotope) : undefined;
    return mass != null ? { ...a, mass } : a;
  });
  // (a molecule read from a calculation: the state it was in there; else what its atoms say - Meno's one rule)
  const { charge, multiplicity } = speciesOf(molecule, e);
  return { schema: ENTRY_SCHEMA, ...molecule, atoms, charge, multiplicity };
}

/**
 * A job as a plugin prepares it: the entries it is for, by their place; its
 * program, by name; its arguments; its input files, and the one of them its
 * program reads as its input, where it reads one (Gaussian's, run as
 * `g16 <input`); the programs installed beside its own run after it, each
 * by its name and with its arguments (ORCA's orca_2mkl: its manifest's
 * `installed[].beside`); and the files it reads back.
 */
export type Prepared = { entries: number[]; program: string; args: string[]; files: JobFile[]; stdin?: string; then?: Then[]; reads: string[] };

/** A program installed beside a job's own, run after it: by its name there, with its arguments. */
export type Then = { program: string; args: string[] };

const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

/** A file's name in a job's folder: inside it, never above it. */
const inside = (name: string) => !!name && name.length <= 200 && !name.startsWith("/") && !/^[A-Za-z]:/.test(name) && name.split(/[\\/]/).every((p) => p && p !== "." && p !== "..");
const KIND_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const texts = (v: unknown, most: number) => (Array.isArray(v) && v.length <= most && v.every((t) => typeof t === "string") ? (v as string[]) : null);

/**
 * The jobs a plugin prepared for `count` entries, checked: each its entries
 * among those, every entry in one; its program a name; its files inside its
 * folder. Why not, where they are not.
 */
export function readPrepared(raw: unknown, count: number): Prepared[] | string {
  const jobs = (raw as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs) || !jobs.length) return "It prepared no job";
  const out: Prepared[] = [];
  const covered = new Set<number>();
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
    if (!entries?.length || !program || !args || !reads || reads.some((n) => !inside(n)) || files.length !== (r?.files as unknown[]).length || !given || then.some((t) => !t))
      return "It prepared a job Meno cannot run";
    entries.forEach((i) => covered.add(i));
    out.push({
      entries: [...entries],
      program,
      args: [...args],
      files,
      ...(typeof stdin === "string" ? { stdin } : {}),
      ...(then.length ? { then: then as Then[] } : {}),
      reads: [...reads],
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

/**
 * What a plugin read back of a job: an output for each of its entries, in
 * Meno's own form - or, for each, an output for Meno's readers to read
 * (ORCA's, Gaussian's: a program installed separately), or surfaces in
 * files Meno reads itself (`ToSurfaces`); or why the job did not give one.
 */
export function readCollected(raw: unknown, count: number): ReaderOutput[] | { read: ToRead[] } | { surfaces: ToSurfaces[] } | { why: string } {
  const r = raw as { outputs?: unknown; read?: unknown; surfaces?: unknown; why?: unknown } | null;
  if (typeof r?.why === "string") return { why: r.why.trim().slice(0, 300) || "It did not say why" };
  if (r?.surfaces !== undefined) {
    if (!Array.isArray(r.surfaces) || r.surfaces.length !== count) return { why: "It read back nothing for it" };
    const surfaces = r.surfaces.map(surfacesOf);
    return surfaces.every((s): s is ToSurfaces => s != null) ? { surfaces } : { why: "It said to read what Meno cannot" };
  }
  if (r?.read !== undefined) {
    if (!Array.isArray(r.read) || r.read.length !== count) return { why: "It read back nothing for it" };
    const read: ToRead[] = [];
    for (const x of r.read as Record<string, unknown>[]) {
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
  if (!Array.isArray(r?.outputs) || r.outputs.length !== count) return { why: "It read back nothing for it" };
  const outs = r.outputs as ReaderOutput[];
  for (const o of outs) {
    if (o?.schema != null && o.schema !== OUTPUT_SCHEMA) return { why: "It read it back in a form this Meno does not read" };
    if (!Array.isArray(o?.atoms) || !Array.isArray(o.frames) || !o.frames.some((f) => Array.isArray(f) && f.length === 3 * o.atoms.length)) return { why: "It read back no geometry" };
    // (every frame a list: one it could not read, given as null, is not taken)
    if (!o.frames.every(Array.isArray)) return { why: "It read back a geometry Meno cannot read" };
  }
  return outs;
}

/**
 * An entry as a program works it out anew: what went in, without the
 * calculation it came with or what its molecule kept - how it was made,
 * what its energies were from - none of which is so of what the program
 * gives back (entries `SetEntry.calc`, `keep`).
 */
const anew = ({ calc: _calc, keep: _keep, ...entry }: SetEntry): SetEntry => entry;

/**
 * An entry as a job worked it out (lib/calc/output): its last geometry and
 * energy - an optimisation's path before it, kept where the step is
 * *Optimise* - and what the calculation says of it, read by `readers` from
 * the output kept as `source`. Why not, where what came back is not the
 * molecule that went.
 */
export function workedOf(kind: StepKind, entry: SetEntry, out: ReaderOutput, readers: readonly string[], source?: CalcSource): Worked | string {
  const n = entry.atoms.length;
  if (out.atoms.length !== n || out.atoms.some((el, i) => el !== entry.atoms[i].el)) return "What came back is not the molecule that went";
  const frames = out.frames.filter((f) => f.length === 3 * n && f.every(Number.isFinite));
  if (!frames.length) return "It read back no geometry";
  const energies = out.energies?.length === frames.length && out.energies.every(Number.isFinite) ? out.energies : undefined;
  const last = frames[frames.length - 1];
  const path = kind === "optimise" && frames.length > 1 ? frames.slice(0, -1) : undefined;
  const calc = calcOf(out, readers, source);
  return {
    ...anew(entry),
    xyz: [...last],
    ...(energies ? { energy: energies[energies.length - 1] } : {}),
    ...(path ? { path, ...(energies ? { pathEnergies: energies.slice(0, -1) } : {}) } : {}),
    calc,
  };
}

/**
 * An entry's conformers, as a conformer search worked them out: each
 * geometry it gave a conformer of the entry's compound, numbered in order,
 * with its energy - what the calculation was kept with the first.
 */
export function conformersWorked(entry: SetEntry, out: ReaderOutput, readers: readonly string[], source?: CalcSource): Worked[] | string {
  const n = entry.atoms.length;
  if (out.atoms.length !== n || out.atoms.some((el, i) => el !== entry.atoms[i].el)) return "What came back is not the molecule that went";
  const frames = out.frames.filter((f) => f.length === 3 * n && f.every(Number.isFinite));
  if (!frames.length) return "It found no conformer";
  const energies = out.energies?.length === frames.length && out.energies.every(Number.isFinite) ? out.energies : undefined;
  // (the program's own populations, where it gives one for each - and each one's degeneracy, a whole number)
  const shares = out.populations?.length === frames.length && out.populations.every((p) => Number.isFinite(p) && p >= 0) ? out.populations : undefined;
  const degeneracies = out.degeneracies?.length === frames.length && out.degeneracies.every((d) => Number.isInteger(d) && d >= 1) ? out.degeneracies : undefined;
  const calc = calcOf(out, readers, source);
  return frames.map((f, k) => ({
    ...anew(entry),
    number: k + 1,
    xyz: [...f],
    ...(energies ? { energy: energies[k] } : {}),
    ...(shares ? { share: shares[k] } : {}),
    ...(degeneracies ? { degeneracy: degeneracies[k] } : {}),
    ...(k === 0 ? { calc } : {}),
  }));
}

/** The entries a step's jobs are prepared for: each that came in - but a conformer search on a conformer set searches each compound once, from its first conformer. */
export function jobEntries(kind: StepKind, entries: readonly SetEntry[], holds: string): SetEntry[] {
  if (kind !== "conformers" || holds !== "conformers") return [...entries];
  const seen = new Set<number>();
  return entries.filter((e) => !seen.has(e.compound) && !!seen.add(e.compound));
}

/** What a plugin did at once (`run`): the entries it kept, by their place among those it was given; why not, where it said nothing it can be taken at. */
export function readKept(raw: unknown, count: number): number[] | string {
  const kept = (raw as { kept?: unknown } | null)?.kept;
  if (!Array.isArray(kept) || !kept.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return "It said nothing Meno can take";
  return [...new Set(kept as number[])].sort((a, b) => a - b);
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
