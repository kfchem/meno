import { useEffect, useRef, type RefObject } from "react";

/**
 * The keys while a question is asked over the window - a box that waits
 * for an answer (ConfirmDiscard, NameDialog, ConsentDialog,
 * HideHydrogensAsk): the question's own, and nothing behind it acts on
 * them. Ctrl/Cmd+O opened a file behind "Close ...?", undo and Delete
 * changed the drawing behind it; now Escape answers no, the question's own
 * buttons and fields have the rest, and they go no further.
 *
 * Where one question is asked over another, the one asked last - on top -
 * has the keys.
 */

type Key = {
  key: string;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
  stopImmediatePropagation: () => void;
};

/** The questions being asked, the last asked last. */
const asked: object[] = [];

export type AskedKeys = {
  /** For the window, before anything else has a key: Escape answers no; a key pressed away from the question is for nothing. */
  first: (e: Key) => void;
  /** For the document, after the question's own have had a key: no further. */
  last: (e: Key) => void;
  /** The question answered: the keys back to what is behind it. */
  done: () => void;
};

/** Keys held for a question: `inside`, whether a key is pressed in it; `no`, its answer to Escape. */
export function askKeys(inside: (target: EventTarget | null) => boolean, no: () => void): AskedKeys {
  const me = {};
  asked.push(me);
  const onTop = () => asked[asked.length - 1] === me;
  return {
    first: (e) => {
      if (!onTop()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        no();
        return;
      }
      // (pressed with the keys behind it: neither typed there nor acted on - but Tab, which brings them to it)
      if (!inside(e.target)) {
        if (e.key !== "Tab") e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    last: (e) => {
      if (onTop()) e.stopPropagation();
    },
    done: () => {
      const at = asked.indexOf(me);
      if (at >= 0) asked.splice(at, 1);
    },
  };
}

/** A question's keys, while it is shown (`on`): `box`, the question; `no`, what Escape answers. */
export function useAskedKeys(box: RefObject<HTMLElement | null>, no: () => void, on = true): void {
  // (the answer as last given: asked once, however often the question is drawn)
  const answer = useRef(no);
  answer.current = no;
  useEffect(() => {
    if (!on) return;
    const keys = askKeys((t) => t instanceof Node && !!box.current?.contains(t), () => answer.current());
    window.addEventListener("keydown", keys.first, true);
    document.addEventListener("keydown", keys.last);
    return () => {
      window.removeEventListener("keydown", keys.first, true);
      document.removeEventListener("keydown", keys.last);
      keys.done();
    };
  }, [box, on]);
}
