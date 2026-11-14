/**
 * The template builder: a recipe (./recipe) put on a page through the workspace's own actions - the drawn reaction, a set round it, each step
 * added as the GUI adds it (`addStep`), its inputs wired (`connect`), the stages headed - and written as a .meno without runs, results or jobs.
 * A template is made again when a kind changes, never edited by hand: the test beside it fails where the recipe no longer fits the kinds.
 */
import { menoFileBytes } from "../../src/lib/doc/menoFile";
import { NOMINAL_BOND_LENGTH as L } from "../../src/lib/chem/acs";
import { addCaption, createWorkspaceDocument, emptyWorkspaceDocument, type WorkspaceDocument } from "../../src/ui/features/Workspace/document";
import { connectStoreToDocument, createEditorStore } from "../../src/ui/features/Workspace/store";
import { workspaceText } from "../../src/ui/features/Workspace/utils/workspace";
import { resultOf } from "../../src/ui/features/Workspace/workflow/flow";
import { exitsOf } from "../../src/ui/features/Workspace/workflow/kinds";
import { CARD_H, CARD_W, GAP } from "../../src/ui/features/Workspace/workflow/look";
import { addSet, addStep, connect } from "../../src/ui/features/Workspace/workflow/model";
import { exampleReaction } from "./example";
import { dftRecipe, NOTES, xtbRecipe, type RecipeStep } from "./recipe";

/** What the page is laid out on: a step's column and a stage's row, in world units - a card, the set it gives to its right, and room for the one under it (the page of record's own spacing). */
const PITCH = 2 * (CARD_W + GAP);
const ROW = 4 * CARD_H;
/** How many steps a stage's row holds before it goes on under itself. */
const WRAP = 10;
/** Where the first step's card stands, left of which the drawn reaction is. */
const ORIGIN = { x: -46, y: -10 };

export type Built = { doc: WorkspaceDocument; steps: Map<string, number>; reaction: number; stages: string[] };

/** A template's entries are all stamped with this, so that it is made again byte for byte. */
export const STAMP = new Date("2026-01-01T00:00:00Z");

const REACTION_NAME = "The reaction: draw over it";

/** The recipe on a page: the example drawn, its set, then each step placed in its stage's row and wired. */
export function buildPage(recipe: readonly RecipeStep[]): Built {
  const example = exampleReaction();
  let doc: WorkspaceDocument = {
    ...emptyWorkspaceDocument(),
    model: { atoms: example.atoms, bonds: example.bonds },
    arrows: example.arrows,
    pluses: example.pluses,
    nextArrowId: example.arrows.length + 1,
    nextPlusId: example.pluses.length + 1,
    nextId: example.nextId,
  };
  const reaction = doc.nextWorkflowId ?? 1;
  doc = addSet(doc, example.frame, undefined, REACTION_NAME);
  const steps = new Map<string, number>();
  const stages: string[] = [];
  const at = new Map<string, number>();
  /** The first row each stage has: a stage that wraps takes the rows after, the next stage the row after those. */
  const rows = new Map<string, number>();
  const rowsFor = new Map<string, number>(recipe.reduce((m, s) => m.set(s.stage, (m.get(s.stage) ?? 0) + 1), new Map<string, number>()));
  let nextRow = 0;
  for (const s of recipe) if (!rows.has(s.stage)) {
    rows.set(s.stage, nextRow);
    nextRow += Math.ceil(rowsFor.get(s.stage)! / WRAP);
  }
  const sourceOf = (d: WorkspaceDocument, source: string): { set: number } => {
    if (source === "@reaction") return { set: reaction };
    const [key, exit] = source.split(".");
    const id = steps.get(key);
    if (id == null) throw new Error(`"${source}": no step ${key} before it`);
    const step = d.steps!.find((s) => s.id === id)!;
    const set = resultOf(d, id, exit ?? exitsOf(step.kind)[0].id);
    if (!set) throw new Error(`"${source}": step ${key} (${step.kind}) has no such exit`);
    return { set: set.id };
  };
  for (const s of recipe) {
    if (steps.has(s.key)) throw new Error(`step ${s.key} twice`);
    if (!stages.includes(s.stage)) stages.push(s.stage);
    const used = at.get(s.stage) ?? 0;
    at.set(s.stage, used + 1);
    const x = ORIGIN.x + (used % WRAP) * PITCH;
    const y = ORIGIN.y - (rows.get(s.stage)! + Math.floor(used / WRAP)) * ROW;
    const id = doc.nextWorkflowId ?? 1;
    doc = addStep(doc, s.kind, x, y, s.options, s.by);
    steps.set(s.key, id);
    for (const [port, from] of Object.entries(s.in)) {
      for (const source of Array.isArray(from) ? from : [from]) {
        const next = connect(doc, sourceOf(doc, source), id, port);
        if (next === doc) throw new Error(`${s.key}: "${source}" cannot be wired into ${port}`);
        doc = next;
      }
    }
  }
  // (each stage headed, over the first row it has)
  stages.forEach((stage) => {
    doc = addCaption(doc, { x: ORIGIN.x + 5, y: ORIGIN.y - rows.get(stage)! * ROW + 2 * CARD_H, text: stage, size: 14, align: "left" });
  });
  // (and the words each needs, beside its heading)
  for (const n of NOTES) {
    if (!stages.includes(n.stage)) continue;
    doc = addCaption(doc, { x: ORIGIN.x + 60, y: ORIGIN.y - rows.get(n.stage)! * ROW + 2 * CARD_H, text: n.text, size: 9, width: 70, align: "left" });
  }
  return { doc, steps, reaction, stages };
}

/** The template's workspace text, as Save writes it, and the .meno it goes in: no runs, no results, no jobs. */
export function templateFile(recipe: readonly RecipeStep[]): { text: string; bytes: Uint8Array; built: Built } {
  const built = buildPage(recipe);
  const held = createWorkspaceDocument();
  const store = createEditorStore(held);
  connectStoreToDocument(store, held);
  held.reset(built.doc, "template");
  const text = workspaceText(store.getState());
  return { text, bytes: menoFileBytes(text, [], [], STAMP), built };
}

/** The xTB template, and the xTB + DFT template. */
export const xtbTemplate = () => templateFile(xtbRecipe());
export const dftTemplate = () => templateFile(dftRecipe());

export const REACTION_FRAME_NAME = REACTION_NAME;
export { L };
