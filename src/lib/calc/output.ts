/**
 * What a reader plugin hands back from a calculation's output, and what a
 * molecule keeps of it (docs/WORKSPACE.md, stage 3). Plain data, the same
 * whichever reader read it and whatever program wrote it: what Meno does
 * something with in forms of its own - the atoms, their geometries, each
 * one's energy, what the calculation was - and everything else as results,
 * in the one general form (results.ts).
 */
import { warningsOf, type Warning } from "./warnings";
import { readResults, symmetryText, type MoleculeResult, type Result } from "./results";
import { orbitalResults, orbitalsOf } from "./orbitals";
import { standardWeight } from "../chem/isotopes";
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
  /** What it warns of, each with its kind (./warnings `WARNING_KINDS`; any other, `other`) and the program's own words. */
  warnings?: { kind?: string; text: string }[];
  /**
   * Its imaginary frequencies at the geometry it ended on, in cm-1, each
   * negative as programs list them - those the program itself judged
   * imaginary (xtb's "significant" ones, Gaussian's NImag, the modes ORCA
   * marks): none where it judged none; unsaid where it did not judge.
   */
  imaginary?: number[] | null;
  charge?: number | null;
  multiplicity?: number | null;
  /** Its atoms' elements, in the file's order. */
  atoms: string[];
  /** Each atom's mass, in daltons, as the program used it - where it prints them: what a dipole is taken about the centre of mass with (`calcOf`). */
  masses?: number[] | null;
  /** Each geometry it went through - an optimisation's steps - in ångströms: x, y, z of every atom. */
  frames: number[][];
  /** Each geometry's energy, in hartrees, where every one has one. */
  energies?: number[] | null;
  /**
   * Each geometry's population - its share of its compound, the program's
   * own Boltzmann weight, adding up to one - where the program works them
   * out: a conformer search's, which may count each conformer's rotamers in.
   */
  populations?: number[] | null;
  /**
   * Each geometry's degeneracy - how many forms of it the program found
   * alike, its rotamers - where it says: what Meno's own
   * Boltzmann weights count in too, as the program's populations do.
   */
  degeneracies?: number[] | null;
  /** Whether an optimisation came to an end, where it was one. */
  optimised?: boolean | null;
  /** Of an optimisation's or a relaxed scan's geometries, each one's being one the run found converged; none where it optimised nothing. */
  converged?: boolean[] | null;
  /** Why none of its geometries is one the run found, where its reader marks them all not converged for a reason of their own (`Unmarked`). */
  unmarked?: Unmarked | null;
  /**
   * Its orbitals, each its spin, energy (hartrees), occupation and symmetry
   * as the program gives them, in its order, and its surface where the
   * reader can work it out (./orbitals `Orbital`): what Meno lists itself,
   * naming the HOMO and the LUMO (`orbitalResults`).
   */
  orbitals?: unknown;
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
   * one (a step's `files`), as the output is.
   */
  wavefunction?: CalcSource;
  /** The readers chosen to read it as well that could not, each by id, and why (lib/calc/read). */
  unread?: { from: string; why: string }[];
  /** What the calculation warned of, each a kind core knows with the program's own words (./warnings): none moves its entry. */
  warnings?: Warning[];
  /** The imaginary frequencies the program judged its last geometry has, in cm-1, negative (`ReaderOutput.imaginary`): a mark that it is no minimum. */
  imaginary?: number[];
  /** When the chemist adopted the output it was read from - one Meno could not account for, taken on purpose (lib/jobKeys) - ms since 1970. */
  adopted?: number;
};

/** A program's imaginary frequencies as Meno keeps them: each a number below 0, in cm-1 - none judged (`[]`) as well as some, which is not "not judged"; nothing, where they are not that. */
export function imaginaryOf(v: unknown): number[] | undefined {
  return Array.isArray(v) && v.length <= 300 && v.every((f) => isNum(f) && f < 0) ? [...(v as number[])] : undefined;
}

/** Imaginary frequencies in plain words, as a molecule is marked with them: "1 imaginary frequency, 382.6i cm⁻¹". */
export function imaginaryWords(cm: readonly number[]): string {
  return `${cm.length} imaginary frequenc${cm.length === 1 ? "y" : "ies"}, ${cm.map((f) => `${Math.abs(f).toFixed(1)}i`).join(", ")} cm⁻¹`;
}

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
  const results = inMenosForm(readResults(givenResults(out), out.atoms.length, framesOf(out), readers[0] ? readerIdOfLine(readers[0]) : undefined), out);
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
    ...(warningsOf(out.warnings).length ? { warnings: warningsOf(out.warnings) } : {}),
    ...(imaginaryOf(out.imaginary) ? { imaginary: imaginaryOf(out.imaginary) } : {}),
  };
}

/**
 * The results an output gives, as they are to be read (results
 * `readResults`): what its reader gave, then its orbitals listed as Meno
 * lists them (./orbitals) - a list the reader gave of its own, under the
 * same name, first.
 */
export function givenResults(out: Pick<ReaderOutput, "results" | "orbitals">): unknown[] {
  const orbitals = orbitalsOf(out.orbitals);
  return [...(Array.isArray(out.results) ? out.results : []), ...(orbitals ? orbitalResults(orbitals) : [])];
}

/** The masses an output gives its atoms, where it gives one to each, each a mass; otherwise none. */
function massesOf(out: Pick<ReaderOutput, "atoms" | "masses">): number[] | undefined {
  const m = out.masses;
  return Array.isArray(m) && m.length === out.atoms.length && m.every((v) => isNum(v) && v > 0) ? [...m] : undefined;
}

/** Debye in an elementary charge times an ångström: e = 1.602176634e-19 C (SI 2019, exact), 1 D = 1e-21/c C m (c exact). */
const DEBYE_PER_E_ANGSTROM = 4.803204712570263;
/** What a charged molecule's dipole is called once it is taken about its centre of mass (`aboutCentre`). */
export const ABOUT_CENTRE = "Dipole moment about the centre of mass";

/**
 * A charged molecule's dipole, which depends on the point it is taken about, taken about the centre of mass of the
 * geometry it is of: the centre the program printed with it; else the one its atoms' masses give at the output's last
 * geometry (`xyz`) - as the program used them, else the elements' standard atomic weights (lib/chem/isotopes) -
 * μ' = μ - q (C - O) - and said to be, its origin now that centre. A neutral one's, or one taken about the centre
 * already, as it was; one that says no vector or origin, or with no centre to take it about, as given.
 */
function aboutCentre(r: MoleculeResult, xyz: readonly number[] | undefined, masses: readonly number[] | undefined, charge: number | undefined): MoleculeResult {
  if (r.quantity !== "dipole" || !r.vector || !r.origin || !charge) return r;
  const centre = r.centre ?? centreOf(xyz, masses);
  if (!centre) return r;
  const vector = r.vector.map((v, k) => v - charge * (centre[k] - r.origin![k]) * DEBYE_PER_E_ANGSTROM) as [number, number, number];
  const value = Math.hypot(...vector);
  return Number.isFinite(value) ? { ...r, label: ABOUT_CENTRE, value, vector, origin: centre } : r;
}

/** The centre of mass of a geometry, with each atom's mass; none without one to each atom. */
function centreOf(xyz: readonly number[] | undefined, masses: readonly number[] | undefined): [number, number, number] | undefined {
  if (!xyz || !masses || xyz.length !== 3 * masses.length) return undefined;
  const total = masses.reduce((a, b) => a + b, 0);
  return [0, 1, 2].map((k) => masses.reduce((a, m, i) => a + m * xyz[3 * i + k], 0) / total) as [number, number, number];
}

/**
 * An output's results in Meno's own form, each as its reader gave it otherwise: a charged molecule's dipole about the
 * centre of mass of the output's last geometry (`aboutCentre`); a point group and a Mulliken symbol - a value or a
 * list's column of them, as a symmetry, or the thermochemistry's point group - written as Meno writes one (results
 * `symmetryText`), for display and for every comparison.
 */
export function inMenosForm(results: Result[], out: Pick<ReaderOutput, "atoms" | "frames" | "masses" | "charge">): Result[] {
  const xyz = [...(out.frames ?? [])].reverse().find((f) => Array.isArray(f) && f.length === 3 * out.atoms.length);
  // (the masses the program used, else the elements' standard atomic weights - each element's, or none)
  const standard = out.atoms.map((el) => standardWeight(el));
  const masses = massesOf(out) ?? (standard.every((m): m is number => m != null) ? standard : undefined);
  const charge = Number.isInteger(out.charge) ? out.charge! : undefined;
  const sym = (v: unknown) => (typeof v === "string" ? symmetryText(v) : v);
  return results.map((r) => {
    if (r.on === "molecule") {
      const moved = aboutCentre(r, xyz, masses, charge);
      return moved.quantity === "symmetry" || moved.id === POINT_GROUP ? { ...moved, value: sym(moved.value) as MoleculeResult["value"] } : moved;
    }
    if (r.on === "list" && r.columns.some((c) => c.quantity === "symmetry")) {
      const which = r.columns.map((c) => c.quantity === "symmetry");
      return { ...r, rows: r.rows.map((row) => ({ ...row, cells: row.cells.map((c, k) => (which[k] ? (sym(c) as typeof c) : c)) })) };
    }
    return r;
  });
}

/** The point group a frequency job's thermochemistry took, as every reader names it (docs/PLUGINS.md, *The contract*). */
const POINT_GROUP = "thermo.point-group";

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
 * One read by no reader is kept too, where it says something: the charge
 * and spin a step was given and kept (workflow/run `speciesKept`), or what
 * made a molecule - a plugin, its force field - where no output was read
 * (stepRuns, conformers made of a drawing). Read back, it is what the
 * session held, so that a later step is told the same charge and spin.
 * Any one-value field there that is not as Meno writes it (`WELL_FORMED`),
 * or a reader that is not a name, refuses the whole record.
 */
export function readCalc(given: unknown, atoms: number, frames: number): CalcInfo | undefined {
  const c = given as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== "object") return undefined;
  // (a field there that is not as Meno writes it - a charge "1" - refuses the whole record, so it is said not read: never read back without that field, as if it had not been said)
  if (Object.entries(WELL_FORMED).some(([k, ok]) => c[k] !== undefined && !ok(c[k]))) return undefined;
  if (c.readers !== undefined && (!Array.isArray(c.readers) || !c.readers.every((r) => text(r) != null))) return undefined;
  const readers = Array.isArray(c.readers) ? (c.readers as string[]) : [];
  // (by no reader - its list there, and empty, as Meno writes one - kept only where it holds what was given: a charge, a multiplicity, or what made it)
  if (!readers.length && (!Array.isArray(c.readers) || (!isNum(c.charge) && !isNum(c.multiplicity) && !text(c.program) && !text(c.method)))) return undefined;
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
      // (what it warned of, and the imaginary frequencies it was marked with: kept with the workspace as they came)
      ...(Array.isArray(c.warnings) ? { warnings: c.warnings as { kind?: string; text: string }[] } : {}),
      ...(imaginaryOf(c.imaginary) ? { imaginary: imaginaryOf(c.imaginary) } : {}),
      atoms: new Array(atoms).fill(""),
      frames: new Array(frames).fill(new Array(3 * atoms).fill(0)),
      results,
    },
    readers,
    sourceOf(c.source),
    unread,
  );
  // (adopted, with when: kept as it was)
  const adopted = isNum(c.adopted) ? { adopted: c.adopted } : {};
  // (its wavefunction, kept by Meno: never found where it was, so no place)
  const wavefunction = sourceOf(c.wavefunction);
  if (!wavefunction) return { ...calc, ...adopted };
  const { path: _, ...kept } = wavefunction;
  return { ...calc, ...adopted, wavefunction: kept };
}

/** Each field of a kept calculation's record that is one value, as `calcOf` writes it: words said, a whole charge, a multiplicity of 1 or more, yes or no; and when it was adopted. */
const WELL_FORMED: Readonly<Record<string, (v: unknown) => boolean>> = {
  program: (v) => text(v) != null,
  version: (v) => text(v) != null,
  method: (v) => text(v) != null,
  basis: (v) => text(v) != null,
  solvation: (v) => text(v) != null,
  charge: (v) => Number.isInteger(v),
  multiplicity: (v) => Number.isInteger(v) && (v as number) > 0,
  optimised: (v) => typeof v === "boolean",
  adopted: isNum,
};

/**
 * What the calculation was, in a line: "ORCA 6.0.1 · B3LYP/def2-SVP ·
 * charge 0, singlet" - and, of a file of several jobs, which job and what
 * it did: "Gaussian 16 · job 1 of 2, optimisation · HF/STO-3G · ...".
 * What the output does not say is left out.
 */
export function calcLine(c: CalcInfo): string {
  // (output Meno could not account for, adopted by the chemist: said first, wherever it is shown)
  if (c.adopted != null) return ["adopted output", calcLineOf(c)].filter(Boolean).join(" · ");
  return calcLineOf(c);
}

function calcLineOf(c: CalcInfo): string {
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

/**
 * Why none of an output's geometries is one the run found, where it is not
 * that its optimisation did not converge: "error", its run ended with an
 * error; "cut", it did not come to its end; "path", they are the points of
 * a rigid scan or a reaction path; "unstated", the file does not say which
 * converged; "unread", which did could not be read.
 */
export type Unmarked = "error" | "cut" | "path" | "unstated" | "unread";
export const UNMARKED: readonly Unmarked[] = ["error", "cut", "path", "unstated", "unread"];

/** Whether a geometry an output gives reads: three numbers to each of its atoms. */
export const frameReads = (f: unknown, atoms: number) => Array.isArray(f) && f.length === 3 * atoms;

/**
 * Of an output's geometries that read (`frameReads`), each one's being one
 * the run found converged, as its reader marks them - the mark of one that
 * does not read left out with it - and why none is, where the reader says.
 * None where the reader marks none. Marks that are not one to each geometry
 * the output gives, or not each true or false, say nothing of which: none
 * is one, "unstated" - never every one.
 */
export function marksOf(o: Pick<ReaderOutput, "atoms" | "frames" | "converged" | "unmarked">): { converged: boolean[]; unmarked?: Unmarked } | null {
  if (o.converged == null) return null;
  const given = Array.isArray(o.frames) ? o.frames : [];
  const n = o.atoms?.length ?? 0;
  const kept = given.flatMap((f, i) => (frameReads(f, n) ? [i] : []));
  const marks = o.converged;
  if (!Array.isArray(marks) || marks.length !== given.length || !marks.every((c) => typeof c === "boolean")) return { converged: kept.map(() => false), unmarked: "unstated" };
  const unmarked = UNMARKED.includes(o.unmarked as Unmarked) ? (o.unmarked as Unmarked) : undefined;
  return { converged: kept.map((i) => !unmarked && marks[i]), ...(unmarked ? { unmarked } : {}) };
}
