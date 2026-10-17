/**
 * A property test: whatever reads a molecule in 3D - an XYZ file, a PDB
 * file's models, a calculation's output, a copy or a saved workspace, a
 * reader's answer as the page checks it - its frames and what belongs to
 * each frame (its energy, its number among conformers, its share) stay
 * together, and every part of Meno that takes "frame k" takes the same one.
 *
 * Small molecules are made at random from fixed seeds, some of their
 * frames damaged - an atom short, an atom over, a coordinate that is no
 * number - their energies, numbers and shares each saying which frame they
 * were made for, so that one that lands on another frame is seen. Each
 * reader's molecule is then held to three things:
 *
 * (a) its energies, numbers and shares are one a frame it keeps
 *     (1 + frames.length) - or none;
 * (b) frame k as it is drawn (solidOf, frameOf) is the frame placesOf,
 *     the writers (frameAtoms, through SD and PDB) and bondsAt take for k;
 * (c) energy, number and share k are those made for the frame drawn as k -
 *     as the molecule holds them, as an SD file of every frame writes them
 *     and as a workflow's set takes them (setEntries).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerKinds } from "../../../../lib/io/kinds";
import { MANIFESTS } from "../../../../lib/plugins/known";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { readPdb } from "../../../../lib/chem/pdb";
import { checkedStructures, readStructures, type StructureRead } from "../../../../lib/io/structures";
import { combine } from "../../../../lib/calc/read";
import type { ReaderOutput } from "../../../../lib/calc/output";
import { bondsByDistance } from "../../../../utils/structureParsers";
import { readMoleculesFromText } from "../../../../utils/importers";
import { pdbFileText, structureFileText } from "../fileActions";
import type { Carried3D, Molecule3D } from "../store/types";
import { setEntries } from "../workflow/entries";
import { readCarried3D } from "./copyPaste";
import { placesOf } from "./edit3d";
import { calcResult } from "./io";
import { bondsAt, frameBondsOf, frameOf, solidOf, WORLD_PER_ANGSTROM } from "./molecule3d";

/** How many molecules each reader is given. */
const CASES = 200;
/** How near two coordinates are to be the same, in ångströms: the files written hold four places (SD) or three (PDB); those made hold three. */
const NEAR = 2e-3;

// ---------------------------------------------------------------------------
// Seeded randomness (mulberry32): the same cases every run.

type Rand = { next: () => number; int: (lo: number, hi: number) => number; pick: <T>(xs: readonly T[]) => T; chance: (p: number) => boolean };

function rand(seed: number): Rand {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, pick: (xs) => xs[int(0, xs.length - 1)], chance: (p) => next() < p };
}

// ---------------------------------------------------------------------------
// A molecule's frames as made, and the frames as a reader is given them.

type Damage = "short" | "long" | "nan";
/** One frame as the reader is given it: x, y, z of each atom - damaged, or whole. */
type Raw = { xyz: number[]; damage?: Damage };
type Made = {
  els: string[];
  /** Every frame as given, the first first. */
  raws: Raw[];
  /** Each frame's energy, number and share as given, where they are: each says the frame it was made for. */
  energies?: number[];
  numbers?: number[];
  shares?: number[];
};

const ELEMENTS = ["C", "N", "O", "S", "H"] as const;
const coordinate = (r: Rand) => Math.round((r.next() * 6 - 3) * 1000) / 1000;

/** Energy, number and share made for frame `j`, and back. */
const energyFor = (j: number) => -(100.25 + j);
const energyFrame = (e: number) => Math.round(-e - 100.25);
const numberFor = (j: number) => 3 + 2 * j;
const numberFrame = (k: number) => (k - 3) / 2;
const shareFor = (j: number) => (j + 1) / 1024;
const shareFrame = (s: number) => Math.round(s * 1024) - 1;

type MakeOptions = {
  /** Frames as given, the first included. */
  frames?: [number, number];
  /** How likely a frame (not the first, unless `firstToo`) is damaged; and which damages. */
  damage?: number;
  damages?: readonly Damage[];
  firstToo?: boolean;
  /** Whether energies (numbers, shares) are given; and whether, where no frame is damaged, their count may be wrong. */
  energies?: number;
  perFrame?: boolean;
  wrongCounts?: boolean;
};

function make(r: Rand, o: MakeOptions = {}): Made {
  // (three atoms or more: a frame an atom short still has two, its shape its own)
  const n = r.int(3, 6);
  const [lo, hi] = o.frames ?? [1, 7];
  const count = r.int(lo, hi);
  const els = Array.from({ length: n }, () => r.pick(ELEMENTS));
  const raws: Raw[] = [];
  for (let j = 0; j < count; j++) {
    const xyz = Array.from({ length: 3 * n }, () => coordinate(r));
    const damaged = (j > 0 || o.firstToo) && r.chance(o.damage ?? 0) ? r.pick(o.damages ?? (["short", "long", "nan"] as const)) : undefined;
    if (damaged === "short") raws.push({ xyz: xyz.slice(0, 3 * (n - 1)), damage: damaged });
    else if (damaged === "long") raws.push({ xyz: [...xyz, coordinate(r), coordinate(r), coordinate(r)], damage: damaged });
    else if (damaged === "nan") {
      xyz[r.int(0, 3 * n - 1)] = Number.NaN;
      raws.push({ xyz, damage: damaged });
    } else raws.push({ xyz });
  }
  const whole = raws.every((f) => !f.damage);
  // (a count of them that is wrong - one over or one short - only where every frame is whole: else no count is right)
  const counted = () => (o.wrongCounts && whole && r.chance(0.3) ? Math.max(0, count + r.pick([-1, 1])) : count);
  const given = (p: number) => r.chance(p);
  const per = o.perFrame !== false;
  return {
    els,
    raws,
    ...(given(o.energies ?? 0.7) ? { energies: Array.from({ length: counted() }, (_, j) => energyFor(j)) } : {}),
    ...(per && given(0.5) ? { numbers: Array.from({ length: counted() }, (_, j) => numberFor(j)) } : {}),
    ...(per && given(0.5) ? { shares: Array.from({ length: counted() }, (_, j) => shareFor(j)) } : {}),
  };
}

/** A frame's coordinates about their centre; null where one is no number. */
function centred(xyz: ArrayLike<number>, scale = 1): number[] | null {
  const n = Math.floor(xyz.length / 3);
  const out = Array.from(xyz, (v) => v / scale);
  if (!out.every(Number.isFinite)) return null;
  for (let c = 0; c < 3; c++) {
    let mid = 0;
    for (let i = 0; i < n; i++) mid += out[3 * i + c];
    mid /= n || 1;
    for (let i = 0; i < n; i++) out[3 * i + c] -= mid;
  }
  return out;
}

const close = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a.length === b.length && Array.from(a).every((v, i) => (Number.isNaN(v) && Number.isNaN(b[i])) || Math.abs(v - b[i]) < NEAR);

/** Which frame as given a frame drawn is - by its shape, as drawing centres it: "nan" where it holds no numbers to tell; -1, none. */
function drawnFrame(made: Made, solidFrame: ArrayLike<number>): number | "nan" | -1 {
  const c = centred(solidFrame, WORLD_PER_ANGSTROM);
  if (!c) return "nan";
  const j = made.raws.findIndex((f) => {
    const g = centred(f.xyz);
    return g !== null && close(g, c);
  });
  return j;
}

/** Which frame as given a frame of coordinates is, where they are: -1, none. */
function givenFrame(made: Made, xyz: ArrayLike<number>): number {
  return made.raws.findIndex((f) => close(f.xyz, xyz));
}

/** Whether a frame drawn (`drawn`) and one taken (`taken`) are the same frame as given. */
const sameFrame = (made: Made, drawn: number | "nan" | -1, taken: number) =>
  drawn === "nan" ? taken >= 0 && made.raws[taken].damage === "nan" : drawn >= 0 && drawn === taken;

const bondKeys = (bonds: readonly { a1: number; a2: number }[]) =>
  bonds
    .map((b) => (b.a1 < b.a2 ? `${b.a1}-${b.a2}` : `${b.a2}-${b.a1}`))
    .sort()
    .join(" ");

const xyzOf = (atoms: readonly { x: number; y: number; z: number }[]) => atoms.flatMap((a) => [a.x, a.y, a.z]);

// ---------------------------------------------------------------------------
// What every molecule a reader gives is held to.

type Drawn = Parameters<typeof structureFileText>[0];

/** The SD file of a molecule's frame `k` (or every frame), read back: each record's coordinates, and its energy where it says one. */
function sdBack(m: Molecule3D, k: number | "all"): { xyz: number[]; energy?: number }[] {
  const carried: Carried3D = { ...m, ...(k === "all" ? {} : { frame: k }) };
  const text = structureFileText({ atoms: [], bonds: [], molecules3d: [carried] } as unknown as Drawn, "/tmp/frames.sdf", k === "all" ? { frames: "all" } : {});
  return text
    .split("$$$$\n")
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [mol] = readMoleculesFromText(rec + "$$$$\n", "sdf");
      const e = /> <Energy \(Eh\)>\n(\S+)/.exec(rec);
      return { xyz: xyzOf(mol.atoms), ...(e ? { energy: Number(e[1]) } : {}) };
    });
}

/** The PDB file of a molecule's frame `k` (or every frame), read back: each model's coordinates. */
function pdbBack(m: Molecule3D, k: number | "all"): number[][] {
  const carried: Carried3D = { ...m, ...(k === "all" ? {} : { frame: k }) };
  const text = pdbFileText([carried], k === "all" ? { frames: "all" } : {});
  return readPdb(text).models.map((model) => xyzOf(model.atoms));
}

/** What is wrong with a molecule a reader gave from `made`: nothing, an empty list. */
function problems(made: Made, m: Molecule3D): string[] {
  const out: string[] = [];
  const kept = 1 + (m.frames?.length ?? 0);
  const solid = solidOf(m, STYLE_3D);
  // (a) one of each a frame kept, or none
  if (solid.frames.length !== kept) out.push(`(a) drawn with ${solid.frames.length} frames of the ${kept} it keeps`);
  const present = frameBondsOf(m)?.present;
  if (present && present.length !== solid.frames.length) out.push(`(a) bonds found for ${present.length} frames of the ${solid.frames.length} drawn`);
  for (const [name, v] of [["energies", m.energies], ["numbers", m.numbers], ["shares", m.shares]] as const) {
    if (v && v.length !== kept) out.push(`(a) ${v.length} ${name} for ${kept} frames kept`);
  }

  // which frame as given each frame drawn is; the order they were given in kept
  const drawn = solid.frames.map((f) => drawnFrame(made, f));
  if (drawn.some((d) => d === -1)) out.push(`(b) a frame drawn is none given: ${JSON.stringify(drawn)}`);
  const told = drawn.filter((d): d is number => typeof d === "number" && d >= 0);
  if (told.some((d, i) => i > 0 && d <= told[i - 1])) out.push(`(b) frames drawn out of the order given: ${JSON.stringify(drawn)}`);
  // (a frame drawn that holds no number to tell it by: which it is, as the molecule holds it)
  const identity = (f: number) => {
    const d = drawn[f];
    return d === "nan" ? givenFrame(made, placesOf(m, f)) : d;
  };

  // (b) frame k drawn, measured, written and bonded alike - k in range, and out of it as a view or a file may ask
  const ks = new Set([-1, ...Array.from({ length: kept }, (_, k) => k), kept, kept + 1, ...(Number.isInteger((m as Carried3D).frame) ? [(m as Carried3D).frame!] : [])]);
  for (const k of ks) {
    // (a frame asked for past the last, or before the first, as a view kept from before or a file may ask: drawn as the last, or the first)
    const at = k < 0 ? `frame ${k} (before the first)` : k >= kept ? `frame ${k} (past the last, ${kept - 1})` : `frame ${k}`;
    const d = drawn[frameOf(solid, k)];
    const measured = givenFrame(made, placesOf(m, k));
    if (!sameFrame(made, d, measured)) out.push(`(b) ${at}: drawn ${d}, measured (edit3d placesOf) ${measured}`);
    if (d === "nan") continue;
    const sd = givenFrame(made, sdBack(m, k)[0].xyz);
    if (!sameFrame(made, d, sd)) out.push(`(b) ${at}: drawn ${d}, written to SD (fileActions frameAtoms) ${sd}`);
    const pdb = givenFrame(made, pdbBack(m, k)[0]);
    if (!sameFrame(made, d, pdb)) out.push(`(b) ${at}: drawn ${d}, written to PDB (fileActions frameAtoms) ${pdb}`);
    if (m.bondsFrom === "distance" && d >= 0) {
      const raw = made.raws[d].xyz;
      const want = bondKeys(bondsByDistance(m.atoms.map((a, i) => ({ el: a.el, x: raw[3 * i], y: raw[3 * i + 1], z: raw[3 * i + 2] }))));
      if (bondKeys(bondsAt(m, k)) !== want) out.push(`(b) ${at}: bondsAt gives other bonds than drawn frame ${d} has`);
    }
  }

  // (c) what belongs to frame f, with the frame drawn as f
  for (let f = 0; f < solid.frames.length; f++) {
    const id = identity(f);
    if (m.energies && f < m.energies.length && energyFrame(m.energies[f]) !== id) out.push(`(c) energy ${f} made for frame ${energyFrame(m.energies[f])}, drawn as frame ${f}: ${id}`);
    if (m.numbers && f < m.numbers.length && numberFrame(m.numbers[f]) !== id) out.push(`(c) number ${f} made for frame ${numberFrame(m.numbers[f])}, drawn as frame ${f}: ${id}`);
    if (m.shares && f < m.shares.length && shareFrame(m.shares[f]) !== id) out.push(`(c) share ${f} made for frame ${shareFrame(m.shares[f])}, drawn as frame ${f}: ${id}`);
  }
  if (drawn.every((d) => d !== "nan")) {
    // every frame to an SD file: each record a frame drawn, in order, with that frame's energy
    const records = sdBack(m, "all");
    if (records.length !== solid.frames.length) out.push(`(b) an SD file of every frame holds ${records.length} records for ${solid.frames.length} frames drawn`);
    records.forEach((rec, i) => {
      const g = givenFrame(made, rec.xyz);
      if (g !== drawn[i]) out.push(`(b) SD record ${i + 1} is frame ${g}, drawn as ${drawn[i]}`);
      if (rec.energy !== undefined && energyFrame(rec.energy) !== g) out.push(`(c) SD record ${i + 1} (frame ${g}) says the energy made for frame ${energyFrame(rec.energy)}`);
    });
    // every frame to a PDB file: a model each, in order
    const models = pdbBack(m, "all");
    if (models.length !== solid.frames.length) out.push(`(b) a PDB file of every frame holds ${models.length} models for ${solid.frames.length} frames drawn`);
    models.forEach((xyz, i) => {
      const g = givenFrame(made, xyz);
      if (g !== drawn[i]) out.push(`(b) PDB model ${i + 1} is frame ${g}, drawn as ${drawn[i]}`);
    });
  }
  // a workflow's set: each entry's geometry, energy and number one frame's
  setEntries([m], "conformers").forEach((e, f) => {
    const g = givenFrame(made, e.xyz);
    if (!sameFrame(made, drawn[f], g)) out.push(`(b) set entry ${f} is frame ${g}, drawn as ${drawn[f]}`);
    if (e.energy !== undefined && energyFrame(e.energy) !== g) out.push(`(c) set entry ${f} (frame ${g}) has the energy made for frame ${energyFrame(e.energy)}`);
    if (m.numbers && numberFrame(e.number) !== g) out.push(`(c) set entry ${f} (frame ${g}) has the number made for frame ${numberFrame(e.number)}`);
  });
  return out;
}

/** Runs `CASES` seeded cases, each a molecule read - or refused - and gathers what is wrong, the seed with each. */
function run(
  path: string,
  one: (r: Rand) => { made: Made; read: () => Molecule3D[]; also?: (m: Molecule3D) => string[] },
): { failures: string[]; refused: number; read: number; withEnergies: number } {
  const failures: string[] = [];
  let refused = 0;
  let read = 0;
  // (molecules of several frames that kept their energies: what (c) is a test of)
  let withEnergies = 0;
  for (let seed = 1; seed <= CASES; seed++) {
    const { made, read: reading, also } = one(rand(seed * 7919 + path.length));
    let ms: Molecule3D[];
    try {
      ms = reading();
    } catch {
      refused++;
      continue;
    }
    read++;
    for (const m of ms) {
      if (m.energies && m.frames?.length) withEnergies++;
      let wrong: string[];
      try {
        wrong = [...problems(made, m), ...(also?.(m) ?? [])];
      } catch (e) {
        // (a molecule a reader gave that what takes its frames cannot take)
        wrong = [`taking its frames threw: ${e instanceof Error ? e.message.replace(/\d+(\.\d+)?/g, "#") : String(e)}`];
      }
      const given = `${path} seed ${seed} (frames ${made.raws.map((f) => f.damage ?? "whole").join(",")}; energies ${made.energies?.length ?? "none"})`;
      for (const w of wrong) failures.push(`${w} - ${given}`);
    }
  }
  return { failures: summary(failures), refused, read, withEnergies };
}

/** What went wrong, each kind of thing once - its numbers left out - with how often, and its first case. */
function summary(failures: readonly string[]): string[] {
  const kinds = new Map<string, { count: number; first: string }>();
  for (const f of failures) {
    const kind = f.split(" - ")[0].replace(/-?\d+/g, "#");
    const k = kinds.get(kind);
    if (k) k.count++;
    else kinds.set(kind, { count: 1, first: f });
  }
  return [...kinds.values()].map((k) => `x${k.count}: ${k.first}`);
}

const placed = (m: object, id = 1): Molecule3D => ({ ...(m as Omit<Molecule3D, "id" | "at">), id, at: { x: 0, y: 0 } });

// ---------------------------------------------------------------------------
// The readers.

/** An XYZ file of `made`: each frame's count and comment line - its energy, as xtb, ORCA or CREST write it, or none - and its atoms. */
function xyzText(r: Rand, made: Made): string {
  const label = (j: number) => {
    const e = made.energies?.[j];
    if (e === undefined) return `frame ${j + 1}`;
    return r.pick([
      () => ` energy: ${e.toFixed(8)} gnorm: 0.00012345 xtb: 6.7.1 (edcfbbe)`,
      () => `Coordinates from ORCA-job opt E ${e.toFixed(6)}`,
      () => `  ${e.toFixed(8)}`,
    ])();
  };
  const crlf = r.chance(0.15);
  const lines = made.raws.flatMap((f, j) => {
    const n = f.xyz.length / 3;
    const els = Array.from({ length: n }, (_, i) => made.els[i] ?? "H");
    return [String(n), label(j), ...els.map((el, i) => `${el} ${[0, 1, 2].map((c) => (Number.isNaN(f.xyz[3 * i + c]) ? "nan" : f.xyz[3 * i + c].toFixed(3))).join(" ")}`)];
  });
  return lines.join(crlf ? "\r\n" : "\n") + (r.chance(0.3) ? "\n\n" : "\n");
}

/** A PDB file of `made`: a MODEL for each frame - a damaged one an atom short or an atom over - HETATM records in fixed columns. */
function pdbText(made: Made): string {
  const out: string[] = [];
  made.raws.forEach((f, j) => {
    out.push(`MODEL     ${String(j + 1).padStart(4)}`);
    const n = f.xyz.length / 3;
    for (let i = 0; i < n; i++) {
      const el = made.els[i] ?? "H";
      const c = (v: number) => (Number.isNaN(v) ? "     nan" : v.toFixed(3).padStart(8));
      out.push(
        `HETATM${String(i + 1).padStart(5)} ${(el + (i + 1)).padEnd(4)} UNL A   1    ${c(f.xyz[3 * i])}${c(f.xyz[3 * i + 1])}${c(f.xyz[3 * i + 2])}  1.00  0.00          ${el.padStart(2)}`,
      );
    }
    out.push("ENDMDL");
  });
  out.push("END");
  return out.join("\n") + "\n";
}

// (XYZ energies are read by the patterns of the plugins added: those of the programs that write them)
beforeAll(() => registerKinds(MANIFESTS.filter((m) => ["xtb", "crest", "orca"].includes(m.id))));
afterAll(() => registerKinds([]));

describe("a molecule's frames and what belongs to each stay together, whatever reads it", () => {
  it("an XYZ file, as the page takes it (readStructures, then checkedStructures)", () => {
    const { failures, refused, read, withEnergies } = run("xyz", (r) => {
      const made = make(r, { damage: 0.15, firstToo: true, perFrame: false });
      const text = xyzText(r, made);
      return { made, read: () => checkedStructures(readStructures("xyz", "frames.xyz", text), "frames.xyz").molecules3d!.map((m) => placed(m)) };
    });
    expect(read).toBeGreaterThan(CASES / 3);
    expect(refused + read).toBe(CASES);
    // (energies kept on molecules of several frames: (c) is tested)
    expect(withEnergies).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });

  it("a PDB file's models (readStructures)", () => {
    const { failures, read } = run("pdb", (r) => {
      // (a damaged model: an atom short or an atom over - one whose place does not read is left out, and so short)
      const made = make(r, { damage: 0.15, damages: ["short", "long"], firstToo: true, energies: 0, perFrame: false });
      const text = pdbText(made);
      return {
        made,
        read: () => {
          const ms = checkedStructures(readStructures("pdb", "frames.pdb", text), "frames.pdb").molecules3d!;
          return ms.map((m, i) => placed(m, i + 1));
        },
      };
    });
    expect(read).toBeGreaterThan(CASES / 2);
    expect(failures).toEqual([]);
  });

  it("a calculation's output, its readers' findings put together (combine, then calcResult)", () => {
    const { failures, read, withEnergies } = run("calc", (r) => {
      const made = make(r, { damage: 0.2, perFrame: false, wrongCounts: true });
      const output: ReaderOutput = { atoms: made.els, frames: made.raws.map((f) => f.xyz), ...(made.energies ? { energies: made.energies } : {}) };
      // (one reader, or two: the first gives the geometries alone, the second the energies as well)
      const found = r.chance(0.5)
        ? [{ from: "a", version: "1", output }]
        : [
            { from: "a", version: "1", output: { ...output, energies: null } },
            { from: "b", version: "1", output },
          ];
      return {
        made,
        read: () => {
          const { output: put, readers } = combine(found);
          return calcResult(put, readers, "frames.out").molecules3d!.map((m) => placed(m));
        },
      };
    });
    expect(read).toBeGreaterThan(CASES / 2);
    // (energies kept on molecules of several frames: (c) is tested)
    expect(withEnergies).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });

  it("a calculation's output as one reader gives it (calcResult)", () => {
    const { failures, read, withEnergies } = run("calc1", (r) => {
      const made = make(r, { damage: 0.2, perFrame: false, wrongCounts: true });
      const output: ReaderOutput = { atoms: made.els, frames: made.raws.map((f) => f.xyz), ...(made.energies ? { energies: made.energies } : {}) };
      return { made, read: () => calcResult(output, ["a 1"], "frames.out").molecules3d!.map((m) => placed(m)) };
    });
    expect(read).toBeGreaterThan(CASES / 2);
    // (energies kept on molecules of several frames: (c) is tested)
    expect(withEnergies).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });

  it("a molecule carried in a copy or a saved workspace (readCarried3D), the frame it showed with it", () => {
    const { failures, read, withEnergies } = run("carried", (r) => {
      const made = make(r, { damage: 0.2, wrongCounts: true });
      const [first, ...rest] = made.raws;
      const atoms = made.els.map((el, i) => ({ el, x: first.xyz[3 * i], y: first.xyz[3 * i + 1], z: first.xyz[3 * i + 2] }));
      const shown = rest.length && r.chance(0.7) ? r.int(1, rest.length) : 0;
      const carried = {
        atoms,
        bonds: bondsByDistance(atoms),
        at: { x: 0, y: 0 },
        bondsFrom: "distance",
        conformerSet: true,
        ...(rest.length ? { frames: rest.map((f) => f.xyz) } : {}),
        ...(made.energies ? { energies: made.energies } : {}),
        ...(made.numbers ? { numbers: made.numbers } : {}),
        ...(made.shares ? { shares: made.shares } : {}),
        // (the frame it showed, as the view kept it: one it had)
        ...(shown ? { frame: shown } : {}),
      };
      // (as a copy or a file carries it: JSON, where a coordinate that is no number is null)
      const text = JSON.stringify(carried);
      return {
        made,
        read: () => {
          const m = readCarried3D(JSON.parse(text));
          if (!m) throw new Error("not read");
          return [{ ...m, id: 1 } as Molecule3D];
        },
        // (the frame it showed - a whole one - is the frame it shows, read back)
        also: (m) => {
          if (made.raws[shown].damage) return [];
          const solid = solidOf(m, STYLE_3D);
          const now = drawnFrame(made, solid.frames[frameOf(solid, (m as Carried3D).frame)]);
          return now === shown ? [] : [`(b) it showed frame ${shown}, and shows ${now} read back (frame ${(m as Carried3D).frame ?? 0} of ${solid.frames.length})`];
        },
      };
    });
    expect(read).toBeGreaterThan(CASES / 2);
    // (energies kept on molecules of several frames: (c) is tested)
    expect(withEnergies).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });

  it("a reader's answer of structures, as the page checks any reader's (checkedStructures)", () => {
    const { failures, refused, read, withEnergies } = run("checked", (r) => {
      const made = make(r, { damage: 0.1, firstToo: false, perFrame: false, wrongCounts: true });
      const [first, ...rest] = made.raws;
      const atoms = made.els.map((el, i) => ({ el, x: first.xyz[3 * i], y: first.xyz[3 * i + 1], z: first.xyz[3 * i + 2] }));
      const answer: StructureRead = {
        model: { atoms: [], bonds: [] },
        centroid: { x: 0, y: 0 },
        molecules3d: [
          {
            atoms,
            bonds: bondsByDistance(atoms),
            bondsFrom: "distance",
            ...(rest.length ? { frames: rest.map((f) => f.xyz) } : {}),
            ...(made.energies ? { energies: made.energies } : {}),
          },
        ],
      };
      return { made, read: () => checkedStructures(JSON.parse(JSON.stringify(answer)), "frames.sdf").molecules3d!.map((m) => placed(m)) };
    });
    expect(refused + read).toBe(CASES);
    // (energies kept on molecules of several frames: (c) is tested)
    expect(withEnergies).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });
});
