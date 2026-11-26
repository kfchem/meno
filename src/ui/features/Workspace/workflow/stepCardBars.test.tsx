import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { WorkflowStep } from "../store/types";
import StepCard from "./StepCard";
import OptionsForm from "../../../options/OptionsForm";
import { optionsNeed, stepOptions, stepRole, stepValues } from "./doers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { inputsOf, kindInfo, optionsOf } from "./kinds";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the card.

/** A Filter step's card, open to its options. */
function card(): string {
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
  it("shows its words and its Close as they are, with no stand-in for them: nothing in it is chosen by the zoom", () => {
    const html = card();
    expect(html).toMatch(/>Close</);
    expect(html).toMatch(/>Meno</);
    for (const gone of ["meno-barred", "meno-words", "aria-hidden=\"false\""]) expect(html).not.toContain(gone);
  });
});

describe("a step's card that still needs a value of its options", () => {
  /** An Energy window's card, open, with no window: asking (`asks`) or not. */
  const windowCard = (asks: boolean) => {
    const s = { id: 2, kind: "energy-window", x: 0, y: 0, options: {} } as WorkflowStep;
    const info = kindInfo(s.kind);
    const noop = () => {};
    return renderToString(
      <StepCard
        step={s}
        info={info}
        who="Meno"
        how=""
        state="ready"
        open
        asks={asks}
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
  };
  it("opened to ask, has its window field asked for - and no field, opened otherwise", () => {
    expect(windowCard(true).match(/data-asked="true"/g)).toHaveLength(1);
    expect(windowCard(false)).not.toContain("data-asked");
  });
});

describe("a step with no window anywhere, its card opened as it is put down", () => {
  it("asks: its window field is the one taken - and with Settings' window, nothing is asked", () => {
    const bare = { id: 3, kind: "energy-window", by: "meno", x: 0, y: 0 } as WorkflowStep;
    const form = () =>
      renderToString(<OptionsForm options={stepOptions(bare)} values={stepValues(bare)} onChange={() => {}} asks={!!optionsNeed(bare)} />);
    expect(form().match(/data-asked="true"/g)).toHaveLength(1);
    useAppSettings.setState((s) => ({ ...s, options: { [stepRole("energy-window", "meno")]: { window: 2.5 } } }));
    try {
      expect(form()).not.toContain("data-asked");
    } finally {
      useAppSettings.setState((s) => ({ ...s, options: {} }));
    }
  });
});
