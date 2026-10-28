import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { WorkflowStep } from "../store/types";
import StepCard from "./StepCard";
import { inputsOf, kindInfo, optionsOf, type StepKind } from "./kinds";
import { PORT_STEP, portDown, PX } from "./look";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the card.

const step = (kind: StepKind): WorkflowStep => ({ id: 1, kind, x: 0, y: 0, options: {} }) as WorkflowStep;

/** A step's card, its inputs named beside their ports. */
function card(s: WorkflowStep): string {
  const info = kindInfo(s.kind);
  const noop = () => {};
  return renderToString(
    <StepCard
      step={s}
      info={info}
      who="Meno"
      how=""
      state="ready"
      compact={false}
      open={false}
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

/** Where each input's name stands down the card, in px from its top - its middle - as the card draws it, in order. */
const namesAt = (html: string) => [...html.matchAll(/top:\s*([\d.]+)px;transform:translateY\(-50%\)[^>]*>([^<]+)</g)].map((m) => ({ name: m[2], at: Number(m[1]) }));

describe("a card's inputs, named beside their ports", () => {
  it("each name stands between its own wire and the one above - a 10 px line clear of every wire coming in", () => {
    const inputs = inputsOf("energy-diagram");
    expect(inputs.map((p) => p.name)).toEqual(["Levels", "Connects"]);
    const names = namesAt(card(step("energy-diagram")));
    expect(names.map((n) => n.name)).toEqual(["Levels", "Connects"]);
    // (each wire comes in level with its port: no name's 10 px line within its half height of one)
    for (const n of names) for (let j = 0; j < inputs.length; j++) expect(Math.abs(n.at - portDown(j) / PX)).toBeGreaterThanOrEqual(5);
    // (and each is its own port's: half a port's step above it)
    names.forEach((n, k) => expect(n.at).toBeCloseTo((portDown(k) - PORT_STEP / 2) / PX, 6));
  });
});
