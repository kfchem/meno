import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { WorkflowStep } from "../store/types";
import StepCard from "./StepCard";
import { kindInfo, needsOf, optionsOf, type StepKind } from "./kinds";
import { speciesSet } from "./structureSteps";
import { filter, filterNeeds } from "../../../../lib/nodes/filter";
import { tag, tagNeeds } from "../../../../lib/nodes/tag";
import { readLists } from "./enumerate";
import { NO_POSITIONS } from "./substituents";
import { notReadyFor } from "./doers";

// Vitest runs in Node, with no page to mount on: the server's renderer draws the card.

const step = (kind: StepKind, options: Record<string, string> = {}): WorkflowStep => ({ id: 1, kind, x: 0, y: 0, options }) as WorkflowStep;

/** A step's card, its inputs there and its state Ready, saying what Workflow2D has it say where it cannot run (doers `notReadyFor`). */
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
      inputs={[]}
      missing={notReadyFor(s)}
      optionList={info.options ?? []}
      options={optionsOf(info.options ?? [], s.options)}
      kinds={[]}
      runs={[]}
      onOptions={noop}
      onKind={noop}
      onShowRun={noop}
      onKeepRun={noop}
      onClose={noop}
      onCardDown={noop}
      onContextMenu={noop}
      onHover={noop}
    />,
  );
}

describe("what a step still needs before it can run", () => {
  it("is said for Species with neither a charge nor a multiplicity, or one that does not read - nothing once it can run", () => {
    expect(needsOf(step("species"))).toBe("Give a charge, a multiplicity, or both");
    expect(needsOf(step("species", { charge: "one" }))).toBe('The charge "one" is not a whole number');
    expect(needsOf(step("species", { multiplicity: "0" }))).toBe('The multiplicity "0" is not a whole number of 1 or more');
    expect(needsOf(step("species", { charge: "-1" }))).toBeUndefined();
    expect(needsOf(step("species", { multiplicity: "2" }))).toBeUndefined();
  });

  it("is said for Measure with no measurements, and Tag with no name", () => {
    expect(needsOf(step("measure"))).toBe("No measurements yet");
    expect(needsOf(step("measure", { measurements: "1-2" }))).toBeUndefined();
    expect(needsOf(step("tag"))).toBe("Name the tag");
    expect(needsOf(step("tag", { name: "R" }))).toBeUndefined();
  });

  it("is said for Filter with no conditions, or a line that does not read - in the words its run is refused with", () => {
    expect(needsOf(step("filter"))).toBe("No conditions yet");
    expect(needsOf(step("filter", { conditions: "mw" }))).toBe('"mw" compares nothing: it takes a property, then < ≤ > ≥ = or ≠, then a value');
    expect(needsOf(step("filter", { conditions: "mw < 300" }))).toBeUndefined();
    expect(filter([], { conditions: [], match: "all" })).toEqual({ ok: false, said: filterNeeds("") });
  });

  it("is said for Tag with no name, in one phrase: its card's, its how's and its run's", () => {
    expect(tagNeeds(" ")).toBe("Name the tag");
    expect(tag([], { name: " " })).toEqual({ ok: false, said: "Name the tag" });
    expect(kindInfo("tag").how!({ name: "" })).toBe("Name the tag");
  });

  it("is said for Enumerate with no lists, an empty one, or no positions or groups - as its run says them", () => {
    // (by R groups, as a new step has it: R1 with nothing under it)
    expect(needsOf(step("enumerate"))).toBe("R1 has no options");
    expect(readLists("R1:\n").problems).toContain("R1 has no options");
    expect(needsOf(step("enumerate", { lists: "" }))).toBe("No lists yet");
    expect(needsOf(step("enumerate", { lists: "R1: Me\nEt" }))).toBeUndefined();
    // (by substituents)
    expect(needsOf(step("enumerate", { way: "substituents" }))).toBe(NO_POSITIONS);
    expect(needsOf(step("enumerate", { way: "substituents", positions: "3" }))).toBe("No groups yet: type one to a line");
    expect(needsOf(step("enumerate", { way: "substituents", positions: "3", groups: "Me" }))).toBeUndefined();
  });

  it("is nothing for a step that takes no such options, or whose defaults run", () => {
    expect(needsOf(step("combine"))).toBeUndefined();
    expect(needsOf(step("chart"))).toBeUndefined();
    expect(needsOf(step("populations"))).toBeUndefined();
  });

  it("is what Species' run is refused with, word for word", () => {
    for (const [charge, multiplicity] of [["", ""], ["one", ""], ["", "0"]])
      expect(speciesSet([], "molecules", charge, multiplicity)).toEqual({ ok: false, said: needsOf(step("species", { charge, multiplicity })) });
  });

  it("is said on the card where Ready would be - never Ready while it cannot run", () => {
    const needing = card(step("species"));
    expect(needing).toContain("Give a charge, a multiplicity, or both");
    expect(needing).not.toContain(">Ready<");
    expect(card(step("species", { charge: "0" }))).toContain(">Ready<");
  });
});
