import type { DrawingStyle } from "../../../../lib/chem/style";
import { readClipboard, readDrop, type ClipItem, type Flavor } from "../../../../lib/clipboard";
import { structureInPicture } from "../picture";
import type { Drawn } from "../store/types";
import { looksLikeSmiles, readRecord } from "../utils/copyPaste";
import { drawnOf, processFileContent } from "../utils/io";
import { readWorkspace } from "../utils/workspace";
import { kindOf, MENO_KINDS, type Kind } from "../../../../lib/io/kinds";
import { structureFromSmiles } from "./fromSmiles";

/**
 * The structure on the clipboard, if there is one, from the first of:
 * - Meno's own record of it, or the object for Office that holds it (on
 *   Windows, Word and PowerPoint copy one they hold with it; on a Mac,
 *   Word and PowerPoint hand over its storage);
 * - a picture Meno made of it - Office's clip format, handed back by Word
 *   or PowerPoint when the picture is copied there, or a PNG;
 * - an RXN file another program put there, laid out as a scheme;
 * - a MOL file another program put there;
 * - plain text, read as what it is (lib/io/kinds) - an RXN, MOL, SD or XYZ
 *   file, a calculation's output, Meno's own record - or else as a SMILES.
 * Null when there is nothing that reads as a structure.
 */
export async function structureOnClipboard(style?: DrawingStyle): Promise<Drawn | null> {
  return structureIn(readClipboard, true, style);
}

/**
 * The structure in what was just dropped on the page - a picture or an
 * object dragged out of Word or PowerPoint - read as a paste reads the
 * clipboard, but for plain text: a dragged file's path, say, is no SMILES.
 */
export async function structureInDrop(): Promise<Drawn | null> {
  return structureIn(readDrop, false);
}

async function structureIn(
  read: (flavors: Flavor[]) => Promise<ClipItem | null>,
  withText: boolean,
  style?: DrawingStyle,
): Promise<Drawn | null> {
  const own = await read(["meno", "embed"]);
  const record = own?.text != null ? readRecord(own.text) : null;
  if (record) return record;
  for (const flavor of ["object", "gvml", "png"] as const) {
    const picture = await read([flavor]);
    const found = picture && (await structureInPicture(picture));
    if (found) return found;
  }
  const rxn = await read(["rxn"]);
  if (rxn?.text) {
    const reaction = await processFileContent("clipboard.rxn", rxn.text, MENO_KINDS.rxn).catch(() => null);
    if (reaction) return drawnOf(reaction);
  }
  if (!withText) {
    const mol = await read(["mol"]);
    if (!mol?.text) return null;
    return asKind(mol.text, kindOf("", mol.text) ?? MENO_KINDS.mol, "dropped");
  }
  const item = await read(["mol", "text"]);
  const text = item?.text;
  if (!item || text == null) return null;
  // (a MOL file's flavour holding an RXN file is read as one: it starts $RXN)
  const kind = kindOf("", text) ?? (item.flavor === "mol" ? MENO_KINDS.mol : null);
  if (kind) return asKind(text, kind, "clipboard");
  if (looksLikeSmiles(text)) return structureFromSmiles(text.trim(), style);
  return null;
}

/** Text read as the kind it is: Meno's own record or workspace as they are, anything else as a file of that kind named for where it came from. */
async function asKind(text: string, kind: Kind, from: string): Promise<Drawn | null> {
  if (kind.id === MENO_KINDS.record.id) return readRecord(text);
  if (kind.id === MENO_KINDS.workspace.id) return readWorkspace(text)?.drawn ?? null;
  return drawnOf(await processFileContent(`${from}${kind.extensions[0] ?? ""}`, text, kind));
}
