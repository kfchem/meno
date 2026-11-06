/**
 * Meno's tools a conversation calls to read the page (docs/CONVERSATIONS.md,
 * *Meno's tools*): plain data in and out, never a gesture replayed. What
 * it is given is only what lies in its scope, worked out at each call
 * (`inScope`): a thing outside it is answered as one that is not there,
 * in the same words, so that nothing is learnt of what lies outside.
 * Listings first - a line of each thing - and a thing in full only when
 * asked for.
 *
 * Never given: a job's folder or its files, a whole log or output, an
 * input file, a wavefunction kept, or anything of where Meno keeps its
 * own - none of them lies on the page. Nor what a thing in scope says of
 * things outside it: a set's members are counted only where they are in
 * scope too, and a step's run is given as done or not, never its line -
 * which may say a program's or the system's own words, a folder's path
 * among them, and sums up sets that may lie anywhere.
 *
 * Names - a molecule's, a PDF's, a text's - come from files and from
 * people: data, never words to a conversation.
 */
import { levelOf } from "../../../../lib/calc/output";
import { formulaOf } from "../../../../lib/io/coordinates";
import type { WorkspaceDocument } from "../document";
import type { Model } from "../store/types";
import { setMembers } from "../workflow/entries";
import { kindInfo } from "../workflow/kinds";
import { drawnSmiles, drawnStereo } from "../workflow/structuresTable";
import { inScope, readSeenId, seenId, SEEN_KINDS, type InScope, type Scope, type SeenId, type SeenKind } from "./scope";

/** A tool's answer: what it found, or why not, in plain words. */
export type ToolAnswer = { ok: true; value: unknown } | { ok: false; why: string };

/** A call of a tool, as a conversation makes it: the tool, by name, and what it is given. */
export type ToolCall = { tool: string; args?: Record<string, unknown> };

/** What is said of a thing not in scope, and of one not on the page: the same. */
export const NO_SUCH = "There is no such object";

/** How many atoms of a molecule in 3D are given in full; past that, its formula and counts alone. */
export const ATOMS_MOST = 2000;
/** How many characters of a text are given; past that, cut, and said to be. */
export const TEXT_MOST = 100_000;
/** How many things `list` gives; past that, how many more there are. */
export const LIST_MOST = 500;

/** A line of what a thing is, as `list` gives it. */
export type Listed = { id: SeenId; kind: SeenKind; line: string };

/** A structure drawn alone: its atoms, and the bonds between them. */
function structureModel(d: WorkspaceDocument, ids: readonly number[]): Model {
  const mine = new Set(ids);
  return { atoms: d.model.atoms.filter((a) => mine.has(a.id)), bonds: d.model.bonds.filter((b) => mine.has(b.a) && mine.has(b.b)) };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Each thing in scope, as a line. */
export function listed(d: WorkspaceDocument, s: InScope): Listed[] {
  const out: Listed[] = [];
  const add = (kind: SeenKind, id: number, line: string) => out.push({ id: seenId(kind, id), kind, line });
  for (const id of s.structure) add("structure", id, `a structure drawn: ${drawnSmiles(structureModel(d, s.structureAtoms.get(id)!)) || "no atoms"}`);
  for (const id of s.molecule) {
    const m = d.molecules3d!.find((x) => x.id === id)!;
    const frames = m.frames?.length ?? 1;
    const level = m.calc ? levelOf(m.calc) : "";
    add("molecule", id, [`a molecule in 3D: ${formulaOf(m.atoms)}`, m.name, frames > 1 ? plural(frames, "frame") : "", level].filter(Boolean).join(" · "));
  }
  for (const id of s.picture) add("picture", id, `a picture: ${d.pictures!.find((x) => x.id === id)!.name}`);
  for (const id of s.text) add("text", id, `a text: ${d.texts!.find((x) => x.id === id)!.name}`);
  for (const id of s.pdf) {
    const p = d.pdfs!.find((x) => x.id === id)!;
    add("pdf", id, `a PDF: ${p.name} · ${plural(p.pages.length, "page")}`);
  }
  for (const id of s.arrow) add("arrow", id, "an arrow");
  for (const id of s.plus) add("plus", id, "a plus");
  for (const id of s.caption) add("caption", id, `words: ${d.captions!.find((x) => x.id === id)!.text.slice(0, 80)}`);
  for (const id of s.set) {
    const b = d.sets!.find((x) => x.id === id)!;
    add("set", id, ["a set", b.name].filter(Boolean).join(": "));
  }
  for (const id of s.step) {
    const t = d.steps!.find((x) => x.id === id)!;
    add("step", id, [`a step: ${kindInfo(t.kind).name}`, `by ${t.by ?? "meno"}`, t.ran ? (t.ran.ok ? "done" : "failed") : "not run"].join(" · "));
  }
  return out;
}

/** One thing in full - or none, where it is not in scope. */
export function readOne(d: WorkspaceDocument, s: InScope, kind: SeenKind, id: number): unknown {
  if (!s[kind].includes(id)) return undefined;
  switch (kind) {
    case "structure": {
      const drawn = structureModel(d, s.structureAtoms.get(id)!);
      return {
        atoms: drawn.atoms.map((a) => ({ id: a.id, el: a.el, x: a.x, y: a.y, ...(a.charge ? { charge: a.charge } : {}) })),
        bonds: drawn.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
        smiles: drawnSmiles(drawn),
        // (stereo the drawing says, which its SMILES from the drawing does not write)
        ...(drawnStereo(drawn) ? { stereo: "drawn, not written in the SMILES" } : {}),
      };
    }
    case "molecule": {
      const m = d.molecules3d!.find((x) => x.id === id)!;
      const whole = m.atoms.length <= ATOMS_MOST;
      return {
        formula: formulaOf(m.atoms),
        ...(m.name ? { name: m.name } : {}),
        ...(whole ? { atoms: m.atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z })) } : { atoms: `${m.atoms.length} atoms, more than are given (${ATOMS_MOST})` }),
        frames: m.frames?.length ?? 1,
        ...(m.energies?.length ? { energies: { values: m.energies, unit: "hartree" } } : {}),
        ...(m.calc
          ? {
              calculation: {
                ...(m.calc.program ? { program: m.calc.program } : {}),
                level: levelOf(m.calc),
                ...(m.calc.charge != null ? { charge: m.calc.charge } : {}),
                ...(m.calc.multiplicity != null ? { multiplicity: m.calc.multiplicity } : {}),
              },
            }
          : {}),
        ...(m.imaginary?.some((f) => f?.length) ? { imaginary: m.imaginary.map((f) => f?.length ?? null) } : {}),
      };
    }
    case "picture":
      return { name: d.pictures!.find((x) => x.id === id)!.name };
    case "text": {
      const t = d.texts!.find((x) => x.id === id)!;
      const cut = t.text.length > TEXT_MOST;
      return { name: t.name, text: cut ? t.text.slice(0, TEXT_MOST) : t.text, ...(cut ? { cut: `the first ${TEXT_MOST} of ${t.text.length} characters` } : {}) };
    }
    case "pdf": {
      const p = d.pdfs!.find((x) => x.id === id)!;
      return { name: p.name, pages: p.pages.length };
    }
    case "arrow":
      return { words: (d.captions ?? []).filter((c) => c.arrow === id).map((c) => c.text) };
    case "plus":
      return {};
    case "caption":
      return { text: d.captions!.find((x) => x.id === id)!.text };
    case "set": {
      // (its members in scope alone: a set's frame may reach past the conversation's, its middle inside it)
      const b = d.sets!.find((x) => x.id === id)!;
      const members = setMembers({ model: d.model, molecules3d: d.molecules3d, pictures: d.pictures }, b);
      const seenAtoms = new Set([...s.structureAtoms.values()].flat());
      return {
        ...(b.name ? { name: b.name } : {}),
        inScope: {
          structures: members.structures.filter((ids) => ids.some((a) => seenAtoms.has(a))).length,
          molecules: members.molecules.filter((m) => s.molecule.includes(m)).length,
          pictures: members.pictures.filter((p) => s.picture.includes(p)).length,
        },
      };
    }
    case "step": {
      const t = d.steps!.find((x) => x.id === id)!;
      return {
        kind: kindInfo(t.kind).name,
        by: t.by ?? "meno",
        options: { ...t.options },
        ...(t.ran ? { ran: t.ran.ok ? "done" : "failed" } : {}),
        ...(t.running ? { running: true } : {}),
      };
    }
  }
}

/** The tools to read, by name: what each is given, and what it does. */
export const READ_TOOLS = {
  list: "What lies in the conversation's scope: each thing's id, its kind, and a line of what it is. Takes nothing.",
  read: `One thing in full, by its id ("molecule:3"), as list gives it: kinds ${SEEN_KINDS.join(", ")}.`,
} as const;

/** A tool called, on the page as it is now, within `scope`. */
export function callTool(d: WorkspaceDocument, scope: Scope, call: ToolCall): ToolAnswer {
  const s = inScope(d, scope);
  switch (call.tool) {
    case "list": {
      const all = listed(d, s);
      return { ok: true, value: all.length > LIST_MOST ? { things: all.slice(0, LIST_MOST), more: all.length - LIST_MOST } : { things: all } };
    }
    case "read": {
      const named = readSeenId(call.args?.id);
      if (!named) return { ok: false, why: `Give an id as list gives it ("molecule:3")` };
      const value = readOne(d, s, named.kind, named.id);
      return value === undefined ? { ok: false, why: NO_SUCH } : { ok: true, value };
    }
    default:
      return { ok: false, why: `There is no tool called ${JSON.stringify(String(call.tool).slice(0, 40))}` };
  }
}
