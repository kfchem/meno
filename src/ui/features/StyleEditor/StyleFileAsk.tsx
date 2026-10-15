import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef } from "react";
import { styleFileName, type StyleFile } from "../../../lib/chem/styleFile";
import { useAskedKeys } from "../../layouts/asking";
import { FADE, RISE } from "../../theme/motion";
import { QUESTION_ARRIVING_MS, useLeaving } from "../../theme/leaving";

/**
 * Asked as a style file is opened (docs/FILE-IO.md, *What a .meno holds*):
 * add its styles to the user's own - and, where they say so, use them, the
 * drawing style in the workspace in front, the 3D one as the primary. It
 * never opens as a workspace. Escape, or a press outside, adds nothing.
 */
export default function StyleFileAsk({
  file,
  picture,
  canUse,
  onAdd,
  onCancel,
}: {
  file: StyleFile;
  /** A PNG of what it looks like, where the file has one. */
  picture: Uint8Array | null;
  /** Whether there is a workspace in front to use a drawing style in. */
  canUse: boolean;
  onAdd: (use: boolean) => void;
  onCancel: () => void;
}) {
  const addRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { held } = useLeaving(QUESTION_ARRIVING_MS);
  const id = useId();
  useEffect(() => addRef.current?.focus(), []);
  useAskedKeys(boxRef, onCancel);
  const url = useMemo(() => (picture ? URL.createObjectURL(new Blob([picture as BlobPart], { type: "image/png" })) : null), [picture]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  const count = file.drawing.length + file.molecules3d.length;
  const where = [file.drawing.length ? "drawing" : null, file.molecules3d.length ? "3D" : null].filter(Boolean).join(" and ");
  return (
    <motion.div
      {...FADE}
      {...held}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        ref={boxRef}
        {...RISE}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="w-[440px] max-w-[90%] rounded-lg border border-gh-line bg-white shadow-lg p-5 text-sm text-gh-black"
      >
        <h2 id={`${id}-title`} className="text-base font-semibold mb-2">
          Add the {count === 1 ? "style" : "styles"} {styleFileName(file)} to your styles?
        </h2>
        <p className="text-gh-gray leading-relaxed">
          {count === 1 ? "It is" : "They are"} offered with your own {where} styles in Settings
          {file.drawing.length ? ", and in every workspace's Drawing style" : ""}.
        </p>
        {url && <img src={url} alt="" className="mt-3 max-h-40 mx-auto object-contain" />}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-gh-line bg-white px-3 py-1.5 hover:bg-gh-base">
            Cancel
          </button>
          {(canUse || file.molecules3d.length > 0) && (
            <button onClick={() => onAdd(true)} className="rounded-md border border-gh-line bg-white px-3 py-1.5 hover:bg-gh-base">
              Add and use
            </button>
          )}
          <button ref={addRef} onClick={() => onAdd(false)} className="rounded-md border border-gh-line bg-gh-black px-3 py-1.5 text-white hover:bg-gray-800">
            Add
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
