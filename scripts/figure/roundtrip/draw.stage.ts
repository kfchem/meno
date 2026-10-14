/**
 * Stage 2 of the round trip (README.md): each structure of .roundtrip/corpus.json
 * drawn as Meno draws a SMILES typed in - the plugin's MOL block read and laid
 * out by Meno's engine - written as a MOL file, as Export writes one, and as
 * SVG in every drawing style, as Export writes that.
 *
 *   npx vitest run --config scripts/figure/roundtrip/vitest.config.ts draw
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import { STYLE_PRESETS, styleOf } from "../../../src/lib/chem/style";
import { laidOut } from "../../../src/ui/features/Workspace/chem/cleanUp";
import { emptyWorkspaceDocument } from "../../../src/ui/features/Workspace/document";
import { drawingSvg, structureFileText } from "../../../src/ui/features/Workspace/fileActions";
import { editorModelOf, processFileContent } from "../../../src/ui/features/Workspace/utils/io";
import { fileName } from "./names";

const OUT = resolve(process.cwd(), ".roundtrip");
type Listed = { name: string; molblock: string };

it("draws every structure in every style", async () => {
  const { molecules } = JSON.parse(readFileSync(resolve(OUT, "corpus.json"), "utf8")) as { molecules: Listed[] };
  mkdirSync(resolve(OUT, "svg"), { recursive: true });
  const doc = emptyWorkspaceDocument();
  const aromatic = { aromaticEnabled: doc.aromaticEnabled, aromaticRings: doc.aromaticRings };
  const drawn: { name: string; mol?: string; warning?: string; error?: string }[] = [];
  for (const m of molecules) {
    try {
      // (as structureFromSmiles has it)
      const read = await processFileContent("smiles.mol", m.molblock);
      const flat = editorModelOf(read.model);
      // (or as the plugin laid it out, should the engine fail)
      let warning: string | undefined;
      const model = await laidOut(flat).catch((e: unknown) => {
        warning = e instanceof Error ? e.message : String(e);
        return flat;
      });
      drawn.push({ name: m.name, mol: structureFileText(model, `${m.name}.mol`), ...(warning ? { warning } : {}) });
      for (const p of STYLE_PRESETS) {
        const svg = drawingSvg(model, aromatic, styleOf({ preset: p.id, changes: {} }));
        writeFileSync(resolve(OUT, "svg", `${fileName(m.name)}.${p.id}.svg`), svg);
      }
    } catch (e) {
      drawn.push({ name: m.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  writeFileSync(resolve(OUT, "drawn.json"), JSON.stringify({ presets: STYLE_PRESETS.map((p) => p.id), drawn }, null, 1));
  console.log(`${drawn.filter((d) => d.mol).length} of ${drawn.length} drawn -> ${OUT}`);
});
