import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// A drawing's atom reaches a reader of elements only through `readAs` (chem/drawing; foundation part 3, B2): a propyl typed as Pr is given
// as the group's name, never as praseodymium. Asked of the app's code outside lib: every `isMetal` there is given `readAs(...)`, but where
// it reads what was made through it already - a layout's input, a drawing read (`drawingOf`), a map made of `readAs` - or a structure
// that was never a drawing (a SMILES's atoms). Those are listed here by file; one more is a new reader to route through `readAs`, or to
// list with what it reads.

const SRC = resolve(__dirname, "../../../..");
const READ_ALREADY: Record<string, number> = {
  // (a view of a layout's input, or of a plugin's model: arrangementNotGiven, arrangementsMarked)
  "ui/features/Workspace/chem/arrangementsMarked.ts": 2,
  // (a layout's input, made by layoutJob through readAs: relayoutFrom, oppositesKept; poseAllyls's map of readAs; and the drawing read,
  //  `drawingOf`, made through readAs: wedgeOctahedron; relayoutFrom's check of a six-bond metal with a tridentate, on the layout's input)
  "ui/features/Workspace/chem/engineLayout.ts": 7,
  // (an atom holding a group passed by first: `a.abbrev || isMetal(a.el)`)
  "ui/features/Workspace/chem/etaBound.ts": 1,
  // (a SMILES's atoms: no drawing's)
  "ui/features/Workspace/chem/fromSmiles.ts": 2,
  // (the drawing read, `drawingOf`, made through readAs)
  "ui/features/Workspace/chem/identityOf.ts": 2,
  // (the atoms of the MOL blocks the plugin made of a structure, halvesMade: a file's atoms, each an element - a held group went out written through readAs)
  "ui/features/Workspace/chem/openStereo.ts": 1,
};

// The other readers of an element's symbol - a valence (`canTakeBond`, `implicitHydrogens`, `valencesAt`) or a halogen (`HALOGEN.has`) - asked
// the same: given `readAs(...)`, or listed with what they read.
const READ_ALREADY_VALENCE: Record<string, number> = {
  // (a callback handed an element by a reader of a plugin's drawing - of a typed SMILES or of a molecule in 3D - which holds no label: squarePlanarMetal)
  "ui/features/Workspace/chem/arrangementsMarked.ts": 1,
  // (whether an atom's valence set by a file says more than its element's own: a held group carries none - its label no valence table's)
  "ui/features/Workspace/chem/cleanUp.ts": 1,
  // (a callback handed the drawing read's element, `drawingOf`, made through readAs)
  "ui/features/Workspace/chem/identityOf.ts": 1,
  // (a selection to make an abbreviation of, refused first where an atom holds a group: "expand it first")
  "ui/features/Workspace/chem/abbreviationFromSelection.ts": 1,
  // (a carbon, by its symbol)
  "ui/features/Workspace/store/slices/uiSlice.ts": 1,
  // (a figure's label read as an element, `read.kind === "element"`)
  "ui/features/Workspace/utils/figures.ts": 1,
  // (a SMILES's atoms: no drawing's)
  "ui/features/Workspace/utils/smilesDrawn.ts": 1,
  // (a carbon, by its symbol, in a structure whose labels are drawn out first: a ring's group's kind for Draw as chair)
  "ui/features/Workspace/projections/fromFlat.ts": 1,
};

// In the files that give their readers `readAs(...)`, a drawing atom's `el` put into a reader's input as it is (`el: a.el`) is listed with
// what it is for: one more is a reader given the label as an element.
const LABEL_AS_TEXT: Record<string, number> = {
  // (the label as the canvas draws it, its group carried by `chemistry(a)`: showsLabel, drawnAs, labelsDrawn)
  "ui/features/Workspace/chem/engineLayout.ts": 3,
  // (a formula written for a person, the label as it reads - partFormula; the drawing read, `drawingOf`, made through readAs - runsOpenOf)
  "ui/features/Workspace/chem/cleanUp.ts": 2,
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe("a drawing's atom is read through readAs", () => {
  it("every isMetal in the app's code outside lib is given readAs, but those listed with what they read", () => {
    const found: Record<string, number> = {};
    for (const f of [...files(join(SRC, "ui")), ...files(join(SRC, "utils"))]) {
      const n = (readFileSync(f, "utf8").match(/\bisMetal\((?!readAs\()/g) ?? []).length;
      if (n) found[relative(SRC, f).split(sep).join("/")] = n;
    }
    expect(found).toEqual(READ_ALREADY);
  });

  it("every valence or halogen read in the app's code outside lib is given readAs, but those listed with what they read", () => {
    const found: Record<string, number> = {};
    for (const f of [...files(join(SRC, "ui")), ...files(join(SRC, "utils"))]) {
      const n = (readFileSync(f, "utf8").match(/\b(?:canTakeBond|implicitHydrogens|valencesAt|HALOGEN\.has)\((?!readAs\()/g) ?? []).length;
      if (n) found[relative(SRC, f).split(sep).join("/")] = n;
    }
    expect(found).toEqual(READ_ALREADY_VALENCE);
  });

  it("in a file whose readers are given readAs, an atom's el given as it is is only a label's text, listed", () => {
    const found: Record<string, number> = {};
    for (const f of [...files(join(SRC, "ui")), ...files(join(SRC, "utils"))]) {
      const text = readFileSync(f, "utf8");
      if (!/import [^;]*\breadAs\b[^;]*from "[./]*chem\/drawing"|import [^;]*\breadAs\b[^;]*from "\.\/drawing"/.test(text)) continue;
      const n = (text.match(/\bel: [A-Za-z_.!()]+\.el\b/g) ?? []).length;
      if (n) found[relative(SRC, f).split(sep).join("/")] = n;
    }
    expect(found).toEqual(LABEL_AS_TEXT);
  });
});
