import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import ConfirmDiscard from "../../layouts/ConfirmDiscard";
import { actOnFiles, filesCanGo, filesView, type FilesAct, type FilesAsked } from "./pluginFiles";

type Props = { onClick?: () => void; onCancel?: () => void; onDiscard?: () => void; title?: string; discardLabel?: string; disabled?: boolean };
const props = (e: ReactElement | null) => (e?.props ?? {}) as Props;

describe("a plugin's files taken away from its card", () => {
  it("are offered for one here and not added, used by no plugin added - never one added, being added, or another needs", () => {
    expect(filesCanGo("absent", [])).toBe(true);
    expect(filesCanGo("absent", [{ id: "uses-it" }])).toBe(false);
    for (const state of ["added", "adding", "waiting", "removing", undefined]) expect(filesCanGo(state, []), String(state)).toBe(false);
  });

  it("ask first: the button asks, nothing more - the question is shown only once it is asked, its answers each said", () => {
    const acts: FilesAct[] = [];
    const idle = filesView({ asking: false }, (a) => acts.push(a), "Sketch", false);
    expect(idle.question).toBeNull();
    props(idle.button).onClick!();
    expect(acts).toEqual([{ type: "ask" }]);
    const asked = filesView({ asking: true }, (a) => acts.push(a), "Sketch", false);
    expect(asked.question?.type).toBe(ConfirmDiscard);
    expect([props(asked.question).title, props(asked.question).discardLabel]).toEqual(["Remove the files of Sketch?", "Remove its files"]);
    props(asked.question).onCancel!();
    props(asked.question).onDiscard!();
    expect(acts).toEqual([{ type: "ask" }, { type: "cancel" }, { type: "remove" }]);
    // (busy: the button not to be pressed again)
    expect(props(filesView({ asking: false }, () => {}, "Sketch", true).button).disabled).toBe(true);
  });

  it("are removed only once the question is answered so - never as it is asked, nor let go - and why not, where they were not", async () => {
    const remove = vi.fn(async () => {});
    const said: FilesAsked[] = [];
    await actOnFiles({ type: "ask" }, "sketch", (s) => said.push(s), remove);
    await actOnFiles({ type: "cancel" }, "sketch", (s) => said.push(s), remove);
    expect(remove).not.toHaveBeenCalled();
    expect(said).toEqual([{ asking: true }, { asking: false }]);
    said.length = 0;
    await actOnFiles({ type: "remove" }, "sketch", (s) => said.push(s), remove);
    expect(remove).toHaveBeenCalledWith("sketch");
    expect(said).toEqual([{ asking: false }]);
    said.length = 0;
    await actOnFiles({ type: "remove" }, "sketch", (s) => said.push(s), async () => Promise.reject(new Error("a job of it runs")));
    expect(said[said.length - 1]).toEqual({ asking: false, problem: "Its files were not taken away: a job of it runs" });
  });
});
