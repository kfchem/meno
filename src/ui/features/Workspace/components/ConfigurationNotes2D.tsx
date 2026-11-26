import { useEffect, useState } from "react";
import { DURATION } from "../../../theme/motion";
import { useEditor, useEditorStore } from "../store";
import type { ConfigurationNote } from "../store/types";
import { pageSized } from "../utils/pageScale";
import PageHtml from "./PageHtml";

/** A note as large as the page draws it at every zoom, hung from its foot (utils/pageScale `pageSized`). */
const NOTES_SIZED = pageSized("foot");

/** How long a note stays once it has come, before it eases out, in milliseconds. */
export const NOTE_STAYS_MS = 2600;

/**
 * The notes of changes of configuration (configuration/watch; docs/EDITOR-2D.md, *When an edit turns a configuration*): each by its unit,
 * in the widest gap between its bonds, past their labels (configuration/watch `placeOf`) - "C3: R, now S" - easing in, staying a moment, easing out, then let go. They never ask anything nor take the
 * pointer: the drawing wins. A mark of Meno's, never in a picture of the drawing.
 */
export default function ConfigurationNotes2D() {
  const notes = useEditor((s) => s.configurationNotes);
  const store = useEditorStore();
  const [, tick] = useState(0);
  // (let go once eased out; looked at again when the next one is due to go)
  useEffect(() => {
    if (!notes.length) return;
    const now = performance.now();
    const gone = (n: ConfigurationNote) => now - n.since >= NOTE_STAYS_MS + DURATION.base * 1000;
    if (notes.some(gone)) {
      store.setState((s) => ({ configurationNotes: s.configurationNotes.filter((n) => performance.now() - n.since < NOTE_STAYS_MS + DURATION.base * 1000) }));
      return;
    }
    const next = Math.min(...notes.map((n) => n.since + (now - n.since < NOTE_STAYS_MS ? NOTE_STAYS_MS : NOTE_STAYS_MS + DURATION.base * 1000)));
    const t = window.setTimeout(() => tick((k) => k + 1), Math.max(0, next - now) + 20);
    return () => window.clearTimeout(t);
  });
  return (
    <>
      {notes.map((n) => (
        <ConfigurationNote2D key={n.id} note={n} leaving={performance.now() - n.since >= NOTE_STAYS_MS} />
      ))}
    </>
  );
}

function ConfigurationNote2D({ note, leaving }: { note: ConfigurationNote; leaving: boolean }) {
  return (
    <group position={[note.at.x, note.at.y, 0]}>
      <PageHtml zIndexRange={[34, 24]}>
        <div
          className="meno-fade-in"
          role="status"
          style={{
            transform: "translate(-50%, -100%)",
            opacity: leaving ? 0 : 1,
            transition: `opacity ${DURATION.base * 1000}ms var(--ease-meno-leave)`,
            pointerEvents: "none",
          }}
        >
          <div style={NOTES_SIZED}>
            <div className="rounded-full border border-gh-line bg-white/90 px-2 text-[11px] leading-[20px] text-gh-gray shadow-sm whitespace-nowrap">{note.text}</div>
          </div>
        </div>
      </PageHtml>
    </group>
  );
}
