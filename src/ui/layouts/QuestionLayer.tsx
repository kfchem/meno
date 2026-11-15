import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { QUESTION_LAYER } from "../guide/layers";

/**
 * Where a question about the whole window is asked - may it use the
 * network, close Meno, add a style file, remove a plugin: a layer of the
 * window's own, over everything opened over a canvas (ui/guide/layers), so
 * that Quick Add or a menu left open never lies over its words. What is in
 * it takes the pointer; the layer itself, empty, takes nothing.
 *
 * A question about one tab - a canvas's - is asked in that tab's own top
 * layer instead (layouts/AboveGuide): never over another tab, and gone with
 * its tab while another is in front. Either way its keys are the
 * question's (layouts/asking).
 */
export default function QuestionLayer({ children }: { children: ReactNode }) {
  // (with no page to put it on - drawn on the server, in a test - the question as it is, in place)
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(
    <div className="fixed inset-0 pointer-events-none [&>*]:pointer-events-auto" style={{ zIndex: QUESTION_LAYER }}>
      {children}
    </div>,
    document.body,
  );
}
