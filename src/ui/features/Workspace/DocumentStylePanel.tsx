import { XMarkIcon } from "@heroicons/react/24/outline";
import StyleEditor from "../StyleEditor";
import clsx from "clsx";
import { useState } from "react";
import { useEditor, useEditorStore } from "./store";
import Styles3DPart from "./Styles3DPart";

/**
 * The styles of the workspace on this canvas: its drawing style - its one,
 * every structure on it drawn in it (docs/WORKSPACE.md, *Drawing style*) -
 * and its styles in 3D (./Styles3DPart). A change is an edit to the
 * workspace, one step, so undo takes it back like any other; Settings'
 * styles are for new workspaces only.
 */
export default function DocumentStylePanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const style = useEditor((s) => s.docStyle);
  const setDocumentStyle = useEditor((s) => s.setDocumentStyle);
  const easeDocumentStyle = useEditor((s) => s.easeDocumentStyle);
  // (which of its styles is shown: a workspace of molecules in 3D alone opens on theirs)
  const store = useEditorStore();
  const [part, setPart] = useState<"drawing" | "3d">(() => {
    const { model, molecules3d } = store.getState();
    return !model.atoms.length && molecules3d.length ? "3d" : "drawing";
  });

  return (
    <aside
      aria-label="Styles for this workspace"
      className="w-[25rem] max-w-[50vw] shrink-0 h-full border-l border-gh-line bg-white flex flex-col"
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-gh-line">
        <h2 className="text-sm font-semibold text-gh-black">Styles</h2>
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
        <p className="text-xs text-gh-gray leading-snug">
          The styles this workspace is drawn in. New workspaces take the ones in
          Settings.
        </p>
        <div className="mt-3 flex rounded-md border border-gh-line overflow-hidden" role="group" aria-label="Which styles">
          {(["drawing", "3d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPart(p)}
              aria-pressed={p === part}
              className={clsx(
                "flex-1 h-7 text-xs border-l border-gh-line first:border-l-0",
                p === part ? "bg-accel-base text-white" : "bg-white text-gh-gray hover:bg-gh-base",
              )}
            >
              {/* (as Settings names its tabs: one word each) */}
              {p === "drawing" ? "Drawing" : "3D"}
            </button>
          ))}
        </div>
        {part === "drawing" ? (
        <div className="mt-3">
          <StyleEditor
            layout="narrow"
            choice={style}
            onChange={(next, setting) =>
              // (a slider's or a box's setting: converted as it goes; a preset: eased in)
              setting ? setDocumentStyle(next, `style:${setting}`) : easeDocumentStyle(next)
            }
          />
        </div>
        ) : (
        <div className="mt-3">
          <Styles3DPart />
        </div>
        )}
      </div>
    </aside>
  );
}
