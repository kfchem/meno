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
  // (a layout's input, made by layoutJob through readAs: relayoutFrom, oppositesKept; and poseAllyls's map of readAs)
  "ui/features/Workspace/chem/engineLayout.ts": 4,
  // (an atom holding a group passed by first: `a.abbrev || isMetal(a.el)`)
  "ui/features/Workspace/chem/etaBound.ts": 1,
  // (a SMILES's atoms: no drawing's)
  "ui/features/Workspace/chem/fromSmiles.ts": 2,
  // (the drawing read, `drawingOf`, made through readAs)
  "ui/features/Workspace/chem/identityOf.ts": 2,
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
});
