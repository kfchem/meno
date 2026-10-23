import { chemWorker } from "../../../../lib/roles/worker";
import type { Model } from "../store/types";
import { editorModelOf, processFileContent } from "../utils/io";
import { laidOut } from "./cleanUp";
import type { DrawingStyle } from "../../../../lib/chem/style";

/**
 * The structure a SMILES says, read by the plugin that fills that role and
 * drawn by Meno's own engine - or as the plugin laid it out, should the
 * engine fail. The first use sets the plugin up, asking before it downloads.
 * Laid out in `style` - the drawing's it goes into - or else the app's.
 */
export async function structureFromSmiles(smiles: string, style?: DrawingStyle): Promise<Model> {
  const c = await chemWorker("smiles");
  const { molblock } = await c.request("from_smiles", { smiles });
  return drawingOf(molblock, style);
}

/**
 * A plugin's drawing of a structure - a MOL block, laid out in 2D, its
 * stereo wedged - as Meno draws it: read as a file is, and laid out by
 * Meno's own engine in `style`, or as the plugin laid it out, should the
 * engine fail. One way for every such drawing: a SMILES's, and the
 * structures a step makes.
 */
export async function drawingOf(molblock: string, style?: DrawingStyle): Promise<Model> {
  const result = await processFileContent("drawing.mol", molblock);
  const drawn = editorModelOf(result.model);
  return laidOut(drawn, style).catch((e: unknown) => {
    console.warn("the structure is drawn as the plugin laid it out", e);
    return drawn;
  });
}
