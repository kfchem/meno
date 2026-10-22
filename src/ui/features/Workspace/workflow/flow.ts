/**
 * How a workflow's parts are joined (docs/WORKFLOWS.md, *Wires*): what
 * each port gives, what may be wired to what, what comes into a step, and
 * what state a step is in.
 */
import type { WorkspaceDocument } from "../document";
import type { Model, Molecule3D, Wire, WireEnd, WorkflowSet, WorkflowStep } from "../store/types";
import { signatureOf } from "../utils/drawnLink";
import { conformersOfOne, entryOfSet, holdsOf, plainAmong, setEntries, setMembers, setMolecules, type SetEntry } from "./entries";
import { moleculesAsTable, type Table } from "../../../../lib/table";
import { levelOf } from "../../../../lib/calc/output";
import { exitOf, inputsOf, ONE_INPUT, optionsOf, portOf, readsAsTable, takenBy, type SetHolds, type SetKind, type ValueKind, isSetKind } from "./kinds";
import { byOf, optionsFor, takesBy } from "./doers";

type Flow = Pick<WorkspaceDocument, "model" | "molecules3d" | "sets" | "steps" | "wires" | "pictures">;

export const stepOf = (doc: Flow, id: number): WorkflowStep | undefined => doc.steps?.find((s) => s.id === id);
export const findSet = (doc: Flow, id: number): WorkflowSet | undefined => doc.sets?.find((b) => b.id === id);

/** The wire into a step's input, where it has one; its first input where none is named. */
export const wireInto = (doc: Flow, step: number, port?: string): Wire | undefined =>
  doc.wires?.find((w) => w.to.step === step && (port == null || w.to.port === port));

/** The wires into a step, one for each of its inputs that has one. */
export const wiresInto = (doc: Flow, step: number): Wire[] => (doc.wires ?? []).filter((w) => w.to.step === step);

/** The set a step's exit made - its first exit where none is named - which stands whether or not it has run. */
export const resultOf = (doc: Flow, step: number, exit?: string): WorkflowSet | undefined =>
  doc.sets?.find((b) => b.made?.step === step && (exit == null ? b.made.exit === exitOf(stepOf(doc, step)?.kind ?? "optimise", "").id : b.made.exit === exit));

/** The sets a step's exits made, in the kind's order. */
export const resultsOf = (doc: Flow, step: number): WorkflowSet[] => (doc.sets ?? []).filter((b) => b.made?.step === step);

/** What a port gives: a set, the kind of set it holds; a step, what it made - or, not run, what it will make of what comes into it. Null where that is not known yet. */
export function givesOf(doc: Flow, end: WireEnd, seen: ReadonlySet<number> = new Set()): SetHolds | null {
  const given = findSet(doc, end.set);
  if (!given) return null;
  // (a chemist's set: what lies in it; a step's exit, run: what it made)
  if (!given.made) return holdsOf(doc, given);
  if (given.made.holds) return given.made.holds;
  // (not run yet: what that exit will give of what comes into its step)
  const step = stepOf(doc, given.made.step);
  if (!step || seen.has(step.id)) return null;
  const g = exitOf(step.kind, given.made.exit).gives;
  if (g !== "same") return g;
  const into = wireInto(doc, step.id);
  return into ? givesOf(doc, into.from, new Set([...seen, step.id])) : null;
}


/** The steps before a step, nearest first, as its wires lead back. */
export function stepsBefore(doc: Flow, step: number): number[] {
  const out: number[] = [];
  const todo = wiresInto(doc, step).map((w) => w.from);
  for (let guard = 0; todo.length && guard < 1000; guard++) {
    const at = todo.shift()!;
    const made = findSet(doc, at.set)?.made?.step;
    if (made == null || out.includes(made) || made === step) continue;
    out.push(made);
    todo.push(...wiresInto(doc, made).map((w) => w.from));
  }
  return out;
}

/** Whether a wire may go from `from` into the step `to` (`wireRefusal`: none). */
export function canWire(doc: Flow, from: WireEnd, to: number, port: string = ONE_INPUT): boolean {
  return wireRefusal(doc, from, to, port) == null;
}

/** A kind of set, as a step's card says what it takes and what came. */
const SET_WORDS: Record<ValueKind, string> = { structures: "structures drawn", molecules: "molecules in 3D", conformers: "a conformer set", table: "a table", number: "a number" };

/**
 * Why a wire may not go from `from` into the step `to`, in plain words;
 * none where it may: the step - done by whom it is - takes what it gives,
 * or what that is is not known yet; and no loop is made.
 */
export function wireRefusal(doc: Flow, from: WireEnd, to: number, port: string = ONE_INPUT): string | null {
  const step = stepOf(doc, to);
  const set = findSet(doc, from.set);
  if (!step || !set) return "It is not there";
  if (set.made?.step === to) return "It is what this step gives";
  // (nothing it gives may come back round to it)
  const madeBy = set.made?.step;
  if (madeBy != null && [madeBy, ...stepsBefore(doc, madeBy)].includes(to)) return "It comes from this step: a wire back would make a loop";
  const holds = givesOf(doc, from);
  // (pictures - a Render step's - and charts no step takes)
  if (holds === "pictures" || holds === "chart") return holds === "chart" ? "A chart goes into no step" : "Pictures go into no step";
  if (holds == null) return null;
  // (a set mixing conformer sets with other molecules, which no step takes as its entries: which are the others - one read as a table takes it, each molecule as it is)
  const mixed = holds === "molecules" && !set.made && !readsAsTable(step.kind, port) ? plainAmong(setMolecules(doc, set)) : null;
  if (mixed) return mixed;
  // (the input it goes to takes what it gives; a kind that takes one holds to what the doer takes of it)
  const several = inputsOf(step.kind).length > 1;
  const takes = portOf(step.kind, port).takes.filter((k) => several || takesBy(step.kind, byOf(step), k));
  // (molecules or conformer sets into a port that takes a table, seen as one: kinds `takenBy`)
  if (takenBy(takes, holds)) return null;
  const wants = takes.length ? takes.map((k) => SET_WORDS[k]).join(" or ") : "nothing that is given";
  return `It takes ${wants}, not ${SET_WORDS[holds]}`;
}

/** What comes into a step: the kind of set, and its molecules in 3D and structures drawn, in order. Null where nothing does - or what would has not been made yet, or is pictures, which no step takes. */
export function inputOf(doc: Flow, step: number, port?: string): { holds: SetKind; molecules: Molecule3D[]; structures: number[][] } | null {
  const from = wireInto(doc, step, port)?.from;
  if (!from) return null;
  const set = findSet(doc, from.set);
  if (!set) return null;
  const holds = holdsOf(doc, set);
  // (a table, a number, a chart - no entries to give a step that works on them)
  if (!isSetKind(holds)) return null;
  const { structures } = setMembers(doc, set);
  return { holds, molecules: setMolecules(doc, set), structures };
}

/** The table a set holds that comes into a step - read from a file, or a step's: none where what comes in holds none. */
export function tableWired(doc: Flow, step: number, port?: string): Table | null {
  const from = wireInto(doc, step, port)?.from;
  return (from && findSet(doc, from.set)?.table) || null;
}

/**
 * What comes into a step as a table (lib/table, docs/WORKFLOWS.md
 * *Tables*): the table a set holds; or molecules in 3D seen as one, an
 * entry a row (`moleculesAsTable`) - named for the molecule and frame it is
 * ("molecule:3#2"), its molecule's title where it has one, and its energy
 * with the program and level that worked it out, where the molecule's
 * calculation says them. None where nothing comes in, or what does is
 * structures drawn, pictures or a chart.
 */
export function tableInto(doc: Flow, step: number, port?: string): Table | null {
  const table = tableWired(doc, step, port);
  if (table) return table;
  const input = inputOf(doc, step, port);
  if (!input || input.holds === "structures") return null;
  const titles = new Map(input.molecules.flatMap((m) => (m.title ? [[m.id, m.title] as const] : [])));
  const by = new Map(input.molecules.map((m) => [m.id, m.calc && (m.calc.program || levelOf(m.calc)) ? { ...(m.calc.program ? { program: m.calc.program } : {}), ...(levelOf(m.calc) ? { method: levelOf(m.calc) } : {}) } : undefined]));
  // (each molecule as it is - a conformer set's frames its conformers, another's each an entry of its own - in a set that mixes them too)
  let compounds = 0;
  const entries = input.molecules.flatMap((m) => {
    const es = setEntries([m], conformersOfOne(m) ? "conformers" : "molecules").map((e) => ({ ...e, compound: compounds + e.compound }));
    compounds += new Set(es.map((e) => e.compound)).size;
    return es;
  });
  return moleculesAsTable(
    entries.map((e: SetEntry) => {
      const made = entryOfSet(e, `molecule:${e.from}#${e.frame ?? 0}`);
      const title = e.from != null ? titles.get(e.from) : undefined;
      const entry = title ? { ...made, properties: { title: { value: title, unit: "none" as const, status: "computed" as const }, ...made.properties } } : made;
      const energy = entry.properties.energy;
      const how = e.from != null ? by.get(e.from) : undefined;
      return energy && how ? { ...entry, properties: { ...entry.properties, energy: { ...energy, by: how } } } : entry;
    }),
  );
}

/** The molecule in 3D on the page, and its frame, a row of molecules seen as a table is of (`tableInto`): none where it names none, or that molecule is not on the page. */
export function entryOnPage(doc: Pick<Flow, "molecules3d">, entry: string | undefined): { molecule: number; frame: number } | null {
  const m = entry != null ? /^molecule:(\d+)#(\d+)$/.exec(entry) : null;
  if (!m) return null;
  const molecule = Number(m[1]);
  return (doc.molecules3d ?? []).some((x) => x.id === molecule) ? { molecule, frame: Number(m[2]) } : null;
}

/** A table's columns and rows as text, for a step's key: worked out once for each table - a table changed is a new one. */
const tableTexts = new WeakMap<Table, string>();
function tableText(t: Table): string {
  let text = tableTexts.get(t);
  if (text == null) tableTexts.set(t, (text = JSON.stringify([t.columns, t.rows])));
  return text;
}

/** FNV-1a over a string: a short key for what came into a step. */
function hash(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * What a molecule in 3D adds to a step's key, as text: worked out once for
 * each molecule - a molecule changed is a new one - since every step's key
 * is asked on every edit, and a trajectory's frames are many.
 */
const keyed = new WeakMap<Molecule3D, readonly string[]>();
function keyTexts(m: Molecule3D): readonly string[] {
  let texts = keyed.get(m);
  if (!texts) {
    texts = [
      // (an atom's charge, radical and isotope too: a step run on the neutral molecule has not run on its anion)
      m.atoms.map((a) => `${a.el}${a.charge ? `(${a.charge})` : ""}${a.radical ? `[${a.radical}]` : ""}${a.isotope ? `{${a.isotope}}` : ""}${a.x.toFixed(5)},${a.y.toFixed(5)},${a.z.toFixed(5)}`).join(";"),
      `${m.bonds.map((b) => `${b.a1}-${b.a2}:${b.order}`).join(";")}|${(m.frames ?? []).map((f) => f.map((v) => v.toFixed(5)).join(",")).join(";")}`,
      `${(m.energies ?? []).join(",")}|${(m.numbers ?? []).join(",")}|${(m.shares ?? []).join(",")}|${(m.degeneracies ?? []).join(",")}${m.partOf ? "|part" : ""}`,
    ];
    keyed.set(m, texts);
  }
  return texts;
}

/**
 * What a drawn structure adds to a step's key, as text: what it is - its
 * atoms' elements, charges, masses and radicals, its bonds' orders, wedges
 * and dative bonds (`signatureOf`) - and what its drawing says by where
 * things lie: on which side of each double bond each neighbour is, the
 * other end's taken together (cis or trans), and the order the neighbours
 * go round each atom a wedge starts from. Not where it is drawn: moved
 * whole, turned, or an atom nudged without crossing a line that matters, it
 * is the same; mirrored, its wedged centres are not.
 */
const drawnKeyed = new WeakMap<Model, Map<string, string>>();
function drawnKey(model: Model, ids: readonly number[]): string {
  const known = drawnKeyed.get(model) ?? new Map<string, string>();
  drawnKeyed.set(model, known);
  const name = ids.join(",");
  const had = known.get(name);
  if (had != null) return had;
  const of = new Set(ids);
  const at = new Map(model.atoms.filter((a) => of.has(a.id)).map((a) => [a.id, a]));
  const near = new Map<number, number[]>();
  const bonds = model.bonds.filter((b) => at.has(b.a) && at.has(b.b));
  for (const b of bonds) {
    near.set(b.a, [...(near.get(b.a) ?? []), b.b]);
    near.set(b.b, [...(near.get(b.b) ?? []), b.a]);
  }
  const said: string[] = [];
  for (const a of at.values()) if (a.radical) said.push(`r${a.id}:${a.radical}`);
  for (const b of bonds) {
    if (b.dative) said.push(`d${b.a}-${b.b}`);
    if (b.order === 2) {
      // (each neighbour's side of the line through the bond, measured the same way at both ends)
      const p = at.get(b.a)!;
      const q = at.get(b.b)!;
      const side = (id: number) => {
        const n = at.get(id)!;
        return Math.sign((q.x - p.x) * (n.y - p.y) - (q.y - p.y) * (n.x - p.x));
      };
      for (const n of near.get(b.a) ?? []) if (n !== b.b) for (const m of near.get(b.b) ?? []) if (m !== b.a) said.push(`${n}~${m}:${side(n) * side(m)}`);
    }
    if (b.stereo && b.stereo !== "none") {
      // (round the atom it starts from, anticlockwise, from its lowest-numbered neighbour)
      const c = at.get(b.a)!;
      const round = (near.get(b.a) ?? [])
        .map((id) => ({ id, angle: Math.atan2(at.get(id)!.y - c.y, at.get(id)!.x - c.x) }))
        .sort((u, v) => u.angle - v.angle)
        .map((u) => u.id);
      const first = round.indexOf(Math.min(...round));
      said.push(`w${b.a}:${[...round.slice(first), ...round.slice(0, first)].join(">")}`);
    }
  }
  const key = `${signatureOf(model, ids)}|${said.sort().join(",")}`;
  known.set(name, key);
  return key;
}

/** A key for what a step would run on: what comes into it, its options, and who does it - so that its card can say it has changed since its run. */
export function inputKey(doc: Flow, step: WorkflowStep, by: string): string {
  const options = JSON.stringify(optionsOf(optionsFor(step.kind, by), step.options));
  const ports = inputsOf(step.kind);
  // (a kind of several inputs: each one's own, in turn - none where its first has nothing coming in; the names its molecules go by too, which an energy diagram's levels are)
  if (ports.length > 1) {
    const keys = ports.map((p) => portKey(doc, step.id, p.id, true));
    if (keys[0] == null) return "";
    return hash(keys.map((k) => k ?? "-").join("|"), hash(`${step.kind}|${by}|${options}`)).toString(36);
  }
  return portKey(doc, step.id, undefined, false, `${step.kind}|${by}|${options}`) ?? "";
}

/** A key for what comes into one of a step's inputs - a table's columns and rows, molecules' atoms, places and energies, structures as drawn - and `named`, the names its molecules go by; none where nothing does. */
function portKey(doc: Flow, step: number, port: string | undefined, named: boolean, prefix = ""): string | null {
  // (a table: its columns and rows, as they are)
  const table = tableWired(doc, step, port);
  if (table) return hash(tableText(table), hash(`table|${prefix}`)).toString(36);
  const input = inputOf(doc, step, port);
  if (!input) return null;
  let h = hash(`${input.holds}|${prefix}`);
  for (const m of input.molecules) {
    for (const text of keyTexts(m)) h = hash(text, h);
    if (named) h = hash(`${m.title ?? ""}|${m.name ?? ""}`, h);
  }
  for (const s of input.structures) h = hash(drawnKey(doc.model, s), h);
  return h.toString(36);
}

/** The jobs a page's steps have waiting or running, by id (docs/WORKFLOWS.md, *When Meno closes*). */
export const jobsUnderWay = (doc: Pick<Flow, "steps">): string[] => (doc.steps ?? []).flatMap((s) => s.running?.jobs.map((j) => j.id) ?? []);

/**
 * What a step's card says it is: nothing coming in; ready to run; its jobs
 * waiting or running; done, failed or stopped - or changed since, in what
 * comes in, its options or who does it.
 */
export type StepState = "no-input" | "ready" | "waiting" | "running" | "done" | "failed" | "stopped" | "changed";

export function stateOf(doc: Flow, step: WorkflowStep, by: string): StepState {
  // (its jobs under way: the card says which, as they were last looked at)
  if (step.running) return "running";
  const into = wireInto(doc, step.id);
  if (!step.ran) return into ? "ready" : "no-input";
  // (what comes from a step not run yet, or run since, has changed)
  if (!into) return "changed";
  const key = inputKey(doc, step, by);
  if (key !== step.ran.input) return "changed";
  return step.ran.ok ? "done" : step.ran.stopped ? "stopped" : "failed";
}
