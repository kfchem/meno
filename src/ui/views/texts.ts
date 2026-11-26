/**
 * Texts opened - a file opened as text, a new one - go to the workspace in
 * front, into its column (docs/WORKSPACE.md, *Texts*): each canvas that is
 * a tab's own says how it takes one, while it is there, and the app asks
 * the one in front. Where none is in front, a canvas opens for it.
 */

/** A text opened: its name - none, a new one - its words, where it is, where Open said, and whether it is Markdown, as its file was. */
export type OpenedText = { name: string; text: string; path?: string; markdown?: true };

const takers = new Map<string, (texts: OpenedText[]) => void>();

/** Sets how tab `id` takes texts; the function returned takes it away again. */
export function setTextTaker(id: string, take: (texts: OpenedText[]) => void): () => void {
  takers.set(id, take);
  return () => {
    if (takers.get(id) === take) takers.delete(id);
  };
}

/** How tab `id` takes texts, where it takes them. */
export function textTakerOf(id: string): ((texts: OpenedText[]) => void) | undefined {
  return takers.get(id);
}
