import { useCallback, useEffect, useState } from "react";
import { defaultsNote, defaultsState, offerMeno, openDefaultApps, rowFor, makeDefault, withdrawMeno, type DefaultsState, type FormatDefault } from "../../../lib/defaultApps";
import { useAppSettings } from "../../../lib/settings/appSettings";

/**
 * Files in Settings, *Opening files*: each format Meno is offered for, the
 * app that opens it now, and a button to make it Meno - or, on macOS, the
 * app it replaced again (lib/defaultApps). What the system says is read
 * again whenever Meno comes back to the front, so a default changed
 * elsewhere shows as it is.
 */
export default function DefaultAppSettings() {
  const [state, setState] = useState<DefaultsState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = useAppSettings((s) => s.files);
  const setFiles = useAppSettings((s) => s.setFiles);

  const read = useCallback(() => {
    void defaultsState().then(setState, (e) => setError(String(e)));
  }, []);
  useEffect(() => {
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [read]);

  const act = async (f: FormatDefault, id: string) => {
    setBusy(f.ext);
    setError(null);
    try {
      if (id === "use") {
        // (the app it opened with before, kept to be offered back)
        const before = f.app && f.path && !f.meno ? { ...files.before, [f.ext]: { name: f.app, path: f.path } } : files.before;
        await makeDefault(f.ext);
        setFiles({ ...files, ...(before ? { before } : {}) });
      } else if (id === "back") {
        const was = files.before?.[f.ext];
        if (was) await makeDefault(f.ext, was.path);
        const { [f.ext]: _gone, ...rest } = files.before ?? {};
        setFiles({ ...files, before: rest });
      } else if (id === "offer") await offerMeno(f.ext);
      else if (id === "settings") await openDefaultApps();
      else if (id === "withdraw") await withdrawMeno(f.ext);
    } catch (e) {
      setError(`.${f.ext}: ${String(e)}`);
    } finally {
      setBusy(null);
      read();
    }
  };

  if (!state) return null;
  return (
    <div>
      {state.formats.length > 0 && (
        <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
          {state.formats.map((f) => {
            const row = rowFor(state.can, f, files.before?.[f.ext]);
            return (
              <div key={f.ext} className="px-4 py-2">
                <div className="grid grid-cols-[5rem_minmax(8rem,1fr)_auto] gap-4 items-center">
                  <span className="text-sm text-gh-black">.{f.ext}</span>
                  <span className={`text-xs ${f.meno ? "text-gh-black" : "text-gh-gray"}`}>{row.opens}</span>
                  <span className="flex gap-2">
                    {row.actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={busy != null}
                        onClick={() => void act(f, a.id)}
                        className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50"
                      >
                        {a.label}
                      </button>
                    ))}
                  </span>
                </div>
                {row.note && <p className="mt-1 text-xs text-gh-gray">{row.note}</p>}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-gh-gray">{defaultsNote(state)}</p>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
