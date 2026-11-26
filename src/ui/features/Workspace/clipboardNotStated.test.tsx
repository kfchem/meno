import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { storeOf } from "./store";
import { createWorkspaceDocument } from "./document";
import { useClipboardActions } from "./clipboardActions";
import { readClipboard, writeClipboard } from "../../../lib/clipboard";

// Copy as SMILES on a drawing with a metal whose ligands are not stated (docs/EDITOR-2D.md, *Ligands not stated*) says why and
// writes nothing: the clipboard holds what it held. The hook mounted in a renderer that draws nothing, so that it runs as the page runs it.

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

describe("Copy as SMILES on a metal whose ligands are not stated", () => {
  it("says why, naming the label as typed, and leaves the clipboard as it was", async () => {
    const { store, said, clip } = await mounted();
    await writeClipboard([{ flavor: "text", text: "CCO" }]);
    const model = {
      atoms: [
        { id: 1, x: 0, y: 0, el: "C" },
        { id: 2, x: 1.5, y: 0, el: "LnPd" },
      ],
      bonds: [{ id: 1, a: 1, b: 2, order: 1 }],
    };
    store.setState({ model, fullModel: model, sel: { atoms: new Set([1, 2]), bonds: new Set([1]) } } as never);
    await act(async () => void (await clip.copySmiles()));
    expect(said).toEqual(["Copy as SMILES: LnPd: its ligands are not stated."]);
    expect((await readClipboard(["text"]))?.text).toBe("CCO");
  });
});
