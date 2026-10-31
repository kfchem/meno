/**
 * A property of a workflow's steps (docs/WORKFLOWS.md, *What changes in the
 * contract*): each entry's charge and spin multiplicity survive the whole
 * trip - given to the plugin that fills the step, through its jobs and what
 * it reads back, to the entries of the step's result set, and on into the
 * next step - for every kind of step and every plugin the catalogue says
 * fills it, and for Meno's own steps. Seeded random sets of small molecules
 * - mixed charges and spins, compound sets and conformer sets - are run
 * through the store as the page runs them; the plugins' workers, their
 * programs and Meno's readers are stand-ins, each answering as its
 * plugin's contract has it.
 */
import { describe, expect, it, vi } from "vitest";
import type { Job, JobAsk } from "../../../../lib/jobs";
import type { Radical } from "../../../../lib/chem/molecule";

/** The jobs, as the stand-in programs left them: each done at once, with its log and its files. */
const jobs = new Map<string, Job & { log: string; files: Record<string, string> }>();
let nextJob = 1;

vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  startJob: async (ask: JobAsk) => {
    const id = `00000000-0000-4000-8000-${String(nextJob++).padStart(12, "0")}`;
    const { log, files } = program(ask);
    jobs.set(id, { id, plugin: ask.plugin, program: ask.program, state: "done", created: Date.now(), started: 1000, ended: 2000, log, files, ...(ask.key ? { key: ask.key } : {}) });
    return id;
  },
  listJobs: async () => [...jobs.values()],
  jobOf: async (id: string) => jobs.get(id)!,
  readJobLog: async (id: string, from: number) => {
    const log = jobs.get(id)?.log ?? "";
    return { text: log.slice(from), next: log.length };
  },
  jobFiles: async (id: string) => Object.keys(jobs.get(id)?.files ?? {}),
  readJobFile: async (id: string, name: string) => jobs.get(id)!.files[name],
  stopJob: async () => {},
  removeJob: async () => {},
  jobFolder: async (id: string) => `/jobs/${id}`,
}));
vi.mock("@tauri-apps/api/path", async (actual) => ({
  ...(await actual<typeof import("@tauri-apps/api/path")>()),
  join: async (...parts: string[]) => parts.join("/"),
}));
// (every program installed separately found)
vi.mock("../../../../lib/plugins/installed", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/plugins/installed")>()),
  lookFor: async (_plugin: string, name: string) => `/opt/${name}/${name}`,
}));
vi.mock("../../../../lib/calc/read", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/read")>()),
  readOutput: async (name: string, text: string) => readPrinted(name, text),
}));
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async (p: { id: string }) => worker(p.id),
}));
vi.mock("../../../../lib/roles/worker", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/roles/worker")>()),
  pluginWorker: async () => chem,
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, addMolecule3d, type WorkspaceDocument } from "../document";
import type { Atom, EditorState, Molecule3D } from "./types";
import { useReaders } from "../../../../lib/calc/workers";
import { PLUGINS, pluginById } from "../../../../lib/calc/catalog";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { knownOf } from "../../../../lib/io/writers";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { setEntries, setMembers, type SetEntry } from "../workflow/entries";
import { resultOf } from "../workflow/flow";
import { KINDS, MENO_DOES, kindInfo, takesNothing, type SetKind, type StepKind, isSetKind } from "../workflow/kinds";
import { PAIRED } from "../workflow/meno";
import { takesBy } from "../workflow/doers";
import { pluginEntry, type PluginEntry } from "../workflow/programs";
import { measured } from "../../../../testing/timeouts";

// (the plugins Meno carries, added: the kinds their outputs are read as registered)
registerKinds(MANIFESTS);
useReaders.setState({ state: Object.fromEntries(PLUGINS.map((p) => [p.id, "added" as const])), problem: {} });

// --- what goes in --------------------------------------------------------------

type SpeciesAtom = { el: string; x: number; y: number; z: number; charge?: number; radical?: Radical };
/** A small molecule, with the charge and spin multiplicity a chemist gives it: what each step must keep. */
type Species = { name: string; charge: number; multiplicity: number; atoms: SpeciesAtom[]; bonds: [number, number, number][] };

const H = (x: number, y: number, z: number): SpeciesAtom => ({ el: "H", x, y, z });
/** `n` atoms, each after the first bonded to it. */
const fromFirst = (n: number): [number, number, number][] => Array.from({ length: n - 1 }, (_, i) => [0, i + 1, 1]);

/**
 * The species: a neutral singlet, cations, anions, radicals, triplets and a
 * dication - among them some of the same atoms but another charge or spin
 * (methyl's cation, radical and anion; methylene's singlet and triplet;
 * dioxygen and superoxide), which no step may take for one another.
 */
const SPECIES: readonly Species[] = [
  { name: "water", charge: 0, multiplicity: 1, atoms: [{ el: "O", x: 0, y: 0, z: 0.119 }, H(0, 0.763, -0.477), H(0, -0.763, -0.477)], bonds: fromFirst(3) },
  {
    name: "methanol",
    charge: 0,
    multiplicity: 1,
    atoms: [{ el: "C", x: -0.047, y: 0.662, z: 0 }, { el: "O", x: -0.047, y: -0.757, z: 0 }, H(-1.086, 0.975, 0), H(0.438, 1.083, 0.888), H(0.438, 1.083, -0.888), H(0.869, -1.054, 0)],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1]],
  },
  { name: "ammonium", charge: 1, multiplicity: 1, atoms: [{ el: "N", x: 0, y: 0, z: 0, charge: 1 }, H(0.59, 0.59, 0.59), H(-0.59, -0.59, 0.59), H(-0.59, 0.59, -0.59), H(0.59, -0.59, -0.59)], bonds: fromFirst(5) },
  { name: "hydroxide", charge: -1, multiplicity: 1, atoms: [{ el: "O", x: 0, y: 0, z: 0, charge: -1 }, H(0, 0, 0.97)], bonds: fromFirst(2) },
  { name: "methyl", charge: 0, multiplicity: 2, atoms: [{ el: "C", x: 0, y: 0, z: 0, radical: "doublet" }, H(1.08, 0, 0), H(-0.54, 0.935, 0), H(-0.54, -0.935, 0)], bonds: fromFirst(4) },
  { name: "methyl cation", charge: 1, multiplicity: 1, atoms: [{ el: "C", x: 0, y: 0, z: 0, charge: 1 }, H(1.09, 0, 0), H(-0.545, 0.944, 0), H(-0.545, -0.944, 0)], bonds: fromFirst(4) },
  { name: "methyl anion", charge: -1, multiplicity: 1, atoms: [{ el: "C", x: 0, y: 0, z: 0, charge: -1 }, H(1.03, 0, -0.36), H(-0.515, 0.892, -0.36), H(-0.515, -0.892, -0.36)], bonds: fromFirst(4) },
  { name: "dioxygen", charge: 0, multiplicity: 3, atoms: [{ el: "O", x: 0, y: 0, z: 0, radical: "doublet" }, { el: "O", x: 0, y: 0, z: 1.21, radical: "doublet" }], bonds: fromFirst(2) },
  { name: "superoxide", charge: -1, multiplicity: 2, atoms: [{ el: "O", x: 0, y: 0, z: 0, charge: -1 }, { el: "O", x: 0, y: 0, z: 1.33, radical: "doublet" }], bonds: fromFirst(2) },
  {
    name: "hydrazinium",
    charge: 2,
    multiplicity: 1,
    atoms: [{ el: "N", x: 0, y: 0, z: 0, charge: 1 }, { el: "N", x: 0, y: 0, z: 1.45, charge: 1 }, H(0.97, 0, -0.34), H(-0.48, 0.84, -0.34), H(-0.48, -0.84, -0.34), H(-0.97, 0, 1.79), H(0.48, 0.84, 1.79), H(0.48, -0.84, 1.79)],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1], [1, 6, 1], [1, 7, 1]],
  },
  { name: "singlet methylene", charge: 0, multiplicity: 1, atoms: [{ el: "C", x: 0, y: 0, z: 0, radical: "singlet" }, H(0.86, 0, 0.62), H(-0.86, 0, 0.62)], bonds: fromFirst(3) },
  { name: "triplet methylene", charge: 0, multiplicity: 3, atoms: [{ el: "C", x: 0, y: 0, z: 0, radical: "triplet" }, H(1.02, 0, 0.28), H(-1.02, 0, 0.28)], bonds: fromFirst(3) },
  { name: "aminium", charge: 1, multiplicity: 2, atoms: [{ el: "N", x: 0, y: 0, z: 0, charge: 1, radical: "doublet" }, H(1.02, 0, 0), H(-0.51, 0.883, 0), H(-0.51, -0.883, 0)], bonds: fromFirst(4) },
];
const species = (name: string) => SPECIES.find((s) => s.name === name)!;

/** A seeded pseudo-random generator (mulberry32): numbers in [0, 1), the same for the same seed. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T>(rng: Rng, from: readonly T[]): T => from[Math.floor(rng() * from.length)];
const between = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** How far apart each geometry that goes in is laid (ångströms, along x): what tells what came out apart, by where it lies. */
const APART = 4;
/** How far a stand-in program moves an atom, at most (ångströms): far less than `APART`. */
const MOVED = 0.04;

/** One molecule in 3D of a set: its species, and how many geometries it has. */
type Group = { species: Species; frames: number };
/** A set to run: a compound set or a conformer set, of molecules in 3D. */
type Input = { holds: "molecules" | "conformers"; groups: Group[] };

/**
 * A random set of `holds`: one to four molecules of species picked at
 * random - mixed charges and spins - each, in a conformer set, two to three
 * conformers; in a compound set, mostly one geometry, now and then a file's
 * several (each a compound of its own).
 */
function randomInput(rng: Rng, holds: "molecules" | "conformers"): Input {
  const groups = Array.from({ length: between(rng, 1, 4) }, () => ({
    species: pick(rng, SPECIES),
    frames: holds === "conformers" ? between(rng, 2, 3) : rng() < 0.25 ? 2 : 1,
  }));
  return { holds, groups };
}

/** The sets that stress the property most: the same atoms in another charge or spin, side by side. */
const HARD: readonly string[][] = [
  ["singlet methylene", "triplet methylene"],
  ["methyl", "methyl cation", "methyl anion"],
  ["dioxygen", "superoxide"],
  ["ammonium", "aminium", "hydrazinium", "hydroxide"],
];

/** Where each geometry that went in lies, and what it is: its centre (ångströms), its atoms' elements, its species. */
type Source = { centre: [number, number, number]; elements: string; species: Species };

const centreOf = (xyz: readonly number[]): [number, number, number] => {
  const n = xyz.length / 3;
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += xyz[3 * i + a] / n;
  return c;
};

/**
 * A page with the input in a set, as the chemist leaves it: each molecule
 * in 3D inside the set's frame, each geometry `APART` from the others and
 * shaken a little, with an energy - and where each lies, to know what came
 * out of it.
 */
function pageOf(input: Input, rng: Rng) {
  const doc = createWorkspaceDocument();
  const sources: Source[] = [];
  let k = 0;
  const geometry = (s: Species) => {
    const at = APART * k++;
    const xyz = s.atoms.flatMap((a) => [a.x + at + 0.3 * (rng() - 0.5), a.y + 0.3 * (rng() - 0.5), a.z + 0.3 * (rng() - 0.5)]);
    sources.push({ centre: centreOf(xyz), elements: s.atoms.map((a) => a.el).join(" "), species: s });
    return xyz;
  };
  doc.edit("input", (d) =>
    input.groups.reduce((d, g, i) => {
      const first = geometry(g.species);
      const frames = Array.from({ length: g.frames - 1 }, () => geometry(g.species));
      const m: Omit<Molecule3D, "id"> = {
        name: `${g.species.name} ${i + 1}`,
        atoms: g.species.atoms.map((a, j) => ({ ...a, x: first[3 * j], y: first[3 * j + 1], z: first[3 * j + 2] })),
        bonds: g.species.bonds.map(([a1, a2, order]) => ({ a1, a2, order })),
        at: { x: -400 + 10 * i, y: 0 },
        ...(frames.length ? { frames } : {}),
        energies: Array.from({ length: g.frames }, () => -100 - rng() / 100),
        ...(input.holds === "conformers" ? { conformerSet: true } : {}),
      };
      return addMolecule3d(d, m);
    }, d),
  );
  return { doc, sources, ...storeOf(doc), frame: { x0: -500, y0: -50, x1: -10, y1: 50 } };
}

function storeOf(doc: ReturnType<typeof createWorkspaceDocument>) {
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { st: () => store.getState() };
}

/** The source of a geometry: the one that went in of the same atoms whose centre is nearest - near enough that it is that one, moved by the programs. */
function sourceOf(sources: readonly Source[], elements: string, xyz: readonly number[]): Source | undefined {
  const c = centreOf(xyz);
  let best: Source | undefined;
  let least = Infinity;
  for (const s of sources) {
    if (s.elements !== elements) continue;
    const d = Math.hypot(c[0] - s.centre[0], c[1] - s.centre[1], c[2] - s.centre[2]);
    if (d < least) [least, best] = [d, s];
  }
  return least < APART / 4 ? best : undefined;
}

/** The charge and multiplicity a step would give a plugin of an entry: as Export reads them. */
const stateOf = (e: SetEntry) => {
  const p = pluginEntry(e);
  return { charge: p.charge, multiplicity: p.multiplicity };
};
const said = (x: { charge: number; multiplicity: number }) => `charge ${x.charge}, multiplicity ${x.multiplicity}`;

// --- the stand-ins ---------------------------------------------------------------

/** How many entries of result sets had a calculation that said their charge and multiplicity: that what the stand-ins said back was looked at. */
let calcsSaid = 0;
/** Whether the stand-ins say the charge and multiplicity in what they give back - a plugin's outputs, a reader's - or leave them out. */
let saying = true;
/** What the stand-in workers were asked, and anything given to the wrong job. */
const asked = { prepared: [] as { plugin: string; step: string; entries: PluginEntry[] }[], ran: [] as PluginEntry[][], crossed: [] as string[] };
let rngNow: Rng = random(1);

/** A geometry moved as a program moves it: by up to `MOVED`, the same each time for the same `k`. */
const moved = (xyz: readonly number[], k: number) => xyz.map((v, i) => v + MOVED * Math.sin(1.7 * i + 2.3 * k));

/** What a stand-in job ran on, in its input file: each entry's elements, geometry, charge and multiplicity, as its plugin wrote them. */
type JobEntry = { elements: string[]; xyz: number[]; charge: number; multiplicity: number };
const INPUT = "job.json";
const OUTPUT = "out.json";

/** A small density's cube, in ångströms: what an NCI job's grids are, here. */
const CUBE = [
  "Grid",
  "written by hand",
  "    1    0.000000    0.000000    0.000000",
  "   -2    0.500000    0.000000    0.000000",
  "   -2    0.000000    0.500000    0.000000",
  "   -2    0.000000    0.000000    0.500000",
  "    1    1.000000    0.250000    0.250000    0.250000",
  "  0.1 0.2 0.3 0.4",
  "  0.5 0.6 0.7 0.8",
].join("\n");

/**
 * A stand-in program, run on its job's input: for each entry, its
 * geometries - two conformers of a search, an optimisation's start and end,
 * else the one it was given - each with an energy; and, as a program prints
 * what it was asked, the charge and multiplicity it ran with.
 */
function program(ask: JobAsk): { log: string; files: Record<string, string> } {
  const input = JSON.parse(ask.files!.find((f) => f.name === INPUT)!.text) as { step: StepKind; entries: JobEntry[] };
  const made = input.entries.map((e) => {
    const frames = input.step === "conformers" ? [moved(e.xyz, 1), moved(e.xyz, 2)] : input.step === "optimise" ? [e.xyz, moved(e.xyz, 3)] : [e.xyz];
    return { frames, energies: frames.map((_, k) => -100 - k / 1000) };
  });
  const log = input.entries
    .map((e, i) => {
      const { frames, energies } = made[i];
      const last = frames[frames.length - 1];
      return [`charge ${e.charge} multiplicity ${e.multiplicity}`, ...e.elements.map((el, j) => `${el} ${last.slice(3 * j, 3 * j + 3).join(" ")}`), `energy ${energies[energies.length - 1]}`].join("\n");
    })
    .join("\n");
  return { log: log + "\n", files: { [OUTPUT]: JSON.stringify({ ran: input.entries, made }), "grad.cube": CUBE, "dens.cube": CUBE } };
}

/** What Meno's readers make of a stand-in program's output, as they read one opened: the charge and multiplicity it printed - or none, where they are not saying. */
function readPrinted(_name: string, text: string) {
  const lines = text.trim().split("\n");
  const [, charge, multiplicity] = /^charge (-?\d+) multiplicity (\d+)$/.exec(lines[0])!.map(Number);
  const atoms = lines.slice(1, -1).map((l) => l.split(" "));
  return {
    output: {
      schema: 1,
      program: "Stand-in",
      atoms: atoms.map((a) => a[0]),
      frames: [atoms.flatMap((a) => a.slice(1).map(Number))],
      energies: [Number(lines[lines.length - 1].split(" ")[1])],
      // (a stand-in's run ended where it should: an optimisation's said converged, as a reader of one finished says)
      optimised: true,
      ...(saying ? { charge, multiplicity } : {}),
    },
    readers: ["stand-in 1"],
  };
}

const jobEntry = (e: PluginEntry): JobEntry => ({ elements: e.atoms.map((a) => a.el), xyz: e.atoms.flatMap((a) => [a.x, a.y, a.z]), charge: e.charge, multiplicity: e.multiplicity });

/** How a plugin's collect answers, as its worker does: its own outputs (xtb's, CREST's, RDKit's), an output for Meno's readers (ORCA's, Gaussian's), or surfaces in cube files (NCI's). */
const ANSWERS: Record<string, "outputs" | "read" | "surfaces"> = { xtb: "outputs", crest: "outputs", rdkit: "outputs", orca: "read", gaussian: "read", nciplot: "surfaces", multiwfn: "surfaces" };

/**
 * A plugin's worker, as a stand-in that keeps its contract: one job for each
 * entry - but CREST's optimisation, one for the entries of each molecule
 * (the same atoms, charge and multiplicity) - its input the entries as it
 * was given them; read back, its outputs say the charge and multiplicity of
 * the entries it is given (as xTB's and CREST's do; RDKit's never do).
 */
function worker(plugin: string) {
  const programOf = (step: string) => pluginById(plugin)!.steps.find((s) => s.kind === step)!.programs[0];
  return {
    version: "1",
    prepare: async (step: string, entries: PluginEntry[]) => {
      asked.prepared.push({ plugin, step, entries });
      const groups: number[][] = [];
      if (plugin === "crest" && step === "optimise") {
        const by = new Map<string, number[]>();
        entries.forEach((e, i) => {
          const key = `${e.atoms.map((a) => a.el).join(" ")}|${e.charge}|${e.multiplicity}`;
          by.set(key, [...(by.get(key) ?? []), i]);
        });
        groups.push(...by.values());
      } else groups.push(...entries.map((_, i) => [i]));
      return {
        jobs: groups.map((g) => ({
          entries: g,
          program: programOf(step),
          args: [],
          files: [{ name: INPUT, text: JSON.stringify({ step, entries: g.map((i) => jobEntry(entries[i])) }) }],
          ...(plugin === "gaussian" ? { stdin: INPUT } : {}),
          reads: [OUTPUT],
        })),
      };
    },
    collect: async (step: string, entries: PluginEntry[], _options: unknown, files: Record<string, string>) => {
      const { ran, made } = JSON.parse(files[OUTPUT]) as { ran: JobEntry[]; made: { frames: number[][]; energies: number[] }[] };
      // (what it is told it read back is what its job ran on)
      if (JSON.stringify(entries.map(jobEntry)) !== JSON.stringify(ran)) asked.crossed.push(`${plugin} ${step}: collect given ${entries.map(said).join("; ")} for a job run on ${ran.map(said).join("; ")}`);
      const answer = ANSWERS[plugin];
      if (answer === "read") return { read: entries.map((e) => ({ kind: plugin, log: true, name: `${(e.name ?? "x").replace(/[^A-Za-z0-9]+/g, "_")}.out` })) };
      if (answer === "surfaces")
        return { surfaces: entries.map(() => ({ name: "Non-covalent interactions", rows: [{ label: "RDG", file: "grad.cube", iso: 0.3, colour: { file: "dens.cube", from: -7, to: 7 } }] })) };
      return {
        outputs: entries.map((e, i) => ({
          schema: 1,
          program: plugin,
          atoms: e.atoms.map((a) => a.el),
          frames: made[i].frames,
          energies: made[i].energies,
          optimised: true,
          ...(saying && plugin !== "rdkit" ? { charge: e.charge, multiplicity: e.multiplicity } : {}),
        })),
      };
    },
    run: async (_step: string, entries: PluginEntry[]) => {
      asked.ran.push(entries);
      // (some kept, at random - at least one)
      const kept = entries.map((_, i) => i).filter(() => rngNow() < 0.6);
      return { kept: kept.length ? kept : [0] };
    },
  };
}

/** The molblocks a conformer search on structures drawn was given. */
const drawnAsked: string[] = [];
/**
 * RDKit's worker, as a stand-in for its `conformers` role: the structure's
 * atoms, in the order they came, each its element and charge - as RDKit's
 * answer has them - its bonds, and two conformers with their energies; for
 * its `configurations` role, each molecule one with no stereo; and for its
 * `open_stereo`, each structure one that leaves none open.
 */
const chem = {
  request: async (op: string, payload: { molblock: string; molblocks?: string[] }) => {
    if (op === "configurations") return { molecules: (payload.molblocks ?? []).map(() => ({ elements: [], key: "none" })) };
    if (op === "open_stereo") return { atoms: [], bonds: [], isomers: 1 };
    if (op !== "conformers") throw new Error(`no ${op} here`);
    drawnAsked.push(payload.molblock);
    const mol = readMolfile(payload.molblock)!;
    const xyz = mol.atoms.flatMap((a) => [a.x, a.y, a.z]);
    return {
      isomers: [
        {
          atoms: mol.atoms.map((a) => ({ el: a.symbol, charge: a.charge ?? 0 })),
          bonds: mol.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.type })),
          frames: [moved(xyz, 1), moved(xyz, 2)],
          energies: [-0.01, -0.009],
          field: "MMFF94",
          cip: { atoms: {}, bonds: {} },
          chosen: { atoms: {}, bonds: {} },
          smiles: "",
        },
      ],
    };
  },
};

// --- the property ------------------------------------------------------------------

/**
 * Each kind of step and who fills it that takes molecules in 3D: every plugin the catalogue says fills it, and Meno.
 * Render gives pictures, and Chart and Energy diagram charts, which have no charge; a kind that takes nothing in (Generate) is given no
 * entry to keep one of - the charges it gives are its own (stepRuns.test, *Generate*); Enumerate takes structures drawn
 * alone. Species sets them, as it is asked, and Combine makes the parts one complex, its charge and multiplicity theirs
 * together: each against its own known answers (lib/steps structures.test, workflow/structureSteps.test). Merge, Re-bond,
 * Compare bonding and Torsion restraints take two inputs, which this wires one of: each against its own
 * (workflow/pairedSteps.test) - Merge, Compare bonding and Torsion restraints give back the entries that came in, Re-bond its
 * bonding entry's charge and multiplicity. Path search takes two too, each pair of one charge and spin or refused
 * (workflow/pathSearch.test). Follow the reaction path reads back a path, never one geometry: its
 * entry keeps the charge and multiplicity that came in (workflow/reactionPath.test).
 */
const DOERS: readonly [StepKind, string][] = [
  ...PLUGINS.flatMap((p) => p.steps.map((s): [StepKind, string] => [s.kind, p.id])),
  ...MENO_DOES.map((k): [StepKind, string] => [k, "meno"]),
].filter(([kind]) => kindInfo(kind).gives !== "pictures" && kindInfo(kind).gives !== "chart" && !takesNothing(kind) && kindInfo(kind).takes.some((h) => h !== "structures") && kind !== "species" && kind !== "displace" && kind !== "combine" && !PAIRED.includes(kind) && kind !== "path-search" && kind !== "reaction-path" && kind !== "add" && kind !== "ensemble");

/** The kind of set a step gives, for what it took. */
const givesFor = (kind: StepKind, holds: SetKind): SetKind => {
  const g = kindInfo(kind).gives;
  return isSetKind(g) ? g : holds;
};

/**
 * What went wrong with a step's run, said: each entry a plugin was given
 * whose charge or multiplicity is not its own; each entry of the result set
 * whose charge or multiplicity - or what its calculation says of them - is
 * not that of the entry it came from; a job read back with another's
 * entries; or the step's failing.
 */
function wrongs(st: () => EditorState, steps: readonly number[], sources: readonly Source[], was: { prepared: number; ran: number }): string[] {
  const out: string[] = [];
  for (const id of steps) {
    const ran = st().steps.find((s) => s.id === id)!.ran;
    if (!ran?.ok) out.push(`step ${id} did not run: ${ran?.said}`);
  }
  const given = [...asked.prepared.slice(was.prepared).flatMap((p) => p.entries.map((e) => ({ e, by: `${p.plugin} ${p.step}` }))), ...asked.ran.slice(was.ran).flatMap((r) => r.map((e) => ({ e, by: "run at once" })))];
  for (const { e, by } of given) {
    const xyz = e.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const source = sourceOf(sources, e.atoms.map((a) => a.el).join(" "), xyz);
    if (!source) out.push(`${by} was given an entry that came from nothing that went in`);
    else if (e.charge !== source.species.charge || e.multiplicity !== source.species.multiplicity)
      out.push(`${by} was given ${source.species.name} with ${said(e)}, not ${said(source.species)}`);
  }
  out.push(...asked.crossed);
  const last = steps[steps.length - 1];
  const set = resultOf(st(), last);
  const holds = set?.made?.holds;
  if (!set || (holds !== "molecules" && holds !== "conformers")) return [...out, "no result set of molecules in 3D"];
  const byId = new Map(st().molecules3d.map((m) => [m.id, m]));
  const molecules = setMembers(st(), set).molecules.map((id) => byId.get(id)!);
  const entries = setEntries(molecules, holds);
  if (!entries.length) out.push("an empty result set");
  for (const e of entries) {
    const source = sourceOf(sources, e.atoms.map((a) => a.el).join(" "), e.xyz);
    if (!source) {
      out.push(`an entry of the result set (${e.name}) came from nothing that went in`);
      continue;
    }
    const now = stateOf(e);
    if (now.charge !== source.species.charge || now.multiplicity !== source.species.multiplicity)
      out.push(`${source.species.name} came out as ${e.name} with ${said(now)}, not ${said(source.species)}`);
    const calc = byId.get(e.from!)!.calc;
    if (calc?.charge != null && calc.multiplicity != null) calcsSaid++;
    if ((calc?.charge != null && calc.charge !== source.species.charge) || (calc?.multiplicity != null && calc.multiplicity !== source.species.multiplicity))
      out.push(`${source.species.name}'s calculation says charge ${calc?.charge}, multiplicity ${calc?.multiplicity}, not ${said(source.species)}`);
  }
  return out;
}

/** A chain of steps - each a kind and who does it - wired from the input's set and each from the one before, run: what went wrong. */
async function trip(input: Input, chain: readonly [StepKind, string][], seed: number): Promise<string[]> {
  const rng = random(seed);
  rngNow = random(seed + 1);
  jobs.clear();
  asked.crossed = [];
  const was = { prepared: asked.prepared.length, ran: asked.ran.length };
  const { st, sources, frame } = pageOf(input, rng);
  const set = st().addSet(frame);
  const steps: number[] = [];
  chain.forEach(([kind, by], i) => {
    const id = st().addStep(kind, by, 1000 * i, 0);
    // (a Filter keeping every entry - each has its number - so that what it passes on is all it was given)
    if (kind === "filter") st().updateStep(id, { options: { conditions: "number \u2265 1", match: "all" } });
    // (a Tag named, and a Measure asked a distance every entry has: neither runs without)
    if (kind === "tag") st().updateStep(id, { options: { name: `t${i}` } });
    if (kind === "measure") st().updateStep(id, { options: { measurements: "1-2" } });
    // (Restraints asked an atom every entry has fixed: it has no default to run with)
    if (kind === "restraints") st().updateStep(id, { options: { coordination: false, fixed: "1" } });
    st().connect(i ? { set: resultOf(st(), steps[i - 1])!.id } : { set }, id);
    steps.push(id);
  });
  await st().runStep(steps[steps.length - 1]);
  return wrongs(st, steps, sources, was).map((w) => `${w} [seed ${seed}; ${chain.map((c) => c.join(" by ")).join(", then ")}; ${input.holds}: ${input.groups.map((g) => g.species.name).join(", ")}; ${saying ? "said" : "unsaid"} back]`);
}

/** How many random sets each step is run on. */
const SEEDS = 12;

describe("a step keeps each entry's charge and multiplicity", () => {
  it("for every kind of step the catalogue has, and every plugin that fills one - and Meno's own", () => {
    // (each kind Meno defines filled by something - left out here Render, Chart and Energy diagram, which give pictures and charts, Generate, given nothing, and those that take structures drawn alone, whose atoms are as drawn; Species and Combine change them by design, each tested on its own; the kinds of two inputs - Merge, Re-bond, Compare bonding, Join, Barrier - by their own tests; Number, given nothing; Add and Ensemble energy, which need values named, by their own tests, and change no atom; Reaction, which takes a reaction's two ends, tested on its own too; Displace, which needs vibrations, tested on its own too)
    const kinds = new Set(DOERS.map(([k]) => k));
    expect(KINDS.filter((k) => !kinds.has(k.kind)).map((k) => k.kind)).toEqual(["generate", "path-search", "reaction-path", "render", "check-structures", "stereoisomers", "descriptors", "enumerate", "chart", "energy-diagram", "species", "combine", "merge", "rebond", "compare-bonding", "join", "barrier", "torsion-restraints", "number", "add", "atom-map", "displace", "ensemble"]);
    expect(DOERS.length).toBeGreaterThanOrEqual(19);
  });

  it.each(DOERS)("%s, done by %s: what it is given, and what it gives", async (kind, by) => {
    const problems: string[] = [];
    const was = { prepared: asked.prepared.length, ran: asked.ran.length, calcs: calcsSaid };
    const holds = (["molecules", "conformers"] as const).filter((h) => takesBy(kind, by, h));
    for (let seed = 1; seed <= SEEDS; seed++) {
      saying = seed % 3 !== 0;
      const rng = random(1000 * seed + kind.length);
      problems.push(...(await trip(randomInput(rng, pick(rng, holds)), [[kind, by]], seed)));
    }
    // (and the sets that stress it most: the same atoms in another charge or spin, side by side)
    for (const [k, names] of HARD.entries()) {
      saying = true;
      for (const h of holds) problems.push(...(await trip({ holds: h, groups: names.map((n) => ({ species: species(n), frames: h === "conformers" ? 2 : 1 })) }, [[kind, by]], 100 + k)));
    }
    saying = true;
    expect(problems).toEqual([]);
    // (the plugin asked, with entries - and what said their charge and multiplicity back looked at)
    if (by !== "meno") expect(asked.prepared.length + asked.ran.length).toBeGreaterThan(was.prepared + was.ran);
    if (["xtb", "crest", "orca", "gaussian"].includes(by)) expect(calcsSaid).toBeGreaterThan(was.calcs);
  });

  it("through chains of steps, whoever does each", async () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 3 * SEEDS; seed++) {
      const rng = random(7919 * seed);
      saying = rng() < 0.7;
      const input = randomInput(rng, rng() < 0.5 ? "molecules" : "conformers");
      const chain: [StepKind, string][] = [];
      let holds: SetKind = input.holds;
      for (let n = between(rng, 2, 4); chain.length < n; ) {
        const can = DOERS.filter(([k, by]) => takesBy(k, by, holds));
        if (!can.length) break;
        const next = pick(rng, can);
        chain.push(next);
        holds = givesFor(next[0], holds);
      }
      problems.push(...(await trip(input, chain, seed)));
    }
    saying = true;
    expect(problems).toEqual([]);
  }, measured(290));
});

// --- structures drawn -----------------------------------------------------------------

/** A species drawn on the page: its atoms round its first, a bond's length out, its hydrogens drawn - at `(x, y)` - with ids from `id`. */
function drawn(s: Species, x: number, y: number, id: number): { atoms: Atom[]; bonds: WorkspaceDocument["model"]["bonds"] } {
  const atoms = s.atoms.map((a, i): Atom => {
    const turn = (2 * Math.PI * i) / Math.max(1, s.atoms.length - 1);
    return { id: id + i, el: a.el, x: i ? x + 1.8 * Math.cos(turn) : x, y: i ? y + 1.8 * Math.sin(turn) : y, r: 0.9, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}) };
  });
  return { atoms, bonds: s.bonds.map(([a1, a2, order], k) => ({ id: id + 50 + k, a: id + a1, b: id + a2, order: order as 1 | 2 | 3 })) };
}

describe("a conformer search on structures drawn keeps each one's charge and multiplicity", () => {
  it("in what RDKit is given, and in the conformers it gives", async () => {
    const problems: string[] = [];
    const cases = [...HARD, ...Array.from({ length: SEEDS }, (_, k) => {
      const rng = random(31 * (k + 1));
      return Array.from({ length: between(rng, 1, 4) }, () => pick(rng, SPECIES).name);
    })];
    for (const names of cases) {
      drawnAsked.length = 0;
      const doc = createWorkspaceDocument();
      const of = new Map<number, Species>();
      doc.edit("draw", (d) => {
        const model = { atoms: [...d.model.atoms], bonds: [...d.model.bonds] };
        names.forEach((n, i) => {
          const part = drawn(species(n), -400 + 12 * i, 0, 100 * (i + 1));
          part.atoms.forEach((a) => of.set(a.id, species(n)));
          model.atoms.push(...part.atoms);
          model.bonds.push(...part.bonds);
        });
        return { ...d, model, nextId: 100 * (names.length + 1) };
      });
      const { st } = storeOf(doc);
      const set = st().addSet({ x0: -500, y0: -50, x1: -10, y1: 50 });
      const step = st().addStep("conformers", "rdkit", 0, 0);
      st().connect({ set }, step);
      await st().runStep(step);
      const tag = `[${names.join(", ")}]`;
      const ran = st().steps.find((s) => s.id === step)!.ran;
      if (!ran?.ok) problems.push(`it did not run: ${ran?.said} ${tag}`);
      // what it was given: each structure's atoms in its molblock, their charges and radicals the drawing's - so its charge and multiplicity
      const marks = (atoms: readonly { el: string; charge?: number; radical?: Radical }[]) => atoms.map((a) => `${a.el}${a.charge ?? 0}${a.radical ?? ""}`).join(" ");
      if (drawnAsked.length !== names.length) problems.push(`RDKit was asked about ${drawnAsked.length} of ${names.length} structures ${tag}`);
      for (const block of drawnAsked) {
        const mol = readMolfile(block)!;
        const atoms = mol.atoms.map((a) => ({ el: a.symbol, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical } : {}) }));
        const s = names.map(species).find((x) => marks(x.atoms) === marks(atoms));
        const known = knownOf({ atoms, bonds: [] });
        if (!s) problems.push(`RDKit was given a structure unlike any drawn: ${marks(atoms)} ${tag}`);
        else if (known.charge !== s.charge || known.multiplicity !== s.multiplicity) problems.push(`RDKit was given ${s.name} with charge ${known.charge}, multiplicity ${known.multiplicity} ${tag}`);
      }
      // what it gave: each structure's conformers, a molecule in 3D of the drawing it was made from
      const made = resultOf(st(), step);
      const molecules = made ? setMembers(st(), made).molecules.map((id) => st().molecules3d.find((m) => m.id === id)!) : [];
      if (molecules.length !== names.length) problems.push(`${molecules.length} molecules came out of ${names.length} structures ${tag}`);
      for (const m of molecules) {
        const s = of.get(m.drawnFrom!.find((x) => x != null)!)!;
        for (const e of setEntries([m], "conformers")) {
          const now = stateOf(e);
          if (now.charge !== s.charge || now.multiplicity !== s.multiplicity) problems.push(`${s.name}, drawn, came out with ${said(now)}, not ${said(s)} ${tag}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

// --- what cannot be ---------------------------------------------------------------------

describe("the charge and multiplicity Meno gives a plugin", () => {
  it("is a multiplicity of at least one, odd where the entry's electrons are even and even where they are odd", () => {
    const NUMBERS: Record<string, number> = { H: 1, C: 6, N: 7, O: 8 };
    const radicals: (Radical | undefined)[] = [undefined, undefined, "singlet", "doublet", "triplet"];
    const rng = random(4242);
    for (let k = 0; k < 500; k++) {
      // (each species with its charges and radicals moved about at random: what a chemist may draw)
      const s = pick(rng, SPECIES);
      const atoms = s.atoms.map((a) => ({ el: a.el, x: 0, y: 0, z: 0, charge: between(rng, -2, 2), radical: pick(rng, radicals) }));
      const { charge, multiplicity } = knownOf({ atoms, bonds: [] });
      const electrons = atoms.reduce((n, a) => n + NUMBERS[a.el], 0) - Number(charge);
      expect(Number(multiplicity)).toBeGreaterThanOrEqual(1);
      // (not always one it can be: radicals drawn on more electrons than there are, or charges past them, are passed on as they are)
      expect(Math.abs((electrons - (Number(multiplicity) - 1)) % 2), JSON.stringify(atoms)).toBe(0);
    }
  });
});
