import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { WorkflowStep } from "../store/types";
import StepCard from "./StepCard";
import { inputsOf, kindInfo, optionsOf } from "./kinds";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the card.

/** A Filter step's card, open to its options, zoomed in or out (`compact`). */
function card(compact: boolean): string {
  const s = { id: 1, kind: "filter", x: 0, y: 0, options: {} } as WorkflowStep;
  const info = kindInfo(s.kind);
  const noop = () => {};
  return renderToString(
    <StepCard
      step={s}
      info={info}
      who="Meno"
      how=""
      state="ready"
      compact={compact}
      open
      inputs={inputsOf(s.kind).map((p) => ({ id: p.id, name: p.name, look: "plain" as const }))}
      optionList={info.options ?? []}
      options={optionsOf(info.options ?? [], s.options)}
      kinds={[]}
      runs={[]}
      onOptions={noop}
      onKind={noop}
      onShowRun={noop}
      onKeepRun={noop}
      onCardDown={noop}
      onContextMenu={noop}
      onHover={noop}
      onClose={noop}
    />,
  );
}

describe("a step's card open to its options", () => {
  it("stays open zoomed out, its options' words then grey bars - its Close there, as near", () => {
    const near = card(false);
    const far = card(true);
    for (const html of [near, far]) expect(html).toMatch(/>Close</);
    expect(near).not.toContain("meno-barred");
    expect(far).toContain("meno-barred");
    // (its options there either way: the same words, unseen zoomed out)
    const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(words(far)).toBe(words(near));
  });
});
