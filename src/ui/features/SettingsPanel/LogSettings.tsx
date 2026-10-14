import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/**
 * Meno's log, shown where it is kept (docs/ARCHITECTURE.md, *Meno's log*):
 * its folder opened in the Finder or Explorer - made first, where Meno has
 * not written one yet - with the log in it, to send with a report.
 */
export default function LogSettings() {
  const [failed, setFailed] = useState(false);
  const open = async () => {
    try {
      setFailed(false);
      await revealItemInDir(await invoke<string>("log_spot"));
    } catch (e) {
      console.warn("the log's folder could not be shown", e);
      setFailed(true);
    }
  };
  return (
    <div className="mt-4 rounded-lg border border-gh-line bg-white">
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">Meno's log</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">
            What Meno noted about itself as it ran, for a report when something goes wrong. Nothing from your documents is in it.
            {failed && <span className="block text-gh-black mt-1">The folder could not be opened.</span>}
          </p>
        </div>
        <button onClick={() => void open()} className="shrink-0 h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base">
          Open log folder
        </button>
      </div>
    </div>
  );
}
