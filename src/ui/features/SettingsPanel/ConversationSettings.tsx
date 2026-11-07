import { useEffect, useState } from "react";
import RoleChoices from "./RoleChoices";
import { rolePlugin } from "../../../lib/roles/worker";
import { useReaders } from "../../../lib/calc/workers";
import { forgetKey, keepKey, keyHeld } from "../../../lib/roles/modelKey";

const BUTTON = "h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50";

/**
 * Settings, Conversations (docs/CONVERSATIONS.md, *Connections*): who
 * talks with a model for a conversation - the plugin that fills the role -
 * its options, and the key for its service. The key is typed once and kept
 * by the system's keychain: never shown again, only whether one is kept.
 */
export default function ConversationSettings() {
  useReaders((s) => s.state);
  const p = rolePlugin("language-model");
  return (
    <>
      <RoleChoices where="conversations" />
      {p && <KeyRow plugin={p.id} name={p.name} />}
    </>
  );
}

/** The key for `plugin`'s service: whether one is kept, a field to give one, and Forget. */
function KeyRow({ plugin, name }: { plugin: string; name: string }) {
  const [held, setHeld] = useState<boolean | null>(null);
  const [nowhere, setNowhere] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void keyHeld(plugin).then((r) => {
      if (!live) return;
      if ("why" in r) setNowhere(r.why);
      else setHeld(r.held);
    });
    return () => {
      live = false;
    };
  }, [plugin]);
  const act = async (doing: () => Promise<string | null>, after: boolean) => {
    setBusy(true);
    const why = await doing();
    setBusy(false);
    setProblem(why);
    if (!why) {
      setHeld(after);
      setTyped("");
    }
  };
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">Its key</h3>
      <div className="mt-2 rounded-lg border border-gh-line bg-white px-3 py-2.5 text-sm">
        {nowhere ? (
          <p className="text-accel-accent">{nowhere}</p>
        ) : (
          <>
            <p className="text-gh-gray">
              The key {name} uses with its service, kept in the system&apos;s keychain. It is never shown again, nor written to Meno&apos;s log.
            </p>
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) void act(() => keepKey(plugin, typed), true);
              }}
            >
              <span className="text-xs text-gh-black w-20 shrink-0">{held == null ? "" : held ? "Kept" : "None kept"}</span>
              <input
                type="password"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label={`The key for ${name}`}
                placeholder={held ? "A new key" : "The key"}
                autoComplete="off"
                spellCheck={false}
                className="h-7 min-w-0 flex-1 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black"
              />
              <button type="submit" className={BUTTON} disabled={busy || !typed.trim()}>
                Keep
              </button>
              {held && (
                <button type="button" className={BUTTON} disabled={busy} onClick={() => void act(() => forgetKey(plugin), false)}>
                  Forget
                </button>
              )}
            </form>
            {problem && <p className="mt-1 text-xs text-accel-accent">{problem}</p>}
          </>
        )}
      </div>
    </section>
  );
}
