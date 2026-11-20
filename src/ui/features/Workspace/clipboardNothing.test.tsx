import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { storeOf } from "./store";
import { createWorkspaceDocument } from "./document";
import { NOTHING_TO_COPY, NOTHING_TO_CUT, useClipboardActions } from "./clipboardActions";

// A copy or a cut with nothing to take says so, rather than leaving the clipboard as it was without a word (docs/EDITOR-2D.md,
// copy and paste). The hook mounted in a renderer that draws nothing, so that it runs as the page runs it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

const unmounts: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const u of unmounts.splice(0)) await u();
});

async function mounted() {
  const store = storeOf(createWorkspaceDocument());
  const said: string[] = [];
  const out: { clip?: ReturnType<typeof useClipboardActions> } = {};
  function Probe() {
    out.clip = useClipboardActions(store, (m) => said.push(m));
    return null;
  }
  const canvas = { style: {}, width: 10, height: 10, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  const none = () => undefined;
  const gl = new Proxy({ render: none, getPixelRatio: () => 1, domElement: { style: {}, addEventListener: none, removeEventListener: none }, xr: { enabled: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === "then" ? undefined : none),
  });
  await act(async () => {
    await root.configure({ gl: gl as never, size: { width: 10, height: 10, top: 0, left: 0 }, frameloop: "never" });
    root.render(<Probe />);
  });
  unmounts.push(() => act(async () => void root.unmount()));
  return { store, said, clip: out.clip! };
}

describe("a copy or a cut with nothing to take", () => {
  it("says so: nothing selected and nothing under the pointer", async () => {
    const { said, clip } = await mounted();
    await act(async () => void (await clip.copy()));
    expect(said).toEqual([NOTHING_TO_COPY]);
    await act(async () => void (await clip.cut()));
    expect(said).toEqual([NOTHING_TO_COPY, NOTHING_TO_CUT]);
  });
});
