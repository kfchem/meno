import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { menoFileBytes } from "../../src/lib/doc/menoFile";
import { readWorkspace } from "../../src/ui/features/Workspace/utils/workspace";
import { lyingIn, type Frame } from "../../src/ui/features/Workspace/workflow/entries";
import { cardFrameOf } from "../../src/ui/features/Workspace/workflow/place";
import { inputsOf, kindInfo, needsOf } from "../../src/ui/features/Workspace/workflow/kinds";
import { schemeRoles } from "../../src/ui/features/Workspace/workflow/schemeRoles";
import { buildPage, STAMP, templateFile } from "./build";
import { dftRecipe, PLUGIN_OPTIONS, xtbRecipe } from "./recipe";

// The templates are built, in memory, from their recipes through the store's own actions, and checked as the kinds and the file reader see
// them. A kind that changes so that the recipe no longer fits fails here, not in a chemist's hands.

const overlap = (a: Frame, b: Frame) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe.each([
  ["xtb", "the xTB template", xtbRecipe],
  ["dft", "the xTB + DFT template", dftRecipe],
])("%s: %s", (name, _title, make) => {
  const recipe = make();
  const built = buildPage(recipe);
  const { doc } = built;

  it("holds every step of its recipe, each of the kind and by the plugin it names, with the options it gives, and no runs, results or jobs", () => {
    expect(doc.steps).toHaveLength(recipe.length);
    for (const r of recipe) {
      const s = doc.steps!.find((x) => x.id === built.steps.get(r.key))!;
      expect([s.kind, s.by, s.options]).toEqual([r.kind, r.by, r.options && Object.keys(r.options).length ? r.options : undefined]);
      expect(s.ran).toBeUndefined();
      expect(s.running).toBeUndefined();
      expect(s.runs).toBeUndefined();
    }
    // (a set the template made holds nothing: nothing was run)
    for (const set of doc.sets!.filter((b) => b.made)) expect(set.members?.length ?? 0).toBe(0);
  });

  it("asks nothing of the chemist on any card: every step's own check of its options is satisfied", () => {
    for (const s of doc.steps!) expect([s.kind, needsOf(s)]).toEqual([s.kind, undefined]);
  });

  it("wires every input a step needs, and every wire goes where the store's own check lets it (no wire into a port that does not take what comes)", () => {
    for (const s of doc.steps!) {
      for (const port of inputsOf(s.kind).filter((p) => !p.optional)) {
        expect([s.id, s.kind, port.id, doc.wires!.some((w) => w.to.step === s.id && w.to.port === port.id)]).toEqual([s.id, s.kind, port.id, true]);
      }
    }
    // (the recipe's own wires are all there, each as many times as it names its source)
    const wanted = recipe.reduce((n, r) => n + Object.values(r.in).reduce((m, v) => m + (Array.isArray(v) ? v.length : 1), 0), 0);
    expect(doc.wires).toHaveLength(wanted);
  });

  it("names, for each plugin's step, only the options that plugin's manifest has, and its steps' kinds (checked against the manifests as read)", () => {
    for (const r of recipe.filter((x) => x.by)) {
      const known = PLUGIN_OPTIONS[r.by!]?.[r.kind];
      expect([r.key, known !== undefined]).toEqual([r.key, true]);
      // (those the plugin has, and those the kind has of its own: a path search's pairs)
      const own = [...(kindInfo(r.kind).options ?? []).map((o) => o.id), "pairs", "property", "most"];
      for (const id of Object.keys(r.options ?? {})) expect([r.key, id, known!.includes(id) || own.includes(id)]).toEqual([r.key, id, true]);
    }
  });

  it("puts no card over another, nor over a set, and no set over another", () => {
    const cards = doc.steps!.map((s) => ({ s, f: cardFrameOf(s) }));
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) expect([cards[i].s.id, cards[j].s.id, overlap(cards[i].f, cards[j].f)]).toEqual([cards[i].s.id, cards[j].s.id, false]);
      for (const set of doc.sets!) expect([cards[i].s.id, set.id, overlap(cards[i].f, set)]).toEqual([cards[i].s.id, set.id, false]);
    }
    const sets = doc.sets!;
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) expect([sets[i].id, sets[j].id, overlap(sets[i], sets[j])]).toEqual([sets[i].id, sets[j].id, false]);
  });

  it("round trips through its file: the steps, sets and wires read back are the ones built", () => {
    const file = templateFile(recipe);
    const read = readWorkspace(file.text)!;
    expect(read.workflow!.steps.map((s) => [s.id, s.kind, s.by, s.options])).toEqual(doc.steps!.map((s) => [s.id, s.kind, s.by, s.options]));
    expect(read.workflow!.wires).toEqual(doc.wires);
    expect(read.workflow!.sets.map((s) => [s.id, s.made])).toEqual(doc.sets!.map((s) => [s.id, s.made]));
    // (and the file is a .meno whose workspace is that text)
    expect(file.bytes).toEqual(menoFileBytes(file.text, [], [], STAMP));
  }, 60_000);

  it("draws the example reaction: one reactant and two products, in the input set, each structure with its role and reaction", () => {
    const set = doc.sets!.find((b) => b.id === built.reaction)!;
    const { structures } = lyingIn(doc, set);
    const read = schemeRoles(doc, set, structures)!;
    expect(read.roles.map((r) => `${r!.role}/${r!.reaction}`).sort()).toEqual(["product/1", "product/1", "reactant/1"]);
    expect(read.said[0]).toBe("1 reaction: 1 reactant, 2 products");
  });

  it("is the file in templates/: made again from the recipe, byte for byte, so that a recipe or a kind that changed asks for `npm run templates`", () => {
    const path = resolve(__dirname, `../../templates/confots-${name}.meno`);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).equals(Buffer.from(templateFile(recipe).bytes))).toBe(true);
  }, 60_000);

  it("makes the same bytes every time it is built", () => {
    expect(Buffer.from(templateFile(recipe).bytes).equals(Buffer.from(templateFile(recipe).bytes))).toBe(true);
  }, 60_000);

  it("takes a kind from nothing it does not have", () => {
    for (const r of recipe) expect(() => kindInfo(r.kind)).not.toThrow();
  });
});
