/**
 * A drawing style chosen as a whole - a preset - taken without a jump
 * (docs/WORKSPACE.md, *Drawing style*): the new style at once, but its bond
 * printing from the old length to the new over `DURATION.move`, the page
 * converted at each frame from the page as it was (never frame upon frame)
 * and the frames one undo step. The view follows the bond (FollowStyle), so
 * the page holds still while the structures grow or shrink.
 */
import type { DocumentStore } from "../../../lib/doc";
import type { StyleChoice } from "../../../lib/chem/style";
import { DURATION } from "../../theme/motion";
import type { WorkspaceDocument } from "./document";
import { easeInOut } from "./presenting/zoomPath";
import { bondPtOf, restyledDocument } from "./restyle";
import { gestureStep } from "../../../lib/doc/document";

/** The ease under way in each document, so that one begun takes over from it. */
const going = new WeakMap<object, { stop: () => void }>();

/** `to` with its bond printing `pt` long. */
const withBond = (to: StyleChoice, pt: number): StyleChoice => ({ ...to, changes: { ...to.changes, bondLengthPt: pt } });

/**
 * `to` taken by `doc`, its bond eased in from the old one's length; `frame`
 * is asked for each frame of it (requestAnimationFrame on the page).
 */
export function easeStyle(doc: DocumentStore<WorkspaceDocument>, to: StyleChoice, frame: (go: () => void) => void = (go) => void requestAnimationFrame(go)): void {
  going.get(doc)?.stop();
  const start = doc.getState();
  const from = start.style ? bondPtOf(start.style) : null;
  const pt = bondPtOf(to);
  if (from == null || from === pt) {
    doc.edit("drawing style", () => restyledDocument(start, to));
    return;
  }
  const step = gestureStep(`style-ease:${performance.now()}`);
  const t0 = performance.now();
  let stopped = false;
  going.set(doc, { stop: () => (stopped = true) });
  // (the document as the last frame left it: anything else since - an undo, a slider, an edit - and the ease gives way)
  let last: WorkspaceDocument | null = null;
  const tick = () => {
    if (stopped) return;
    const now = doc.getState();
    if (last && now !== last) {
      going.delete(doc);
      // (an edit over the ease's own style: the style taken as chosen, from the page as it is - an undo has taken the style back, and is left so)
      if (now.style === last.style) doc.edit("drawing style", (d) => restyledDocument(d, to));
      return;
    }
    const t = Math.min(1, (performance.now() - t0) / (DURATION.move * 1000));
    // (from the page as it was each time: the last frame is the change made at once)
    doc.edit("drawing style", () => restyledDocument(start, t < 1 ? withBond(to, from + (pt - from) * easeInOut(t)) : to), step);
    last = doc.getState();
    if (t < 1) frame(tick);
    else going.delete(doc);
  };
  tick();
}
