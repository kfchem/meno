import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Open } from "./chem/make3d";
import { useInFront } from "../../layouts/inFront";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Asked before a structure is made in 3D when some of its stereo is drawn
 * without a configuration - those centres and bonds ringed on the drawing
 * meanwhile: every stereoisomer they make, one of them, or none for now, to
 * draw them first. A card over the canvas, not a dialog, so that what it
 * asks about stays in view.
 */
export default function Ask3D({
  open,
  onAll,
  onOne,
  onCancel,
}: {
  open: Open[];
  onAll: () => void;
  onOne: () => void;
  onCancel: () => void;
}) {
  const allRef = useRef<HTMLButtonElement>(null);
  // (Escape cancels while its tab is in front: in another tab it is that tab's, the card waiting)
  const inFront = useInFront();
  useEffect(() => {
    if (!inFront) return;
    allRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, inFront]);
  const centres = open.reduce((n, o) => n + o.atoms.length, 0);
  const bonds = open.reduce((n, o) => n + o.bonds.length, 0);
  const isomers = open.reduce((n, o) => n + o.isomers, 0);
  const what = [centres ? plural(centres, "stereocentre", "stereocentres") : "", bonds ? plural(bonds, "double bond", "double bonds") : ""]
    .filter(Boolean)
    .join(" and ");
  return (
    <motion.div
      role="dialog"
      aria-labelledby="ask-3d-title"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[90%] rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="ask-3d-title" className="font-semibold mb-1">
        Stereo not drawn
      </h2>
      <p className="text-gh-gray mb-3">
        {what} {centres + bonds === 1 ? "is" : "are"} drawn without a configuration, so the structure can be any of{" "}
        {isomers} stereoisomers.
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Cancel
        </button>
        <button onClick={onOne} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Make one
        </button>
        <button
          ref={allRef}
          onClick={onAll}
          className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95"
        >
          Make all {isomers}
        </button>
      </div>
    </motion.div>
  );
}
