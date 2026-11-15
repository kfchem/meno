/**
 * Save after Save As (useFileActions): a workspace opened with no path of
 * its own - through the page's file input - and saved once with Save As is
 * saved in place by Save from then on, the dialog not asked again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { act } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { EditorProvider, storeOf } from "./store";
import { createWorkspaceDocument } from "./document";
import { useFileActions, type FileActions } from "./fileActions";

// (the dialog, the writing and the file system, as Tauri would have them: each asked counted)
const io = vi.hoisted(() => ({ asked: [] as string[], picked: "", written: [] as string[] }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: async (o: { defaultPath?: string }) => (io.asked.push(o.defaultPath ?? ""), io.picked),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: async () => false }));
vi.mock("../../../lib/io/writeDocument", () => ({
  writeDocument: async (path: string) => (io.written.push(path), null),
}));
vi.mock("../../../lib/io/truePath", () => ({ truePath: async (p: string) => p }));
vi.mock("../../../lib/jobs", async (real) => ({ ...(await real<object>()), fileNow: async () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE as never);

/** A renderer that draws nothing. */
function nothingDrawn(): object {
  const none = () => undefined;
  const handler: ProxyHandler<object> = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return (target as Record<string, unknown>)[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

const mounted: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const unmount of mounted.splice(0)) await unmount();
  io.asked.length = 0;
  io.written.length = 0;
});

/** The tab's file actions, as the tab has them, for `doc`; and the tab's names, as each save gives it. */
async function tabOf(doc: ReturnType<typeof createWorkspaceDocument>): Promise<{ files: () => FileActions; named: string[] }> {
  const held: { files?: FileActions } = {};
  const named: string[] = [];
  function Probe() {
    held.files = useFileActions((label) => named.push(label), "t");
    return null;
  }
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await act(async () => {
    await root.configure({ gl: nothingDrawn() as never, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never" });
    root.render(
      <EditorProvider tabId="t" document={doc}>
        <Probe />
      </EditorProvider>,
    );
  });
  mounted.push(async () => act(async () => root.unmount()));
  return { files: () => held.files!, named };
}

describe("Save after Save As", () => {
  it("writes in place, the dialog not asked again, for a workspace opened through the file input", async () => {
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    const tab = await tabOf(doc);
    // (opened through the page's file input: its name, and no path)
    store.getState().markOpenedOver("run.meno");
    store.getState().addAtom(0, 0, "C");
    io.picked = "C:\\Users\\me\\Documents\\run.meno";
    await act(async () => void (await tab.files().saveAs()));
    expect(io.asked).toEqual(["run.meno"]);
    expect(io.written).toEqual([io.picked]);
    expect(store.getState().savedPath).toBe(io.picked);
    expect(tab.named).toEqual(["run.meno"]);
    // (changed, and saved: where Save As saved it, nothing asked)
    store.getState().addAtom(1.5, 0, "C");
    await act(async () => void (await tab.files().save()));
    expect(io.asked).toHaveLength(1);
    expect(io.written).toEqual([io.picked, io.picked]);
  });

  it("writes in place where the name was given without its extension", async () => {
    const doc = createWorkspaceDocument();
    const store = storeOf(doc);
    const tab = await tabOf(doc);
    store.getState().markOpenedOver("scan.meno");
    store.getState().addAtom(0, 0, "C");
    io.picked = "C:\\Users\\me\\Documents\\run";
    await act(async () => void (await tab.files().saveAs()));
    await act(async () => void (await tab.files().save()));
    expect(io.asked).toHaveLength(1);
    expect(io.written).toEqual(["C:\\Users\\me\\Documents\\run.meno", "C:\\Users\\me\\Documents\\run.meno"]);
  });
});
