/**
 * What the canvas has to say, in the line over it: what opening a file
 * could not read, what Save or Export could not do or could not keep, what
 * a check of the chemistry could not do. Each is said in a line of its own,
 * one over the other, and dismissed by itself - so that what Save could not
 * keep is never hidden behind what opening could not read, nor that behind
 * it.
 */

export type CanvasAlert = { key: "import" | "files" | "chem"; text: string; dismiss: () => void };

/** The lines to show, in this order: opening's, the file actions', the chemistry's - each that has something to say. */
export function canvasAlerts(said: {
  import?: { text: string; dismiss: () => void } | null;
  files?: { text: string | null; dismiss: () => void };
  chem?: { text: string | null; dismiss: () => void };
}): CanvasAlert[] {
  const out: CanvasAlert[] = [];
  if (said.import) out.push({ key: "import", ...said.import });
  if (said.files?.text) out.push({ key: "files", text: said.files.text, dismiss: said.files.dismiss });
  if (said.chem?.text) out.push({ key: "chem", text: said.chem.text, dismiss: said.chem.dismiss });
  return out;
}
