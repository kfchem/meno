import { describe, expect, it } from "vitest";
import { connectStoreToDocument, createEditorStore } from ".";
import { createWorkspaceDocument, isBlankDocument } from "../document";
import { readWorkspace, workspaceFile, workspaceText } from "../utils/workspace";
import { centredAt, readRecord, recordText } from "../utils/copyPaste";
import { POINT } from "../../../../lib/pdf/layout";
import { readMenoFile } from "../../../../lib/doc/menoFile";
import { holdFilm, holdPicture, holdPicturesOf, pictureBytes } from "../../../../lib/picture/held";
import { cornersOf } from "../utils/selection";
import type { PictureToAdd } from "./types";

/** A PNG's signature, its header for `w` by `h`, and its end: what Meno takes to be a picture, `seed` making each its own. */
function png(w: number, h: number, seed = 0): Uint8Array {
  const be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(w), ...be(h), 8, 6, 0, 0, 0, seed, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]);
}

async function held(name: string, w: number, h: number, seed = 0): Promise<PictureToAdd> {
  const p = (await holdPicture(png(w, h, seed)))!;
  return { name, sha256: p.sha256, media: p.media, width: p.width, height: p.height };
}

function editor(data?: unknown) {
  const doc = createWorkspaceDocument(data);
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, store, state: () => store.getState() };
}

describe("pictures on the page", () => {
  it("are put down as they would be printed, in a row, selected - one step", async () => {
    const { doc, state } = editor();
    const a = await held("figure.png", 192, 96, 1);
    const b = await held("shot.png", 96, 96, 2);
    const ids = state().addPictures([a, b], { x: 10, y: 20 });
    const [p, q] = state().pictures;
    expect(ids).toEqual([p.id, q.id]);
    // (a screen's 96 to the inch where it says nothing: 192 pixels, 144 points)
    expect(p).toMatchObject({ name: "figure.png", media: "image/png", px: [192, 96], x: 10, y: 20 });
    expect(p.w).toBeCloseTo(144 * POINT);
    expect(p.h).toBeCloseTo(72 * POINT);
    expect(q.x - q.w / 2).toBeGreaterThan(p.x + p.w / 2);
    expect([...state().selPictures]).toEqual(ids);
    expect(isBlankDocument(doc.getState())).toBe(false);
    expect(doc.history().undoDepth).toBe(1);
  });

  it("are moved, made larger and turned, a drag one step; never made nothing", async () => {
    const { doc, state } = editor();
    const [id] = state().addPictures([await held("figure.png", 100, 50, 3)], { x: 0, y: 0 });
    for (const x of [1, 2, 3]) state().updatePicture(id, { x }, "drag");
    expect(state().pictures[0].x).toBe(3);
    expect(doc.history().undoDepth).toBe(2);
    const w = state().pictures[0].w;
    state().updatePicture(id, { w: 2 * w, h: 2 * state().pictures[0].h }, "corner");
    expect(state().pictures[0].w).toBeCloseTo(2 * w);
    state().updatePicture(id, { w: 0 });
    expect(state().pictures[0].w).toBeCloseTo(2 * w);
    // (a turn kept from -π to π, and none kept as none)
    state().updatePicture(id, { turn: 3 * Math.PI / 2 });
    expect(state().pictures[0].turn).toBeCloseTo(-Math.PI / 2);
    state().updatePicture(id, { turn: 2 * Math.PI });
    expect(state().pictures[0].turn).toBeUndefined();
    doc.undo();
    expect(state().pictures[0].turn).toBeCloseTo(-Math.PI / 2);
  });

  it("are selected, and deleted, with the rest of a selection; the selection kept to those still there", async () => {
    const { doc, state } = editor();
    const ids = state().addPictures([await held("a.png", 50, 50, 4), await held("b.png", 50, 50, 5)], { x: 0, y: 0 });
    state().clearSel();
    expect(state().selPictures.size).toBe(0);
    state().togglePictureSel(ids[1]);
    expect([...state().selPictures]).toEqual([ids[1]]);
    state().selectAll();
    expect(state().selPictures.size).toBe(2);
    state().selectPictures([ids[0]]);
    state().deleteSelection();
    expect(state().pictures.map((p) => p.id)).toEqual([ids[1]]);
    expect(state().selPictures.size).toBe(0);
    doc.undo();
    expect(state().pictures).toHaveLength(2);
    state().removePicture(ids[1]);
    expect(state().pictures.map((p) => p.id)).toEqual([ids[0]]);
  });

  it("open on a canvas of their own", async () => {
    const pic = await held("alone.png", 80, 40, 6);
    const { state } = editor({ pictures: [pic] });
    expect(state().pictures).toHaveLength(1);
    expect(state().pictures[0]).toMatchObject({ name: "alone.png", x: 0, y: 0 });
  });

  it("are saved in the workspace, their images kept in its file, and read back", async () => {
    const { store, state } = editor();
    const [id] = state().addPictures([await held("figure.png", 120, 60, 7)], { x: 5, y: 6 });
    state().updatePicture(id, { turn: 0.5 });
    const ws = readWorkspace(workspaceText(state()));
    expect(ws?.drawn.pictures?.[0]).toMatchObject({ name: "figure.png", x: 5, y: 6, turn: 0.5, px: [120, 60] });
    const file = readMenoFile((await workspaceFile(store.getState())).bytes);
    const kept = file.files.find((f) => f.media === "image/png");
    expect(kept?.sha256).toBe(state().pictures[0].sha256);
    expect(file.data(kept!.sha256)).toEqual(pictureBytes(kept!.sha256));
    holdPicturesOf(file);
    // (opened again: the pictures, numbered from the first)
    const again = editor();
    again.state().openWorkspace(readWorkspace(file.workspace)!, true);
    expect(again.state().pictures[0]).toMatchObject({ id: 1, name: "figure.png", turn: 0.5 });
    expect(again.doc.getState().nextPictureId).toBe(2);
  });

  it("may be films - a render's MP4 - put just where they were made for, saved, read back and copied as pictures are", async () => {
    // (an ISO base media file's first box, its file type: what Meno takes to be an MP4)
    const mp4 = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 9]);
    expect(await holdFilm(png(4, 4))).toBeNull();
    const film = (await holdFilm(mp4))!;
    const { store, state } = editor();
    const id = state().putPicture({ name: "morphine.mp4", sha256: film.sha256, media: "video/mp4", px: [1920, 1080], x: 30, y: 40, w: 16, h: 9 });
    expect(state().pictures[0]).toMatchObject({ id, media: "video/mp4", x: 30, y: 40, w: 16, h: 9 });
    // (one step to undo, as any picture put down)
    expect(state().selPictures.size).toBe(0);
    // (landing as the view is: it eased to it as the render was begun, and moves no more)
    expect(state().picturesLaid.has(id!)).toBe(true);
    const [pasted] = state().addPictures([await held("figure.png", 10, 10, 9)], { x: 0, y: 0 });
    expect(state().picturesLaid.has(pasted)).toBe(false);
    const file = readMenoFile((await workspaceFile(store.getState())).bytes);
    expect(file.files.find((f) => f.media === "video/mp4")?.sha256).toBe(film.sha256);
    holdPicturesOf(file);
    const again = editor();
    again.state().openWorkspace(readWorkspace(file.workspace)!, true);
    expect(again.state().pictures[0]).toMatchObject({ name: "morphine.mp4", media: "video/mp4", px: [1920, 1080] });
    expect(pictureBytes(film.sha256)).toEqual(mp4);
    const record = readRecord(recordText({ atoms: [], bonds: [], pictures: [state().pictures[0]] }));
    expect(record?.pictures?.[0].media).toBe("video/mp4");
  });

  it("are copied and pasted with the rest, moved as far, and those not held left out", async () => {
    const { state } = editor();
    state().addPictures([await held("figure.png", 96, 96, 8)], { x: 0, y: 0 });
    const p = state().pictures[0];
    const record = readRecord(recordText({ atoms: [], bonds: [], pictures: [p] }));
    expect(record?.pictures?.[0]).toEqual(p);
    const moved = centredAt(record!, { x: 40, y: 50 });
    expect(moved.pictures?.[0]).toMatchObject({ x: 40, y: 50 });
    state().clearSel();
    state().pasteModel({ ...moved, pictures: [...moved.pictures!, { ...p, sha256: "f".repeat(64) }] });
    expect(state().pictures).toHaveLength(2);
    expect(state().pictures[1]).toMatchObject({ x: 40, y: 50, sha256: p.sha256 });
    expect([...state().selPictures]).toEqual([state().pictures[1].id]);
  });

  it("cut out of a PDF keep where they came from, saved, copied and read back; put down just where they were let go", async () => {
    const { store, state } = editor();
    const from = { sha256: "c".repeat(64), page: 2, box: [72, 100, 300, 260] as [number, number, number, number] };
    const pic = { ...(await held("figure.png", 96, 96, 9)), from };
    state().addPictures([pic], { x: 0, y: 0 });
    // (put down just where it was let go, over the first)
    const [id] = state().addPictures([pic], { x: 0, y: 0 }, true);
    const second = state().pictures.find((p) => p.id === id)!;
    expect(second).toMatchObject({ x: 0, y: 0, from });
    expect(state().pictures[0].x).toBe(0);
    expect(readWorkspace(workspaceText(store.getState()))?.drawn.pictures?.[0].from).toEqual(from);
    expect(readRecord(recordText({ atoms: [], bonds: [], pictures: [second] }))?.pictures?.[0].from).toEqual(from);
    // (a source that does not read is left out, not the picture)
    expect(readRecord(recordText({ atoms: [], bonds: [], pictures: [{ ...second, from: { ...from, box: [5, 5, 1, 1] } }] }))?.pictures?.[0].from).toBeUndefined();
  });

  it("have corners where they are turned to", () => {
    const c = cornersOf({ x: 1, y: 2, w: 4, h: 2, turn: Math.PI / 2 });
    expect(c[0].x).toBeCloseTo(2);
    expect(c[0].y).toBeCloseTo(0);
    expect(c[2].x).toBeCloseTo(0);
    expect(c[2].y).toBeCloseTo(4);
  });
});
