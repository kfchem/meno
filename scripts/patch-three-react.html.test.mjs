/**
 * What drei's Html does once scripts/patch-three-react.mjs has changed it: the installed file copied (read, never written) into a
 * folder of its own beside this one, from which its imports find the packages, changed there, and mounted on a scene drawn without
 * WebGL, as Meno's tests of the 3D view mount theirs. There is no browser page in these tests: the document the Html makes its
 * element in, the layers it goes into, and the React root it holds are made up here, each saying what was done to it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as React from "react";
import { act } from "react";
import * as THREE from "three";
import { createRoot, extend } from "@react-three/fiber";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { patched, PATCHES } from "./patch-three-react.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// (the Html's own React root, made up: what it was given to draw, and when it was unmounted - inside a commit or after it)
const seen = vi.hoisted(() => ({ roots: [], inCommit: false }));
vi.mock("react-dom/client", () => ({
  createRoot: (el) => {
    const root = { el, drawn: [], unmounted: [], render: (x) => root.drawn.push(x), unmount: () => root.unmounted.push(seen.inCommit ? "in the commit" : "after it") };
    seen.roots.push(root);
    return root;
  },
}));

/** A made-up element: its parent and children, and removal from a parent it is not in refused, as a page refuses it. */
function node(name) {
  const n = {
    name,
    parentNode: null,
    children: [],
    style: {},
    className: "",
    appendChild: (c) => put(c, () => n.children.push(c)),
    prepend: (c) => put(c, () => n.children.unshift(c)),
    removeChild: (c) => {
      const i = n.children.indexOf(c);
      if (i < 0) throw new Error(`${c.name} is not a child of ${n.name}`);
      n.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    remove: () => n.parentNode?.removeChild(n),
  };
  const put = (c, add) => {
    c.parentNode?.removeChild(c);
    add();
    c.parentNode = n;
    return c;
  };
  return n;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE);

/** A renderer that draws nothing (as heldViews3d.test's). */
function nothingDrawn() {
  const none = () => undefined;
  const handler = {
    get(target, key) {
      if (key === "then" || typeof key === "symbol") return undefined;
      if (key in target) return target[key];
      return new Proxy(none, handler);
    },
    apply: () => undefined,
  };
  const own = { render: none, getPixelRatio: () => 1, domElement: { style: {}, dataset: {}, addEventListener: none, removeEventListener: none, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, xr: { enabled: false, isPresenting: false, addEventListener: none, removeEventListener: none, setAnimationLoop: none } };
  return new Proxy(own, handler);
}

/** Rendered in a commit of its own, `inCommit` set while React's work runs (act's callback flushes it before it returns). */
function inCommit(work) {
  seen.inCommit = true;
  try {
    act(work);
  } finally {
    seen.inCommit = false;
  }
}
/** The microtasks queued by a commit run: what is deferred out of it done. */
const settled = () => act(async () => {});

let folder;
/** drei's Html as the script changes it, from `text` (the installed file's, read) - or as `change` makes it, to see a test fail. */
async function htmlOf(change = (text) => patched(text, PATCHES[0], "web/Html.js").text) {
  const installed = readFileSync(join(here, "..", "node_modules", "@react-three", "drei", "web", "Html.js"), "utf8");
  const copy = join(mkdtempSync(join(folder, "copy-")), "Html.js");
  writeFileSync(copy, change(installed));
  return (await import(/* @vite-ignore */ pathToFileURL(copy).href)).Html;
}

let Html;
let fiberRoot;
const page = async () => {
  const canvas = { style: {}, width: 800, height: 600, addEventListener: () => undefined, removeEventListener: () => undefined };
  fiberRoot = createRoot(canvas);
  await act(async () => {
    await fiberRoot.configure({ gl: nothingDrawn(), size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: "never", orthographic: true });
  });
};
const shown = (layer, key = "chip", text = "a made-up chip") => React.createElement(Html, { key, portal: { current: layer } }, text);

beforeAll(async () => {
  folder = mkdtempSync(join(here, ".patched-html-"));
  vi.stubGlobal("document", { createElement: () => node("the Html's element") });
  Html = await htmlOf();
});
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(folder, { recursive: true, force: true });
});
afterEach(async () => {
  await act(async () => void fiberRoot?.unmount());
  seen.roots.length = 0;
  vi.restoreAllMocks();
});

describe("drei's Html, as scripts/patch-three-react.mjs changes it", () => {
  it("mounted and unmounted again and again leaves nothing, each root unmounted once, after the commit, and says nothing", async () => {
    // (heard from once the scene is made: the scene's own clock, from the packages as installed here, is not the Html's)
    await page();
    const said = [vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    const layer = node("the layer");
    for (let k = 0; k < 20; k++) {
      inCommit(() => fiberRoot.render(shown(layer)));
      expect(layer.children).toHaveLength(1);
      inCommit(() => fiberRoot.render(null));
      await settled();
      expect(layer.children).toEqual([]);
    }
    expect(seen.roots).toHaveLength(20);
    for (const root of seen.roots) expect(root.unmounted).toEqual(["after it"]);
    for (const s of said) expect(s).not.toHaveBeenCalled();
  });

  it("gone and made again in the same commit: the new one keeps its root and what it shows", async () => {
    await page();
    const layer = node("the layer");
    inCommit(() => fiberRoot.render(shown(layer, "first")));
    inCommit(() => fiberRoot.render(shown(layer, "second", "made again")));
    await settled();
    const [first, second] = seen.roots;
    expect(first.unmounted).toEqual(["after it"]);
    expect(second.unmounted).toEqual([]);
    expect(layer.children).toEqual([second.el]);
    expect(JSON.stringify(second.drawn.at(-1).props)).toContain("made again");
  });

  it("put into another layer keeps its root while it is there, and is taken from wherever it is when it goes", async () => {
    await page();
    const [first, other] = [node("the first layer"), node("another layer")];
    inCommit(() => fiberRoot.render(shown(first)));
    // (its place changed: the layer it goes into, as the column's layer comes - the same root, in the new place)
    inCommit(() => fiberRoot.render(shown(other)));
    await settled();
    expect(seen.roots).toHaveLength(1);
    expect(seen.roots[0].unmounted).toEqual([]);
    expect([first.children, other.children]).toEqual([[], [seen.roots[0].el]]);
    // (moved by something else into a third: taken from there, not from the layer it was given)
    const third = node("a third layer");
    third.appendChild(seen.roots[0].el);
    inCommit(() => fiberRoot.render(null));
    await settled();
    expect(third.children).toEqual([]);
    expect(seen.roots[0].unmounted).toEqual(["after it"]);
  });

  it("as drei has it, unchanged, unmounts its root inside the commit: what the change is for", async () => {
    Html = await htmlOf((text) => text);
    await page();
    const layer = node("the layer");
    inCommit(() => fiberRoot.render(shown(layer)));
    inCommit(() => fiberRoot.render(null));
    expect(seen.roots[0].unmounted).toEqual(["in the commit"]);
    Html = await htmlOf();
  });
});
