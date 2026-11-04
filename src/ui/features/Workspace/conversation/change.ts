/**
 * A conversation's tools that change the page (docs/CONVERSATIONS.md,
 * *Meno's tools*, *To change*): what it puts down, inside its frame and
 * clear of what is there - a structure from SMILES, by Meno's own reader and
 * layout engine; an arrow; a plus; a text sheet - and a workflow's steps,
 * built through the page's own calls, under the page's own rules. Each is
 * the page's own call, never a gesture replayed; the turn's change set makes
 * all of them one step, said to be the conversation's (conversation/turn).
 *
 * Never reachable from here: running, stopping or adopting a step's jobs;
 * letting an undo through; a plugin's set-up or download; Settings;
 * choosing atoms; folders; files. Left to the person, never set by a tool:
 * an option its plugin marks as the person's, and - until every plugin
 * marks them - every option of free text or atoms, a number with no bounds,
 * and a switch: cores and memory, a program's keywords, what is kept on
 * disk among them.
 */
import type { Option, OptionValues } from "../../../../lib/options";
import type { WorkspaceDocument } from "../document";
import type { EditorState } from "../store/types";
import { byOf, kindsOf, optionsFor } from "../workflow/doers";
import { KINDS, type StepKind } from "../workflow/kinds";
import { inScope, readSeenId, seenId, type Scope } from "./scope";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { centredAt } from "../utils/copyPaste";

/** What a change tool answers: done, with what it made, or why not. */
export type Changed = { ok: true; value: unknown } | { ok: false; why: string };

/** The page's own calls a change tool makes. */
export type PageCalls = Pick<EditorState, "pasteModel" | "addArrow" | "addPlus" | "addTexts" | "addStep" | "connect" | "updateStep">;

const MARGIN = 1.5;

/** The points of what lies on the page: what a thing put down is kept clear of. */
function taken(d: WorkspaceDocument): { x: number; y: number }[] {
  return [
    ...d.model.atoms,
    ...d.arrows,
    ...d.pluses,
    ...(d.captions ?? []),
    ...(d.molecules3d ?? []).map((m) => m.at),
    ...(d.steps ?? []),
    ...(d.texts ?? []).flatMap((t) => (t.at ? [t.at] : [])),
    ...(d.pictures ?? []),
  ].filter((p): p is { x: number; y: number } => !!p && Number.isFinite(p.x) && Number.isFinite(p.y));
}

/**
 * Where something `w` by `h` is put down: the first place inside `frame`,
 * row by row from its top left, with nothing on the page in it or near it;
 * where there is none, its middle - and said to be over what lies there.
 */
export function clearSpot(d: WorkspaceDocument, frame: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number): { at: { x: number; y: number }; clear: boolean } {
  const points = taken(d);
  const stepX = Math.max(w + MARGIN, 1);
  const stepY = Math.max(h + MARGIN, 1);
  for (let y = frame.y0 + MARGIN + h / 2; y + h / 2 <= frame.y1 - MARGIN; y += stepY) {
    for (let x = frame.x0 + MARGIN + w / 2; x + w / 2 <= frame.x1 - MARGIN; x += stepX) {
      const free = points.every((p) => Math.abs(p.x - x) > w / 2 + MARGIN || Math.abs(p.y - y) > h / 2 + MARGIN);
      if (free) return { at: { x, y }, clear: true };
    }
  }
  return { at: { x: (frame.x0 + frame.x1) / 2, y: (frame.y0 + frame.y1) / 2 }, clear: false };
}

/** The frame a change is put down in: the conversation's, or - one of the whole page - round what is on it. */
function frameOf(d: WorkspaceDocument, scope: Scope): { x0: number; y0: number; x1: number; y1: number } {
  if ("frame" in scope) return scope.frame;
  const points = taken(d);
  if (!points.length) return { x0: -20, y0: -20, x1: 20, y1: 20 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  // (one of the whole page: below all of it, where nothing is)
  const y0 = Math.max(...ys) + 4;
  return { x0: Math.min(...xs), y0, x1: Math.max(Math.max(...xs), Math.min(...xs) + 40), y1: y0 + 40 };
}

/** Whether a tool may set an option: one its plugin left to the person, or of a kind a tool never sets, it may not. */
export function settable(o: Option): boolean {
  if (o.person) return false;
  if (o.type === "choice") return true;
  if (o.type === "number") return o.min != null && o.max != null;
  return false;
}

/** Options asked for, checked as a step's card checks them: each one the step takes, a tool may set, and of a value it takes - else why not, in words. */
export function optionsChecked(options: readonly Option[], asked: Record<string, unknown>): { values: OptionValues } | { why: string } {
  const values: OptionValues = {};
  for (const [id, v] of Object.entries(asked)) {
    const o = options.find((x) => x.id === id);
    if (!o) return { why: `The step takes no option "${id.slice(0, 40)}"` };
    if (!settable(o)) return { why: `"${o.label}" is left to you to set` };
    if (o.type === "choice") {
      if (typeof v !== "string" || !o.choices.some((c) => c.value === v)) return { why: `"${o.label}" is one of ${o.choices.map((c) => c.value).join(", ")}` };
      values[id] = v;
    } else if (o.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < o.min! || v > o.max!) return { why: `"${o.label}" is a number from ${o.min} to ${o.max}` };
      values[id] = v;
    }
  }
  return { values };
}

/** The change tools, by name: what each is given, and what it does. */
export const CHANGE_TOOLS = {
  put_structure: 'A structure drawn from a SMILES, put down inside the frame, clear of what is there. Takes {"smiles"}.',
  put_arrow: "A reaction arrow put down inside the frame. Takes nothing.",
  put_plus: 'A "+" put down inside the frame. Takes nothing.',
  put_text: 'A text sheet put down inside the frame. Takes {"name", "text"}.',
  add_step: 'A workflow step put down inside the frame, with Settings\' defaults: {"kind", "by"} - a kind of step, and who does it.',
  wire: 'A wire from a set to a step: {"from": "set:3", "to": "step:7", "port"?}.',
  set_options: 'A step\'s options, checked as its card checks them: {"step": "step:7", "options": {...}}. Some are left to the person.',
} as const;

/**
 * A change tool called: on the page as it is now, within `scope`, through
 * the page's own calls (`calls`). Every id it is given must lie in scope -
 * else it is answered as one that is not there.
 */
export function changeTool(d: () => WorkspaceDocument, calls: PageCalls, scope: Scope, tool: string, args: Record<string, unknown> = {}): Changed {
  const page = d();
  const frame = frameOf(page, scope);
  const seen = () => inScope(d(), scope);
  const str = (k: string, most = 100_000) => (typeof args[k] === "string" && (args[k] as string).length <= most ? (args[k] as string) : null);
  switch (tool) {
    case "put_structure": {
      const smiles = str("smiles", 2000);
      if (!smiles) return { ok: false, why: 'Give a SMILES: {"smiles": "CCO"}' };
      let drawn;
      try {
        drawn = drawnFromSmiles(smiles);
      } catch {
        return { ok: false, why: `Meno does not read ${JSON.stringify(smiles.slice(0, 80))} as a SMILES` };
      }
      if (!drawn.atoms.length) return { ok: false, why: "That SMILES holds no atom" };
      const xs = drawn.atoms.map((a) => a.x);
      const ys = drawn.atoms.map((a) => a.y);
      const spot = clearSpot(page, frame, Math.max(...xs) - Math.min(...xs) + 2, Math.max(...ys) - Math.min(...ys) + 2);
      const first = page.nextId;
      calls.pasteModel(centredAt(drawn, spot.at));
      if (d().nextId === first) return { ok: false, why: "It could not be put down" };
      return { ok: true, value: { id: seenId("structure", first), ...(spot.clear ? {} : { over: "put down over what lies there: the frame has no room left" }) } };
    }
    case "put_arrow": {
      const spot = clearSpot(page, frame, 4, 1);
      return { ok: true, value: { id: seenId("arrow", calls.addArrow(spot.at.x - 1.5, spot.at.y, 0, 3)) } };
    }
    case "put_plus": {
      const spot = clearSpot(page, frame, 1, 1);
      return { ok: true, value: { id: seenId("plus", calls.addPlus(spot.at.x, spot.at.y)) } };
    }
    case "put_text": {
      const name = str("name", 200) ?? "Notes";
      const text = str("text");
      if (text == null) return { ok: false, why: 'Give its words: {"name", "text"}' };
      const before = page.nextTextId ?? 1;
      const spot = clearSpot(page, frame, 12, 8);
      calls.addTexts([{ name, text }], spot.at);
      return d().nextTextId === before ? { ok: false, why: "It could not be put down" } : { ok: true, value: { id: seenId("text", before) } };
    }
    case "add_step": {
      const kind = str("kind", 60);
      const by = str("by", 60);
      const info = KINDS.find((k) => k.kind === kind || k.name === kind);
      if (!info || !by) return { ok: false, why: 'Give a kind of step and who does it: {"kind", "by"}' };
      if (!kindsOf(by).includes(info.kind as StepKind)) return { ok: false, why: `${by} does not do ${info.name}` };
      const spot = clearSpot(page, frame, 10, 6);
      return { ok: true, value: { id: seenId("step", calls.addStep(info.kind as StepKind, by, spot.at.x, spot.at.y)) } };
    }
    case "wire": {
      const from = readSeenId(args.from);
      const to = readSeenId(args.to);
      const s = seen();
      if (!from || from.kind !== "set" || !s.set.includes(from.id) || !to || to.kind !== "step" || !s.step.includes(to.id)) return { ok: false, why: "There is no such object" };
      const port = str("port", 40) ?? undefined;
      return calls.connect({ set: from.id }, to.id, port) ? { ok: true, value: { wired: true } } : { ok: false, why: "That set cannot be wired to that step" };
    }
    case "set_options": {
      const named = readSeenId(args.step);
      const s = seen();
      if (!named || named.kind !== "step" || !s.step.includes(named.id)) return { ok: false, why: "There is no such object" };
      const step = d().steps!.find((x) => x.id === named.id)!;
      const asked = args.options;
      if (!asked || typeof asked !== "object" || Array.isArray(asked)) return { ok: false, why: 'Give its options: {"step", "options": {...}}' };
      const checked = optionsChecked(optionsFor(step.kind, byOf(step)), asked as Record<string, unknown>);
      if ("why" in checked) return { ok: false, why: checked.why };
      calls.updateStep(step.id, { options: { ...step.options, ...checked.values } });
      return { ok: true, value: { options: d().steps!.find((x) => x.id === named.id)?.options ?? {} } };
    }
    default:
      return { ok: false, why: `There is no tool called ${JSON.stringify(String(tool).slice(0, 40))}` };
  }
}
