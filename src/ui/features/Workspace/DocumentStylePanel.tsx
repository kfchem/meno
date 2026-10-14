import { XMarkIcon } from "@heroicons/react/24/outline";
import StyleEditor from "../StyleEditor";
import { useEditor } from "./store";

/**
 * The drawing style of the workspace on this canvas - its one, every
 * structure on it drawn in it (docs/WORKSPACE.md, *Drawing style*). A
 * change is an edit to the workspace, one step, so undo takes it back like
 * any other; Settings' style is for new workspaces only.
 */
export default function DocumentStylePanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const style = useEditor((s) => s.docStyle);
  const setDocumentStyle = useEditor((s) => s.setDocumentStyle);
  const easeDocumentStyle = useEditor((s) => s.easeDocumentStyle);

  return (
    <aside
      aria-label="Drawing style for this workspace"
      className="w-[25rem] max-w-[50vw] shrink-0 h-full border-l border-gh-line bg-white flex flex-col"
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-gh-line">
        <h2 className="text-sm font-semibold text-gh-black">Drawing style</h2>
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
          The style this workspace is drawn in. New workspaces take the one in
          Settings.
        </p>
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
      </div>
    </aside>
  );
}
