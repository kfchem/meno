/**
 * A warning in the line over the canvas about a structure, tied to it: out
 * of sight while an undo has taken the structure away, and in sight again
 * as a redo brings it back - with nothing said of its own about either. An
 * edit made while it is out of sight (what it was about cannot come back by
 * redo then, and its atoms' ids can be given again), or one that takes the
 * structure away - deleted - lets it go for good. Plain, to be tested
 * without a page; the line itself is utils/alerts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentStore } from "../../../../lib/doc/document";
import type { WorkspaceDocument } from "../document";

type Atoms = { atoms: readonly { id: number }[] };

/** A warning's words, the atoms of what it is about, and whether an undo has them out of the drawing now. */
export type Tied = { text: string; atoms: readonly number[]; hidden: boolean };

/** Whether any of what `t` is about is in `model`. */
function there(t: Tied, model: Atoms): boolean {
  const ids = new Set(t.atoms);
  return model.atoms.some((a) => ids.has(a.id));
}

/** A warning about `atoms`, given with `model` as it is: out of sight already where they are gone (said after an undo took them). */
export function tiedTo(text: string, atoms: Iterable<number>, model: Atoms): Tied {
  const t = { text, atoms: [...atoms], hidden: false };
  return { ...t, hidden: !there(t, model) };
}

/** What `t` is once the document has changed (`change`, as DocumentStore `lastChange` says it) to `model`: null, let go for good. */
export function tiedAfter(t: Tied, model: Atoms, change: "edit" | "travel" | "reset" | "amend"): Tied | null {
  // (what is learnt rewritten into the history: nothing drawn changed)
  if (change === "amend") return t;
  const now = there(t, model);
  if (change === "travel") return now === !t.hidden ? t : { ...t, hidden: !now };
  return t.hidden || !now ? null : t;
}

/**
 * The chemistry's line (`said`, `setSaid`) with warnings tied to what they
 * are about (`sayAbout`): `shown`, what the line shows now - nothing while
 * the one said is out of sight. Any other words put in the line, or none,
 * end the tie.
 */
export function useTiedSaying(
  doc: DocumentStore<WorkspaceDocument> | undefined,
  said: string | null,
  setSaid: (text: string | null) => void,
): { shown: string | null; sayAbout: (text: string, atoms: Iterable<number>) => void } {
  const [tied, setTied] = useState<Tied | null>(null);
  const held = useRef(tied);
  held.current = tied;
  const sayAbout = useCallback(
    (text: string, atoms: Iterable<number>) => {
      const t = doc ? tiedTo(text, atoms, doc.getState().model) : null;
      setTied(t);
      setSaid(text);
    },
    [doc, setSaid],
  );
  const live = tied != null && tied.text === said;
  useEffect(() => {
    if (!doc || !live) return;
    return doc.subscribe(() => {
      const t = held.current;
      if (!t) return;
      const next = tiedAfter(t, doc.getState().model, doc.lastChange());
      if (next === t) return;
      setTied(next);
      if (!next) setSaid(null);
    });
  }, [doc, live, setSaid]);
  return { shown: live && tied.hidden ? null : said, sayAbout };
}
