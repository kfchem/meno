import { motion } from "motion/react";
import { FADE, RISE } from "../theme/motion";
import { useEffect, useRef, useState } from "react";
import { useAskedKeys } from "./asking";

/**
 * Asks for a name - a procedure's, as it is saved. Drawn in the page, as
 * ConfirmDiscard is, so that it looks the same on every platform: a title,
 * a line saying what is named, the name - suggested, all of it chosen, so
 * that typing replaces it - and Cancel and the button that saves it. Enter
 * saves, Escape or a press outside cancels.
 */
export default function NameDialog({
  title,
  message,
  initial,
  saveLabel,
  onCancel,
  onSave,
}: {
  title: string;
  message: string;
  initial: string;
  saveLabel: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  // (the keys its own while it asks: Escape cancels, and nothing behind it acts on one)
  useAskedKeys(boxRef, onCancel);
  const ready = name.trim().length > 0;
  return (
    <motion.div
      {...FADE}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/20"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.form
        ref={boxRef}
        {...RISE}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        className="w-[380px] max-w-[90%] rounded-lg border border-gh-line bg-white shadow-lg p-4 text-sm text-gh-black"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSave(name.trim());
        }}
      >
        <h2 id="name-dialog-title" className="font-semibold mb-2 break-words">
          {title}
        </h2>
        <p className="text-gh-gray mb-3">{message}</p>
        <input
          ref={inputRef}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
          className="mb-4 h-8 w-full rounded-md border border-gh-line bg-white px-2 text-sm text-gh-black focus:outline-none focus:ring-2 focus:ring-accel-base/40"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gh-line px-3 py-1.5 transition-colors duration-150 ease-meno hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready}
            className="rounded-md bg-accel-base px-3 py-1.5 text-white transition-opacity duration-150 ease-meno disabled:opacity-40"
          >
            {saveLabel}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
