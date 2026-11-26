import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { WorkflowSet } from "../store/types";
import SetFrame from "./SetFrame";

const none = () => {};
const water = { atoms: [{ el: "O", x: 0, y: 0, z: 0 }], bonds: [] };
const held = (extra: Partial<WorkflowSet>): WorkflowSet => ({ id: 1, x0: 0, y0: -5, x1: 8, y1: 0, members: [], ...extra }) as WorkflowSet;
const html = (set: WorkflowSet, onOpenTable?: () => void) =>
  renderToString(<SetFrame set={set} name="Optimised" onContextMenu={none} summary={{ count: "118", nouns: "molecules" }} onOpenTable={onOpenTable} />);

describe("a frame of a large result set of molecules in 3D", () => {
  const set = held({ collection: Array.from({ length: 118 }, () => water) });
  it("holds only *Open as a table* - the molecule is WebGL's, the count is in its tab: no grid, no chart, no note, no count card", () => {
    const out = html(set, none);
    expect(out).toContain("Open as a table");
    expect(out).not.toContain("On no page");
    expect(out).not.toContain("118");
    expect(out).not.toContain("data-set-summary");
    expect(out).not.toContain("grid");
  });
  it("takes a press on its button at every zoom - nothing about it set by the zoom - and has no button where nothing opens it", () => {
    expect(html(set, none).match(/<button[^>]*>/)![0]).not.toContain("pointer-events");
    expect(html(set)).not.toContain("Open as a table");
  });
});

describe("a frame of structures drawn held in a set", () => {
  it("says how many, and that they are on no page, as it did", () => {
    const out = html(held({ drawnCollection: [{} as never] }));
    expect(out).toContain("data-set-summary");
    expect(out).toContain("118");
    expect(out).toContain("molecules");
    expect(out).toContain("On no page: deleting the set deletes them");
    expect(out).not.toContain("Open as a table");
  });
});
