import { useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { useReaders } from "../../../lib/calc/workers";
import { ProcedureGlyph } from "../Workspace/workflow/icons";
import { procedureFileName, procedureLine, procedureNeeds, proceduresSaved, procedureWorkspace, removeProcedure, renameProcedure, type Procedure } from "../Workspace/workflow/procedures";

const BUTTON = "h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50";

/**
 * The procedures saved, in Settings, Calculations (docs/WORKFLOWS.md,
 * *Procedures*): each its name, what it does - its steps and who does
 * them, in order - and what it needs that is not added; renamed, written
 * as a workspace to share, or taken away.
 */
export default function ProcedureSettings() {
  const saved = useAppSettings((s) => s.procedures);
  // (what a procedure needs changes as plugins are added and taken away)
  useReaders((r) => r.state);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [problem, setProblem] = useState<string>();
  const procedures = proceduresSaved(saved);
  if (!procedures.length) {
    return (
      <div className="rounded-lg border border-dashed border-gh-line px-4 py-6 text-center text-sm text-gh-gray">
        None yet. Right-click a step or a set on the page, then Save as procedure…
      </div>
    );
  }
  const writeOut = async (p: Procedure) => {
    setProblem(undefined);
    try {
      const picked = await saveDialog({ title: "Save procedure", defaultPath: procedureFileName(p.name), filters: [{ name: "Meno workspace", extensions: ["meno"] }] });
      if (!picked) return;
      await writeFile(/\.meno$/i.test(picked) ? picked : `${picked}.meno`, await procedureWorkspace(p));
    } catch (e) {
      setProblem(`The procedure could not be saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <div>
      <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line/60">
        {procedures.map((p) => {
          const needs = procedureNeeds(p.parts);
          const editing = renaming?.id === p.id;
          return (
            <div key={p.id} className="py-2.5 pl-3 pr-3 flex items-center gap-3">
              <span className="text-gh-gray">
                <ProcedureGlyph size={16} />
              </span>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameProcedure(p.id, renaming.name);
                      setRenaming(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={renaming.name}
                      maxLength={80}
                      aria-label="Name"
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      onBlur={() => {
                        renameProcedure(p.id, renaming.name);
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="h-7 w-full rounded-md border border-gh-line bg-white px-2 text-sm text-gh-black focus:outline-none focus:ring-2 focus:ring-accel-base/40"
                    />
                  </form>
                ) : (
                  <div className="truncate text-sm text-gh-black" title={p.name}>
                    {p.name}
                  </div>
                )}
                <div className="truncate text-xs text-gh-gray" title={procedureLine(p.parts)}>
                  {procedureLine(p.parts)}
                </div>
                {needs.length > 0 && <div className="text-xs text-gh-gray">Needs {needs.join(" and ")}, in Plugins.</div>}
              </div>
              <button className={BUTTON} onClick={() => setRenaming({ id: p.id, name: p.name })} disabled={editing}>
                Rename
              </button>
              <button className={BUTTON} onClick={() => void writeOut(p)}>
                Save as file…
              </button>
              <button className={BUTTON} onClick={() => removeProcedure(p.id)}>
                Remove
              </button>
            </div>
          );
        })}
      </div>
      {problem && <p className="mt-2 text-xs text-accel-accent meno-fade-in">{problem}</p>}
    </div>
  );
}
