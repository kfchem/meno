/**
 * Procedures (docs/WORKFLOWS.md, *Procedures*): a whole flow's steps, as
 * they are set, the wires among them and the empty sets they take their
 * input from - saved by name in Settings, put down again from Quick Add,
 * and written as a workspace (.meno) to share. What Settings keeps is read
 * as a workspace's workflow is (./saved), each time it is used.
 */
import { pluginById } from "../../../../lib/calc/catalog";
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings, type SavedProcedure } from "../../../../lib/settings/appSettings";
import { byOf, doerName, MENO } from "./doers";
import { kindInfo } from "./kinds";
import { partsBounds, type FlowParts } from "./parts";
import { readWorkflow } from "./saved";
import { workspaceFile } from "../utils/workspace";

/** A procedure, as the workflow reads it: its id, name, when it was saved, and its parts - placed from its top left. */
export type Procedure = { id: string; name: string; saved: number; parts: FlowParts };

/** A procedure Settings keeps, read: none, where its flow has no step that reads. */
export function procedureOf(p: SavedProcedure): Procedure | null {
  const read = readWorkflow(p.flow);
  if (!read?.steps.length) return null;
  return {
    id: p.id,
    name: p.name,
    saved: p.saved,
    parts: { sets: read.sets.map(({ made: _m, aside: _a, ...b }) => b), steps: read.steps.map(({ ran: _r, runs: _k, running: _g, ...s }) => s), wires: read.wires },
  };
}

/** The procedures saved, as Settings keeps them, those that read, in the order they were saved. */
export const proceduresSaved = (list: readonly SavedProcedure[] = useAppSettings.getState().procedures): Procedure[] =>
  list.map(procedureOf).filter((p): p is Procedure => p != null);

/** A procedure's id: new, of Meno's own making. */
const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Saves a procedure by name, after those saved: its id. */
export function saveProcedure(name: string, parts: FlowParts, now = Date.now()): string {
  const s = useAppSettings.getState();
  const id = newId();
  s.setProcedures([...s.procedures, { id, name: name.trim().slice(0, 80), saved: now, flow: { sets: parts.sets, steps: parts.steps, wires: parts.wires } }]);
  return id;
}

export function renameProcedure(id: string, name: string): void {
  const s = useAppSettings.getState();
  const n = name.trim().slice(0, 80);
  if (!n) return;
  s.setProcedures(s.procedures.map((p) => (p.id === id ? { ...p, name: n } : p)));
}

export function removeProcedure(id: string): void {
  const s = useAppSettings.getState();
  s.setProcedures(s.procedures.filter((p) => p.id !== id));
}

/** A procedure's steps in the order their wires lead, each from those before it - those first that nothing comes into from a step. */
function inOrder(parts: FlowParts) {
  const before = new Map(parts.steps.map((s) => [s.id, parts.wires.find((w) => w.to === s.id)?.from]));
  const depth = (id: number, seen = new Set<number>()): number => {
    const from = before.get(id);
    return from && "step" in from && !seen.has(id) ? 1 + depth(from.step, new Set([...seen, id])) : 0;
  };
  // (then from the top of the page down, and left to right)
  return [...parts.steps].sort((p, q) => depth(p.id) - depth(q.id) || q.y - p.y || p.x - q.x);
}

/** What a procedure does, in a line: each step's kind and who does it, in order - "Optimise · xTB → Energy · xTB". */
export function procedureLine(parts: FlowParts): string {
  return inOrder(parts)
    .map((s) => {
      const by = byOf(s);
      const p = pluginById(by);
      const who = by === MENO.id ? MENO.name : p ? doerName(p) : by;
      return `${kindInfo(s.kind).name} · ${who}`;
    })
    .join(" → ");
}

/** What a procedure needs that is not added: the plugins its steps are done by, by name - none, where every one is. */
export function procedureNeeds(parts: FlowParts, added: Record<string, string> = useReaders.getState().state): string[] {
  const missing = new Set<string>();
  for (const s of parts.steps) {
    const by = byOf(s);
    if (by === MENO.id || added[by] === "added") continue;
    missing.add(pluginById(by)?.name ?? by);
  }
  return [...missing];
}

/** A name for a flow saved as a procedure, until the chemist gives it one: its steps' kinds, in order. */
export const suggestedName = (parts: FlowParts) =>
  inOrder(parts)
    .map((s) => kindInfo(s.kind).name)
    .join(", ")
    .slice(0, 80);

/** A procedure as a workspace (.meno) holds it, to be shared: its sets and steps and the wires among them, and nothing else - its middle where a workspace opened is first seen. */
export function procedureWorkspace(p: Procedure): Promise<Uint8Array> {
  const parts = centredParts(p.parts);
  return workspaceFile({
    model: { atoms: [], bonds: [] },
    arrows: [],
    pluses: [],
    captions: [],
    molecules3d: [],
    turns3d: {},
    frames3d: {},
    lists3d: {},
    aromaticEnabled: false,
    aromaticRings: {},
    sets: parts.sets,
    steps: parts.steps,
    wires: parts.wires,
  });
}

/** Parts moved so that their middle is at the page's origin. */
export function centredParts(parts: FlowParts): FlowParts {
  const b = partsBounds(parts);
  if (!b) return parts;
  const dx = -(b.x0 + b.x1) / 2;
  const dy = -(b.y0 + b.y1) / 2;
  return {
    sets: parts.sets.map((s) => ({ ...s, x0: s.x0 + dx, x1: s.x1 + dx, y0: s.y0 + dy, y1: s.y1 + dy })),
    steps: parts.steps.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    wires: parts.wires,
  };
}

