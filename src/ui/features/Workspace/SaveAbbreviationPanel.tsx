import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useAppSettings } from "../../../lib/settings/appSettings";
import AbbreviationForm from "../../abbreviations/AbbreviationForm";
import { useEditor } from "./store";
import { groupShape } from "./utils/groupShape";

/**
 * The selected group saved as an abbreviation of the user's own, beside the
 * canvas: its structure as the selection has it, a label and a name to give
 * it - and, unless asked not to, the group shown as that label here.
 */
export default function SaveAbbreviationPanel({
  ids,
  smiles,
  onClose,
}: {
  ids: number[];
  smiles: string;
  onClose: () => void;
}) {
  const mine = useAppSettings((s) => s.abbreviations);
  const setAbbreviations = useAppSettings((s) => s.setAbbreviations);
  const contract = useEditor((s) => s.contractToAbbreviation);
  const [here, setHere] = useState(true);
  // the group changed - an undo took an atom of it away - takes the panel
  // with it: its SMILES, and the atoms it would show as the label, were
  // the group's as it was (a "tBu" came to hold an isopropyl)
  const shape = useEditor((s) => groupShape(s.model, ids));
  const [opened] = useState(shape);
  useEffect(() => {
    if (shape !== opened) onClose();
  }, [shape, opened, onClose]);
  return (
    <aside
      aria-label="Save as abbreviation"
      className="w-[25rem] max-w-[50vw] shrink-0 h-full border-l border-gh-line bg-white flex flex-col"
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-gh-line">
        <h2 className="text-sm font-semibold text-gh-black">Save as abbreviation</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 py-3">
        <p className="mb-3 text-xs leading-snug text-gh-gray">
          The selected atoms, as a label of your own: kept in Settings › Dictionary, and read on every canvas
          as Meno&apos;s own abbreviations are. The * is where the group is attached.
        </p>
        <AbbreviationForm
          initial={{ smiles }}
          saveText="Save"
          onCancel={onClose}
          onSave={(a) => {
            setAbbreviations([...mine, a]);
            if (here) contract(new Set(ids), a.label);
            onClose();
          }}
        >
          <label className="flex items-center gap-2 text-xs text-gh-black">
            <input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} />
            Show these atoms as the label here
          </label>
        </AbbreviationForm>
      </div>
    </aside>
  );
}
