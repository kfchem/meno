import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Switch from "../../../controls/Switch";
import { useEditor } from "../store";
import { kindInfo } from "../workflow/kinds";
import { connectionFor } from "./connections";
import { LIMITS, NO_CONNECTION } from "./turn";
import { answerLine, callSaid, exchangeRows, type ExchangeRow } from "./said";
import type { Conversation } from "./types";

/** One row of the exchange: words as words, never drawn as a page; a call with what came of it on its line, both folded below. */
function Row({ r }: { r: ExchangeRow }) {
  if (r.kind === "call")
    return (
      <details className="text-xs text-gh-gray">
        <summary className={clsx("cursor-default", r.answer && !r.answer.ok && "text-accel-accent")}>
          {callSaid(r.call)}
          {r.answer ? ` · ${answerLine(r.answer)}` : ""}
        </summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
          {r.call.tool}
          {r.call.args ? ` ${JSON.stringify(r.call.args)}` : ""}
          {r.answer ? `\n${JSON.stringify(r.answer.answer, null, 1)}` : ""}
        </pre>
      </details>
    );
  const s = r.said;
  if (s.by === "person")
    return <div className="self-end max-w-[85%] rounded-lg bg-gh-base px-3 py-2 text-sm text-gh-black whitespace-pre-wrap break-words">{s.text}</div>;
  if (s.by === "model") return <div className="max-w-[92%] text-sm text-gh-black whitespace-pre-wrap break-words">{s.text}</div>;
  return <div className="text-xs text-gh-gray">{"text" in s ? s.text : ""}</div>;
}

/**
 * A conversation read in the column (docs/CONVERSATIONS.md): what it talks
 * through - or that it sends nothing - its rights and whether it sees the
 * whole page; what was said, in turn; the changes a turn made, to keep or
 * discard, and the steps they make run again; a field to write in, and
 * Send or Stop; what was sent where; and Clear.
 */
export default function ConversationBody({ conversation: c }: { conversation: Conversation }) {
  const talking = useEditor((s) => s.talking[c.id]);
  const steps = useEditor((s) => s.steps);
  const update = useEditor((s) => s.updateConversation);
  const send = useEditor((s) => s.sendToConversation);
  const stop = useEditor((s) => s.stopConversation);
  const keep = useEditor((s) => s.keepConversationChanges);
  const discard = useEditor((s) => s.discardConversationChanges);
  const clear = useEditor((s) => s.clearConversation);
  const [words, setWords] = useState("");
  const [discardSaid, setDiscardSaid] = useState<string | null>(null);
  const connection = connectionFor(c);
  const running = !!talking?.running;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [c.said.length]);
  const go = () => {
    if (!words.trim() || running) return;
    void send(c.id, words);
    setWords("");
  };
  const runsAgain = (talking?.runsAgain ?? []).flatMap((id) => {
    const s = steps.find((x) => String(x.id) === id);
    return s ? [kindInfo(s.kind).name] : [];
  });
  return (
    <div className="absolute inset-0 flex flex-col bg-white">
      <div className="px-4 py-3 border-b border-gh-line flex flex-col gap-2 text-xs">
        <div className={clsx(connection ? "text-gh-gray" : "text-accel-accent", "flex items-start gap-1.5")}>
          {!connection && <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />}
          <span>{connection ? `Talks through ${connection.id}, ${connection.to === "this computer" ? "on this computer" : `sending to ${connection.to}`}.` : NO_CONNECTION}</span>
        </div>
        <label className="flex items-center gap-3">
          <span className="flex-1 text-gh-black">May read what lies inside its frame</span>
          <Switch on={c.rights.read} label="May read" onChange={(on) => update(c.id, { rights: { read: on } })} />
        </label>
        <label className="flex items-center gap-3">
          <span className="flex-1 text-gh-black">May propose changes there</span>
          <Switch on={c.rights.propose} label="May propose changes" onChange={(on) => update(c.id, { rights: { propose: on } })} />
        </label>
        <label className="flex items-center gap-3">
          <span className={clsx("flex-1", c.wholePage ? "text-accel-accent" : "text-gh-black")}>Sees the whole page</span>
          <Switch on={!!c.wholePage} tone="attention" label="Sees the whole page" onChange={(on) => update(c.id, { wholePage: on })} />
        </label>
        <div className="text-gh-gray">
          At most {LIMITS.replies} replies and {LIMITS.calls} tool calls for each message. It never runs anything: a step it adds runs when you run it.
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-3" aria-live="polite">
        {c.said.length === 0 && <div className="text-xs text-gh-gray">Nothing said yet. What it sees is what lies inside its frame on the page.</div>}
        {exchangeRows(c.said).map((r, k) => (
          <Row key={k} r={r} />
        ))}
        {running && <div className="text-xs text-gh-gray meno-fade-in">Talking…</div>}
        <div ref={end} />
      </div>
      {talking?.changed && (
        <div className="px-4 py-2 border-t border-gh-line flex flex-col gap-1.5 text-xs meno-fade-in">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-gh-black">It changed the page, as one undo step.</span>
            <button onClick={() => keep(c.id)} className="h-7 px-2.5 rounded-md border border-gh-line text-xs hover:bg-gh-base">
              Keep
            </button>
            <button
              onClick={() => {
                const r = discard(c.id);
                setDiscardSaid(r === "running" ? "A step it added is running: stop it first." : r === "since" ? "The page has changed since: undo is yours, step by step." : null);
              }}
              className="h-7 px-2.5 rounded-md border border-gh-line text-xs hover:bg-gh-base"
            >
              Discard
            </button>
          </div>
          {runsAgain.length > 0 && <div className="text-accel-accent">This makes {runsAgain.join(", ")} run again, when you next run it.</div>}
          {discardSaid && <div className="text-accel-accent">{discardSaid}</div>}
        </div>
      )}
      <div className="px-3 py-2 border-t border-gh-line flex items-end gap-2">
        <textarea
          aria-label="Message"
          value={words}
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          rows={2}
          placeholder={connection ? "Ask about what lies inside the frame" : "Nothing is sent without a model plugin"}
          className="flex-1 min-w-0 resize-none rounded-md border border-gh-line bg-white px-2 py-1 text-sm text-gh-black outline-none focus:border-accel-base"
        />
        {running ? (
          <button onClick={() => stop(c.id)} className="h-8 px-3 rounded-md border border-gh-line text-xs hover:bg-gh-base">
            Stop
          </button>
        ) : (
          <button onClick={go} disabled={!connection || !words.trim()} className="h-8 px-3 rounded-md bg-accel-base text-xs text-white hover:opacity-90 disabled:opacity-50">
            Send
          </button>
        )}
      </div>
      <details className="px-4 py-2 border-t border-gh-line text-xs text-gh-gray">
        <summary className="cursor-default">
          {c.sent.length === 1 ? "One request to the model" : `${c.sent.length} requests to the model`}
        </summary>
        <div className="mt-1 flex flex-col gap-1">
          <span>What is sent cannot be recalled. A thing moved out of the frame is not sent again, but what went is gone.</span>
          {c.sent.map((s, k) => (
            <span key={k} className="tabular-nums">
              {new Date(s.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {s.chars} characters to {s.to}
              {s.things.length ? ` · ${s.things.map((t) => t.id).join(", ")}` : ""}
            </span>
          ))}
          <button onClick={() => clear(c.id)} disabled={running} className="self-start mt-1 h-7 px-2.5 rounded-md border border-gh-line text-xs text-gh-black hover:bg-gh-base disabled:opacity-50">
            Clear what was said and sent
          </button>
        </div>
      </details>
    </div>
  );
}
