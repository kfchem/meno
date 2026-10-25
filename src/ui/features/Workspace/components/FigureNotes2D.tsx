import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DURATION } from "../../../theme/motion";
import { useEditor, useEditorStore } from "../store";
import { figureNotePlaces, figureNoteShown, figureNotesKey, figureNoteSource, figureNotesOf, figureNoteText, figureNoteTitle, type FigureNote, type NotePlaces } from "../utils/figureNotes";
import { pageScale } from "../utils/pageScale";
import PageHtml from "./PageHtml";

/** Below this many screen pixels to a bond the note is a dot, its words too small to read: a page pixel's scale, a bond being 48 of them. */
const DOT_BELOW = 12 / 48;

/** A note shown, or going: what it says, where it stands, and since when it has been going. */
type Shown = { key: number; note: FigureNote; at: { x: number; y: number }; leaving: number | null; quiet: boolean };

/**
 * The notes over the structures in 2D read from a figure (docs/PDF.md,
 * *Read from a figure*), as the 3D molecules' notes are: "Read from a
 * figure: check it" - and how many parts are still unsure - centred over
 * the structure's ink, half a bond off; scaled with the page within the
 * molecules' notes' bounds, and a dot where a bond is under 12 pixels on
 * the screen. One comes in once the structure has landed, not while it is
 * carried out of a PDF; said to be checked (its menu), it goes, eased. A
 * mark of Meno's, never in a picture of the drawing.
 */
export default function FigureNotes2D() {
  const model = useEditor((s) => s.model);
  const flying = useEditor((s) => s.pdfStructureFlight != null);
  // (worked out again only where what they depend on has changed: not at each frame of a drag - figureNotesKey)
  const key = useMemo(() => figureNotesKey(model), [model]);
  const held = useRef<{ key: string; notes: FigureNote[] } | null>(null);
  if (held.current?.key !== key) held.current = { key, notes: figureNotesOf(model) };
  const all = held.current.notes;
  // (the note over each with parts still unsure; where one came from, only while the pointer is on it - on an atom or a bond of it)
  const pointed = useEditor((s) => s.hovered.atomId ?? (s.hovered.bondId != null ? (s.model.bonds.find((b) => b.id === s.hovered.bondId)?.a ?? null) : null));
  const notes = useMemo(() => all.filter((n) => figureNoteShown(n) || (pointed != null && n.atoms.has(pointed))), [all, pointed]);
  // (and where they stand, again only for a structure moved: the one dragged - figureNotePlaces)
  const places = useRef<NotePlaces>(new Map());
  const [shown, setShown] = useState<Shown[]>([]);
  useEffect(() => {
    setShown((was) => {
      const now = performance.now();
      const at = figureNotePlaces(model, notes, places.current);
      const fresh = notes.map((note): Shown => ({ key: Math.min(...note.atoms), note, at: at.get(Math.min(...note.atoms))!, leaving: null, quiet: !figureNoteShown(note) }));
      const keys = new Set(fresh.map((s) => s.key));
      const had = new Set(was.filter((s) => s.leaving == null).map((s) => s.key));
      // (while one is carried out of a PDF: none comes in that was not shown before - it comes once the structure has landed)
      const coming = flying ? fresh.filter((s) => had.has(s.key)) : fresh;
      const going = was.filter((s) => !keys.has(s.key)).map((s) => (s.leaving == null ? { ...s, leaving: now } : s));
      return [...coming, ...going.filter((s) => now - (s.leaving ?? now) < DURATION.base * 1000)];
    });
  }, [notes, model, flying]);
  // (each going one let go once it has faded)
  useEffect(() => {
    if (!shown.some((s) => s.leaving != null)) return;
    const t = window.setTimeout(() => setShown((was) => was.filter((s) => s.leaving == null || performance.now() - s.leaving < DURATION.base * 1000)), DURATION.base * 1000 + 20);
    return () => window.clearTimeout(t);
  }, [shown]);
  return (
    <>
      {shown.map((s) => (
        <FigureNote2D key={s.key} shown={s} />
      ))}
    </>
  );
}

function FigureNote2D({ shown }: { shown: Shown }) {
  const store = useEditorStore();
  const camera = useThree((s) => s.camera);
  const [far, setFar] = useState(() => pageScale(camera.zoom || 1) < DOT_BELOW);
  const farRef = useRef(far);
  useFrame(() => {
    const now = pageScale(camera.zoom || 1) < DOT_BELOW;
    if (now !== farRef.current) setFar((farRef.current = now));
  });
  const { note, at, leaving, quiet } = shown;
  const from = useEditor((s) => s.pdfs.find((p) => p.sha256 === note.sha256)?.name ?? s.pictures.find((p) => p.sha256 === note.sha256)?.name ?? "the figure");
  const title = figureNoteTitle(from, note.page);
  // (its structure's menu, where it is right-clicked: as a right-click on the structure gives it)
  const menu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (leaving == null) store.getState().askPdfMenu({ id: Math.min(...note.atoms), clientX: e.clientX, clientY: e.clientY, kind: "atom" });
  };
  return (
    <group position={[at.x, at.y, 0]}>
      <PageHtml zIndexRange={[34, 24]}>
        <div
          className="meno-fade-in"
          style={{
            transform: "translate(-50%, -100%)",
            opacity: leaving == null ? 1 : 0,
            transition: `opacity ${DURATION.base * 1000}ms var(--ease-meno-leave)`,
            // (where it came from, said quietly: never in the pointer's way)
            pointerEvents: leaving == null && !quiet ? "auto" : "none",
          }}
          onContextMenu={menu}
          onPointerDown={(e) => e.button === 2 && e.stopPropagation()}
          title={title}
        >
          {/* (as large as the page draws it, between three quarters and half as large again: laid out at that size, its words crisp - utils/pageScale `PAGE_SIZED`) */}
          <div style={{ zoom: "clamp(0.75, var(--page, 1), 1.5)" }}>
          {quiet ? (
            far ? null : <div className="rounded-full border border-gh-line bg-white/90 px-2 text-[11px] leading-[20px] text-gh-gray shadow-sm whitespace-nowrap">{figureNoteSource(from, note.page)}</div>
          ) : far ? (
            <div aria-label={figureNoteText(note.unsure)} className="h-1.5 w-1.5 rounded-full border border-gh-line bg-white" />
          ) : (
            <div className="rounded-full border border-gh-line bg-white/90 px-2 text-[11px] leading-[20px] text-gh-gray shadow-sm whitespace-nowrap">{figureNoteText(note.unsure)}</div>
          )}
          </div>
        </div>
      </PageHtml>
    </group>
  );
}
