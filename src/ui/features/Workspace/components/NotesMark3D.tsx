import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { usePresence } from "../../../theme/presence";
import { NOTES_MARK_GAP_PX, NOTES_MARK_PX, notesTip } from "../utils/molecule3d";
import { PAGE_PX, pagePx } from "../utils/pageScale";
import MarkBoxes2D from "./MarkBoxes2D";
import PageHtml from "./PageHtml";
import PageTip from "./PageTip";

/** The round the mark takes the pointer in, in page pixels (a bond is 48): wider than the mark (utils/molecule3d `NOTES_MARK_PX`), scaled with the page as all of it is. */
const HIT_PX = 13;
/** Over the page, under the molecules' own HTML, as the chips it stands for were. */
const TIP_Z: [number, number] = [30, 20];

/**
 * What a molecule in 3D says about its data (utils/molecule3d `notesOf`):
 * one small mark just over it, the 2D marks' ring (MarkBoxes2D) drawn by
 * WebGL with the page, however many notes it has, and none where it has
 * none; easing in as they come and out as they go. Its words show only
 * while the pointer rests on the mark - not on the molecule, which is
 * pointed at all the time it is turned - in the page's tip (PageTip), one
 * line to a note; a screen reader reads them from it at rest. Drawn where
 * the parent's group stands: the molecule's top right corner as seen,
 * the mark beside it - never over a set's name above it, nor its atoms.
 */
export default function NotesMark3D({ notes }: { notes: readonly string[] }) {
  const words = notesTip(notes);
  const shown = usePresence(words ? [words] : [], () => "notes");
  const [pointed, setPointed] = useState(false);
  const camera = useThree((s) => s.camera);
  // (none pointed at once it says nothing: a mark come back is not pointed at until it is)
  useEffect(() => {
    if (!words) setPointed(false);
  }, [words]);
  // (its middle: beside the molecule's top right corner, the gap to its right, its top level with the molecule's top)
  const ax = (NOTES_MARK_GAP_PX + NOTES_MARK_PX / 2) * PAGE_PX;
  const at = (-NOTES_MARK_PX / 2) * PAGE_PX;
  const box = useMemo(() => ({ key: "notes", x: ax, y: at, w: NOTES_MARK_PX * PAGE_PX, h: NOTES_MARK_PX * PAGE_PX, round: true }), [ax, at]);
  const leaving = useMemo(() => new Set(words ? [] : ["notes"]), [words]);
  if (!shown.length) return null;
  const said = words ?? (shown[0].item as string);
  return (
    <group>
      <MarkBoxes2D boxes={[box]} leaving={leaving} />
      {/* (its words for a screen reader, at rest; its room, for a fit to take in; and, while it says anything, a round wider
          than the mark, unseen, that takes the pointer - HTML, as the handle of a mark is (docs/LOOK.md, rule 7): a mesh of the
          molecule's there was never pointed at in a set, whose frame takes the pointer first) */}
      <PageHtml position={[ax, at, 0]} center zIndexRange={TIP_Z} style={{ pointerEvents: "none" }}>
        <div role="note" data-notes-mark="" data-fit-page="" className="relative" style={{ width: pagePx(NOTES_MARK_PX), height: pagePx(NOTES_MARK_PX) }}>
          <span className="sr-only">{said}</span>
          {words && (
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: pagePx(2 * HIT_PX), height: pagePx(2 * HIT_PX), pointerEvents: "auto" }}
              onPointerEnter={() => setPointed(true)}
              onPointerLeave={() => setPointed(false)}
            />
          )}
        </div>
      </PageHtml>
      {pointed && words && (
        <PageTip tipKey="notes" x={ax} y={at} w={NOTES_MARK_PX * PAGE_PX} h={NOTES_MARK_PX * PAGE_PX} zoom={camera.zoom || 1} text={words} zIndexRange={TIP_Z} aboveFirst />
      )}
    </group>
  );
}
