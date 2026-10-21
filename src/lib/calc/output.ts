/**
 * What a reader plugin hands back from a calculation's output, and what a
 * molecule keeps of it (docs/WORKSPACE.md, stage 3). Plain data, the same
 * whichever reader read it and whatever program wrote it: what Meno does
 * something with in forms of its own - the atoms, their geometries, each
 * one's energy, what the calculation was - and everything else as results,
 * in the one general form (results.ts).
 */
import { readResults, type Result } from "./results";
import { readerIdOfLine } from "./catalog";
import type { StructureRead } from "../io/structures";

/** The form of a plugin's answer this Meno reads. */
export const OUTPUT_SCHEMA = 1;

/** A reader's answer, as its worker writes it (resources/plugins/<id>/worker.py). */
export type ReaderOutput = {
  /** The form it is in: `OUTPUT_SCHEMA`, or unsaid. */
  schema?: number;
  program?: string | null;
  version?: string | null;
  method?: string | null;
  basis?: string | null;
  /**
   * The solvation it was worked out in, as the output says it: the model,
   * the solvent and anything else that changes its energies, in the
   * program's own words - "ALPB(water), reference state gsolv [1 M
   * gas/solution]"; "none" where the output says it used none; unsaid where
   * it does not say (docs/PLUGINS.md, *The contract*).
   */
  solvation?: string | null;
  charge?: number | null;
  multiplicity?: number | null;
  /** Its atoms' elements, in the file's order. */
  atoms: string[];
  /** Each geometry it went through - an optimisation's steps - in ångströms: x, y, z of every atom. */
  frames: number[][];
  /** Each geometry's energy, in hartrees, where every one has one. */
  energies?: number[] | null;
  /**
   * Each geometry's population - its share of its compound, the program's
   * own Boltzmann weight, adding up to one - where the program works them
   * out: a conformer search's (CREST counts each conformer's rotamers in).
   */
  populations?: number[] | null;
  /**
   * Each geometry's degeneracy - how many forms of it the program found
   * alike, its rotamers (CREST's) - where it says: what Meno's own
   * Boltzmann weights count in too, as the program's populations do.
   */
  degeneracies?: number[] | null;
  /** Whether an optimisation came to an end, where it was one. */
  optimised?: boolean | null;
  /** Everything else it found, in the general form (results.ts) - read, and those that do not read as results left out. */
  results?: unknown[];
  /** What a structure's file holds - its drawing, and its molecules in 3D - where the reader read one (lib/io/structures); checked as the page takes it. */
  structures?: StructureRead;
  /** Of a file that holds several jobs one after another - Gaussian's Link1, ORCA's $new_job - which this is, and what it did. */
  job?: Job | null;
  /**
   * The jobs of a file that holds several, in order, each an output of its
   * own, said by `job`: each opens as a molecule of its own, its geometries,
   * energies and populations its own. The output's own fields are then its
   * last job's.
   */
  jobs?: ReaderOutput[] | null;
};

/** A job's place among those its file holds, from 1, and what it did, in words: "Optimisation", "Single point". */
export type Job = { number: number; of: number; kind?: string | null };

/**
 * What a molecule keeps of the calculation it was read from, besides its
 * geometries and energies: what the calculation was, the readers that read
 * it, and its results - every reader's, each kept with the one it came from.
 */
export type CalcInfo = {
  /** The readers that read it, each its id and version: "cclib 1.9rc1"; Meno's own, "meno". */
  readers: string[];
  program?: string;
  version?: string;
  method?: string;
  basis?: string;
  /** The solvation, as the output says it (`ReaderOutput.solvation`): "none" where it says none, unset where it does not say. */
  solvation?: string;
  charge?: number;
  multiplicity?: number;
  optimised?: boolean;
  results?: Result[];
  /** Of an output that holds several jobs, the job it is: its place among them, and what it did. */
  job?: { number: number; of: number; kind?: string };
  /** The output it was read from: its name, kind and SHA-256, and where it was - what a promise is asked for again from (./asks). */
  source?: CalcSource;
  /**
   * The wavefunction the calculation wrote besides, kept with it - a Molden
   * file, a WFX - its name, kind and SHA-256: given to a step that takes
   * one (a step's `files`: Multiwfn's NCI), as the output is.
   */
  wavefunction?: CalcSource;
  /** The readers chosen to read it as well that could not, each by id, and why (lib/calc/read). */
  unread?: { from: string; why: string }[];
};

/**
 * An output as a molecule keeps it: its name, its kind (lib/io/kinds), its
 * SHA-256, and where it was when it was opened, where Open said - so that a
 * workspace opened later can find it again there, unchanged (./asks).
 */
export type CalcSource = { name: string; sha256: string; kind?: string; path?: string };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** A job as an output or a file says it: its place among as many as its file holds, and what it did; otherwise none. */
export function jobOf(v: unknown): CalcInfo["job"] | undefined {
  const j = v as { number?: unknown; of?: unknown; kind?: unknown } | null | undefined;
  if (!j || !Number.isInteger(j.number) || !Number.isInteger(j.of)) return undefined;
  const number = j.number as number;
  const of = j.of as number;
  if (number < 1 || of < 2 || number > of) return undefined;
  const kind = text(j.kind)?.slice(0, 60);
  return { number, of, ...(kind ? { kind } : {}) };
}

/** The geometries an output gives for its atoms: those of as many numbers as its atoms have coordinates. */
export function framesOf(out: ReaderOutput): number {
  return out.frames.filter((f) => f.length === 3 * out.atoms.length).length;
}

/**
 * What a molecule keeps of an output, read by `readers` (each its name and
 * version): its results each kept with the reader it came from - the first,
 * unless it says another.
 */
export function calcOf(out: ReaderOutput, readers: readonly string[], source?: CalcSource, unread?: CalcInfo["unread"]): CalcInfo {
  const results = readResults(out.results, out.atoms.length, framesOf(out), readers[0] ? readerIdOfLine(readers[0]) : undefined);
  const said = (k: "program" | "version" | "method" | "basis" | "solvation") => text(out[k]);
  return {
    readers: [...readers],
    ...(said("program") ? { program: said("program") } : {}),
    ...(said("version") ? { version: said("version") } : {}),
    ...(said("method") ? { method: said("method") } : {}),
    ...(said("basis") ? { basis: said("basis") } : {}),
    ...(said("solvation") ? { solvation: said("solvation") } : {}),
    ...(Number.isInteger(out.charge) ? { charge: out.charge! } : {}),
    ...(Number.isInteger(out.multiplicity) && out.multiplicity! > 0 ? { multiplicity: out.multiplicity! } : {}),
    ...(typeof out.optimised === "boolean" ? { optimised: out.optimised } : {}),
    ...(results.length ? { results } : {}),
    ...(jobOf(out.job) ? { job: jobOf(out.job) } : {}),
    ...(source
      ? { source: { name: source.name, sha256: source.sha256, ...(source.kind ? { kind: source.kind } : {}), ...(source.path ? { path: source.path } : {}) } }
      : {}),
    ...(unread?.length ? { unread: unread.map((u) => ({ from: u.from, why: u.why })) } : {}),
  };
}

/** An output's name, kind, SHA-256 and place as a file carries them; otherwise none. */
function sourceOf(v: unknown): CalcSource | undefined {
  const s = v as Record<string, unknown> | null | undefined;
  if (!s || typeof s.name !== "string" || typeof s.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(s.sha256)) return undefined;
  const kind = typeof s.kind === "string" && /^[a-z0-9-]{1,40}$/.test(s.kind) ? s.kind : undefined;
  // (a place is only ever looked at: read where Meno may read it, and taken only where its SHA-256 matches)
  const path = typeof s.path === "string" && s.path.length <= 4096 && !s.path.includes("\0") ? s.path : undefined;
  return { name: s.name.slice(0, 260), sha256: s.sha256, ...(kind ? { kind } : {}), ...(path ? { path } : {}) };
}

/**
 * A molecule's calculation as a file carries it, where it reads as one for
 * `atoms` atoms in `frames` frames; otherwise nothing. Its results are read
 * as a plugin's are, and those that are no longer this molecule's left out.
 */
export function readCalc(given: unknown, atoms: number, frames: number): CalcInfo | undefined {
  const c = given as Record<string, unknown> | null | undefined;
  const readers = Array.isArray(c?.readers) ? c.readers.filter((r): r is string => typeof r === "string" && !!r.trim()) : [];
  if (!c || typeof c !== "object" || !readers.length) return undefined;
  const results = Array.isArray(c.results) ? c.results : [];
  const unread = Array.isArray(c.unread)
    ? c.unread.flatMap((u: unknown) => {
        const v = u as { from?: unknown; why?: unknown } | null;
        return typeof v?.from === "string" && typeof v.why === "string" ? [{ from: v.from, why: v.why.slice(0, 500) }] : [];
      })
    : [];
  const calc = calcOf(
    {
      program: text(c.program),
      version: text(c.version),
      method: text(c.method),
      basis: text(c.basis),
      solvation: text(c.solvation),
      charge: isNum(c.charge) ? c.charge : null,
      multiplicity: isNum(c.multiplicity) ? c.multiplicity : null,
      optimised: typeof c.optimised === "boolean" ? c.optimised : null,
      job: jobOf(c.job),
      atoms: new Array(atoms).fill(""),
      frames: new Array(frames).fill(new Array(3 * atoms).fill(0)),
      results,
    },
    readers,
    sourceOf(c.source),
    unread,
  );
  // (its wavefunction, kept by Meno: never found where it was, so no place)
  const wavefunction = sourceOf(c.wavefunction);
  if (!wavefunction) return calc;
  const { path: _, ...kept } = wavefunction;
  return { ...calc, wavefunction: kept };
}

/**
 * What the calculation was, in a line: "ORCA 6.0.1 · B3LYP/def2-SVP ·
 * charge 0, singlet" - and, of a file of several jobs, which job and what
 * it did: "Gaussian 16 · job 1 of 2, optimisation · HF/STO-3G · ...".
 * What the output does not say is left out.
 */
export function calcLine(c: CalcInfo): string {
  const program = [c.program, c.version].filter(Boolean).join(" ");
  const job = c.job ? `job ${c.job.number} of ${c.job.of}${c.job.kind ? `, ${c.job.kind.toLowerCase()}` : ""}` : "";
  const method = levelOf(c);
  const state = [
    c.charge != null ? `charge ${c.charge > 0 ? "+" : ""}${String(c.charge).replace(/^-/, "\u2212")}` : null,
    c.multiplicity != null ? multiplicityName(c.multiplicity) : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [program, job, method, state].filter(Boolean).join(" · ");
}

/**
 * The level a calculation's energies are of, in a line: its method and
 * basis, and its solvation where the output says it - "GFN2-xTB ·
 * ALPB(water), reference state gsolv [1 M gas/solution]", "GFN2-xTB · gas
 * phase" where it says it used none.
 */
export function levelOf(c: Pick<CalcInfo, "method" | "basis" | "solvation">): string {
  const solvation = c.solvation === "none" ? "gas phase" : c.solvation;
  return [[c.method, c.basis].filter(Boolean).join("/"), solvation].filter(Boolean).join(" \u00b7 ");
}

/** A multiplicity by name, as a chemist says it: singlet, doublet, ...; past a sextet, by number. */
export function multiplicityName(m: number): string {
  const names = ["singlet", "doublet", "triplet", "quartet", "quintet", "sextet"];
  return names[m - 1] ?? `multiplicity ${m}`;
}
