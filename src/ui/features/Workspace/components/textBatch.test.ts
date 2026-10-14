import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { BATCH_MOST, PACKED_COLOUR, TextBatch, type BatchRun } from "./textBatch";

const run = (text: string, more: Partial<BatchRun> = {}): BatchRun => ({ text, x: 1, y: 2, size: 0.5, color: "#141414", italic: false, bold: false, ...more });

describe("texts drawn as a batch", () => {
  it("holds each label's runs by key, kept while it is the same item, and lets go of those not kept", () => {
    const b = new TextBatch("font.ttf", 30);
    const oh = {};
    const nh2 = {};
    b.set("atom-1", oh, [run("OH")], 1);
    b.set("atom-2", nh2, [run("NH"), run("2", { y: 1.8, size: 0.35 })], 1);
    expect(b.sizes()).toEqual({ labels: 2, members: 3, chunks: 1 });
    expect(b.has("atom-1", oh)).toBe(true);
    expect(b.has("atom-1", {})).toBe(false);
    b.keepOnly(new Set(["atom-2"]));
    expect(b.sizes()).toEqual({ labels: 1, members: 2, chunks: 1 });
    expect([...b.members()].map((t) => t.text)).toEqual(["NH", "2"]);
    b.dispose();
    expect(b.sizes().members).toBe(0);
  });

  it("places each run by its own matrix: where it starts, and an italic one leaning about its baseline", () => {
    const b = new TextBatch("font.ttf", 30);
    b.set("a", {}, [run("t", { x: 3, y: 4, italic: true }), run("Bu", { x: 3.3, y: 4 })], 1);
    const [t, bu] = [...b.members()];
    expect(t.matrixAutoUpdate).toBe(false);
    expect(new THREE.Vector3(0, 1, 0).applyMatrix4(t.matrix).x).toBeGreaterThan(3);
    expect(bu.position.toArray()).toEqual([3.3, 4, 0]);
    expect([t.anchorX, t.anchorY]).toEqual(["left", "top-baseline"]);
  });

  it("thickens a bold run with an outline of its own colour, faded with it", () => {
    const b = new TextBatch("font.ttf", 30);
    b.set("a", {}, [run("Bold", { bold: true, color: "#d62728" })], 0.4);
    const [t] = [...b.members()];
    expect([t.color, t.outlineWidth, t.outlineColor, t.outlineOpacity, t.fillOpacity]).toEqual(["#d62728", "3.5%", "#d62728", 0.4, 0.4]);
  });

  it("puts no more than BATCH_MOST runs in one chunk: a page of tens of thousands is a few draw calls", () => {
    const b = new TextBatch("font.ttf", 30);
    for (let i = 0; i < BATCH_MOST + 10; i++) b.set(`k${i}`, {}, [run("N")], 1);
    expect(b.sizes()).toEqual({ labels: BATCH_MOST + 10, members: BATCH_MOST + 10, chunks: 2 });
    expect(b.root.children).toHaveLength(2);
    expect(b.root.children.every((c) => c.renderOrder === 30)).toBe(true);
  });

  it("unpacks a member's colour as the page's colours are: the line of troika's shader it replaces is there to be replaced", () => {
    // (./textBatch's PageBatch replaces the line that unpacks a member's colour with Meno's, which reads it as
    // sRGB - were the line to change with troika, Meno's would no longer be put in: this says so first)
    const source = readFileSync(new URL("../../../../../node_modules/troika-three-text/src/BatchedText.js", import.meta.url), "utf8");
    expect(source).toContain(PACKED_COLOUR);
  });
});
