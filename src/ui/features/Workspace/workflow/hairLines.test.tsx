import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { WorkflowSet, WorkflowStep } from "../store/types";
import StepCard from "./StepCard";
import SetFrame from "./SetFrame";
import { inputsOf, kindInfo, optionsOf } from "./kinds";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the card and the frame.

const noop = () => {};

/** A Filter step's card, open to its options, chosen or not. */
function card(selected: boolean): string {
  const s = { id: 1, kind: "filter", x: 0, y: 0, options: {} } as WorkflowStep;
  const info = kindInfo(s.kind);
  return renderToString(
    <StepCard
      step={s}
      info={info}
      who="Meno"
      how=""
      state="ready"
      compact={false}
      open
      selected={selected}
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

const set: WorkflowSet = { id: 1, x0: 0, x1: 12, y0: 0, y1: 9 };
const frame = (chosen: boolean, hovered: boolean) =>
  renderToString(<SetFrame set={set} name="Set" count="3" hovered={hovered} chosen={chosen} compact={false} onTabDown={noop} onEdgeDown={noop} onContextMenu={noop} onHover={noop} />);

// (a border thinner than a pixel of the page's layer Chromium - Windows' WebView2 - draws a whole one of them wide, and zoomed in the
//  layer magnifies it: six pixels at six times; drawn as a shadow, a hair stays a hair)
describe("the lines a hair thick of a step's card and a set's frame", () => {
  it("are drawn as shadows just inside their edges, not borders, in the colour each state gives them", () => {
    for (const html of [card(false), card(true), frame(false, false), frame(false, true), frame(true, false)]) {
      expect(html).toContain("inset-ring-[length:var(--hair,1px)]");
      expect(html).not.toMatch(/border(-top)?-width:var\(--hair/);
    }
    expect(card(false)).toContain("inset-ring-gh-line");
    expect(card(true)).toContain("inset-ring-accel-base");
    expect(frame(false, false)).toContain("inset-ring-gh-line");
    expect(frame(false, true)).toContain("inset-ring-gh-gray");
    expect(frame(true, false)).toContain("inset-ring-accel-base");
  });

  it("keep the room the border took, so that nothing inside a card moves", () => {
    const html = card(false);
    // (the card: a hair all round)
    expect(html).toMatch(/role="group"[^>]*style="padding:var\(--hair, 1px\)/);
    // (the line over its options: a hair over their padding)
    expect(html).toContain("padding-top:calc(0.625rem + var(--hair, 1px));box-shadow:inset 0 var(--hair, 1px) var(--color-gh-line)");
  });
});
