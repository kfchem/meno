/**
 * A PDF read in the column, drawn on the canvas (docs/PDF.md, *In the
 * column*, *One canvas*): the column lies over the canvas's right side, its
 * header in HTML (TextColumn), and what is read under it is drawn here, in
 * a view of its own - its pages one under another, as wide as the column,
 * where the column's reader says it is read (pdfColumnReader).
 *
 * The canvas is then drawn in three goes: the page, as ever; the column's
 * part of it, cut off where the column is; and what is on its way between
 * them - a page rising from the stack and going into the column as it
 * opens, growing to its width, or going back down to the stack as it is
 * closed; words, and boxes, carried out of a PDF (WordsFlight,
 * PictureFlight), over both.
 *
 * The page most in view is the page on top of the stack on the page, and a
 * page turned there is gone to here: the two are one thing.
 *
 * A text read in the column is drawn in its pass likewise, on a sheet of
 * its own (ColumnText).
 */
import * as THREE from "three";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useEditor, useEditorStore } from "../store";
import type { EditorState, PdfFlight, PdfItem, PictureFlight as PictureFlightState, WordsFlight as WordsFlightState, WorkspaceText } from "../store/types";
import { pdfRoom, shownSheet, topSheet } from "../../../../lib/pdf/layout";
import { columnWidthFor } from "../utils/texts";
import { viewBesideColumn } from "./coverLayer";
import { setViewGoal, viewGoalOf } from "./viewGoal";
import { pagesInView } from "../../../../lib/pdf/column";
import { textHad } from "../../../../lib/pdf/text";
import { figuresHad } from "../../../../lib/pdf/figures";
import { BASE, levelFor, Page, TILE, usePictures } from "./pdfPictures";
import { FLASH_MS, marksOn } from "./pdfMarks";
import { HEADER_PX, readerOf } from "./pdfColumnReader";
import { ease, SETTLE_MS } from "./Pdfs2D";
import WordsFlight from "./WordsFlight";
import PictureFlight from "./PictureFlight";
import ColumnText from "./ColumnText";
import MarkdownText from "./MarkdownText";
import TextFlight, { MarkdownFlight } from "./TextFlight";
import { columnSettingAt, sheetSetting } from "./textFlightSetting";
import { drawnSheetBox, iconScaleOf, sheetOf } from "../utils/textSheets";
import { lookOf, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { currentStyle3D } from "../style3d";
import { CARD_H, CARD_W } from "../workflow/look";
import { columnText, keepColumnTexts, markdownReaderOf, useShowsSource } from "../../TextEditor/columnText";
import { isMarkdown, readMarkdown } from "../../../../lib/text/markdown";
import { layOut } from "../../TextEditor/markdownLayout";
import { measureText } from "../../TextEditor/markdownType";

/** How long a page takes between the page and the column, in ms; and a text's lines, once settled, to hand over to the column's own. */
export const FLIGHT_MS = 420;
const HANDOVER_MS = 140;
/** How far toward the column an output's lines, or a log's, have come out of its molecule or its step once they are quite seen. */
const OUT_FADE = 0.35;
/** How long a text's flight waits at most for its lines to be laid out, in ms. */
const READY_MOST_MS = 250;

/**
 * Where a text's body lies on the page: its sheet - or, what it is the text
 * of (`of`): a step's log, its step's card; an output shown from a
 * molecule, that molecule as it is seen; none, a text with none of them, or
 * whose body has gone.
 */
function bodyBoxOf(st: EditorState, t: WorkspaceText): { x0: number; x1: number; y0: number; y1: number } | null {
  if (t.at) return drawnSheetBox(t);
  const of = t.of;
  if (!of) return null;
  if ("step" in of) {
    const s = st.steps.find((x) => x.id === of.step);
    return s ? { x0: s.x, x1: s.x + CARD_W, y0: s.y - CARD_H, y1: s.y } : null;
  }
  const m = st.molecules3d.find((x) => x.id === of.molecule);
  if (!m) return null;
  const style = currentStyle3D();
  const b = seenBounds(poseOf(m, solidOf(m, style), lookOf(m), st.turns3d[m.id], st.frames3d[m.id]));
  return { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
}

/** A rectangle on the canvas, in CSS pixels from its top left. */
type Rect = { x: number; y: number; w: number; h: number };

export default function PdfColumn() {
  const store = useEditorStore();
  const { camera, size, invalidate } = useThree();
  const open = useEditor((s) => s.textsOpen);
  const shown = useEditor((s) => s.pdfShown);
  const cover = useEditor((s) => s.cover);
  const pdfs = useEditor((s) => s.pdfs);
  const flight = useEditor((s) => s.pdfFlight);
  const words = useEditor((s) => s.pdfWords);
  const picture = useEditor((s) => s.pdfPicture);
  // (shutting, it goes on showing what it showed as it slides away - and
  // under a text it has gone on to, as that fades in over it)
  const last = useRef<number | null>(null);
  if (open && shown != null) last.current = shown;
  const drawn = open && shown != null ? shown : cover > 0.5 ? last.current : null;
  const pdf = pdfs.find((p) => p.id === drawn) ?? null;
  // (a text read, where no PDF is: likewise, as the column shuts on it)
  const texts = useEditor((s) => s.texts);
  const textShown = useEditor((s) => s.textShown);
  const lastText = useRef<number | null>(null);
  const reading = pdfs.some((p) => p.id === shown && p.reading);
  if (open && textShown != null && !reading) lastText.current = textShown;
  const textDrawn = open && textShown != null && !reading ? textShown : !pdf && cover > 0.5 ? lastText.current : null;
  const text = pdf ? null : (texts.find((t) => t.id === textDrawn) ?? null);
  // (a text on its way between its sheet and the column)
  const textFlight = useEditor((s) => s.textFlight);
  const flownText = textFlight ? (texts.find((t) => t.id === textFlight.id) ?? null) : null;
  // (one with no body on the page to go from or to: none goes - the column opens or shuts on it as it is)
  const flownBody = flownText ? bodyBoxOf(store.getState(), flownText) : null;
  useEffect(() => {
    if (textFlight && !flownBody) store.getState().endTextFlight();
  }, [textFlight, flownBody, store]);
  // a text read from its sheet, the column opening on it: the view eases, as for a PDF, so that the sheet is beside the column
  const textRising = textFlight?.to === "column" ? textFlight.start : null;
  useLayoutEffect(() => {
    if (textRising == null) return;
    const st = store.getState();
    const t = st.texts.find((x) => x.id === st.textFlight?.id);
    const body = t ? bodyBoxOf(st, t) : null;
    if (!body) return;
    const cam = camera as THREE.OrthographicCamera;
    const goal = viewGoalOf(cam);
    const view = { zoom: goal?.zoom ?? cam.zoom, x: goal?.x ?? cam.position.x, y: goal?.y ?? cam.position.y };
    const to = viewBesideColumn(view, size, { now: st.cover, final: columnWidthFor(size.width, false, null) }, body);
    if (!to) return;
    setViewGoal(cam, to);
    invalidate();
    // (as the text sets off, once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textRising]);
  useEffect(
    () =>
      keepColumnTexts(
        store,
        texts.map((t) => t.id),
      ),
    [store, texts],
  );
  const flown = flight ? (pdfs.find((p) => p.id === flight.id) ?? null) : null;
  // a PDF read in the column, the column opening on it over most of the
  // canvas: the view eases, as the column opens, so that the PDF is all in
  // what is left in view - smaller, where it would not be
  const rising = flight?.to === "column" ? flight.start : null;
  useLayoutEffect(() => {
    if (rising == null) return;
    const st = store.getState();
    const p = st.pdfs.find((x) => x.id === st.pdfFlight?.id);
    if (!p) return;
    const cam = camera as THREE.OrthographicCamera;
    const goal = viewGoalOf(cam);
    const view = { zoom: goal?.zoom ?? cam.zoom, x: goal?.x ?? cam.position.x, y: goal?.y ?? cam.position.y };
    const to = viewBesideColumn(view, size, { now: st.cover, final: columnWidthFor(size.width, true, st.pdfColumnWidth) }, pdfRoom(p));
    if (!to) return;
    setViewGoal(cam, to);
    invalidate();
    // (as the flight sets off, once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rising]);
  if (!pdf && !text && !flown && !flownBody && !words && !picture) return null;
  return (
    <ColumnPass
      pdf={pdf}
      text={text}
      flight={flight && flown ? flight : null}
      flown={flown}
      textFlight={textFlight && flownText && flownBody ? textFlight : null}
      flownText={flownBody ? flownText : null}
      words={words}
      picture={picture}
    />
  );
}

function ColumnPass({
  pdf,
  text,
  flight,
  flown,
  textFlight,
  flownText,
  words,
  picture,
}: {
  pdf: PdfItem | null;
  text: WorkspaceText | null;
  flight: PdfFlight | null;
  flown: PdfItem | null;
  textFlight: EditorState["textFlight"];
  flownText: WorkspaceText | null;
  words: WordsFlightState | null;
  picture: PictureFlightState | null;
}) {
  const store = useEditorStore();
  const { gl, size, invalidate, camera } = useThree();
  // (a Markdown text read formatted, unless its source is being written)
  const source = useShowsSource(store, text?.id ?? null);
  const formatted = !!text && isMarkdown(text.name) && !source;
  const cover = useEditor((s) => s.cover);
  const width = useEditor((s) => s.columnWidth);
  // (words selected, and places found, marked on the pages)
  const pdfSel = useEditor((s) => s.pdfSel);
  const pdfFind = useEditor((s) => s.pdfFind);
  const pdfFlash = useEditor((s) => s.pdfFlash);
  const pdfBox = useEditor((s) => s.pdfBox);
  const [, setTick] = useState(0);
  const redraw = useCallback(() => {
    setTick((t) => t + 1);
    invalidate();
  }, [invalidate]);
  const pics = usePictures(redraw);
  const reader = readerOf(store);
  const tall = Math.max(1, size.height - HEADER_PX);

  // where a page going back to the stack set off from: where it was on the
  // screen as the column began to shut, or went on to something else - it
  // lifts from there, and does not go away with the column
  const from = useRef<{ start: number; rect: Rect } | null>(null);
  if (flight?.to === "page" && from.current?.start !== flight.start && reader.id === flight.id) {
    const { l, top, left } = reader.seen();
    const p = l.pages[flight.page];
    const x0 = size.width - store.getState().cover;
    if (p) from.current = { start: flight.start, rect: { x: x0 + p.x - left, y: HEADER_PX + p.y - top, w: p.w, h: p.h } };
  }
  // (its size first, as far as it is known: a place asked for in it is worked out at it)
  reader.width = width;
  reader.tall = tall;
  if (pdf) reader.take(pdf);
  useEffect(() => {
    reader.redraw = redraw;
    return () => {
      reader.redraw = () => {};
      reader.letGo();
      pics.held.clear();
    };
  }, [reader, redraw, pics]);
  // (the column sliding, or made wider: drawn again)
  useEffect(() => invalidate(), [cover, width, invalidate]);

  // a page turned on the page - or undone, or gone to from the menu - is gone
  // to here (before the next frame, which would otherwise bring the page the
  // column is on back on top)
  const pageOnTop = pdf?.page;
  const pdfId = pdf?.id;
  useLayoutEffect(() => {
    // (as it is now, not as it was drawn: a page the column came to since is its own)
    const now = store.getState().pdfs.find((p) => p.id === pdfId)?.page;
    if (pageOnTop == null || now !== pageOnTop || now === reader.page) return;
    reader.page = now;
    reader.goTo(now);
  }, [pageOnTop, pdfId, reader, store]);

  const scene = useMemo(() => {
    const s = new THREE.Scene();
    s.background = new THREE.Color(BASE);
    return s;
  }, []);
  const textScene = useMemo(() => {
    const s = new THREE.Scene();
    s.background = new THREE.Color("#ffffff");
    return s;
  }, []);
  const cam = useMemo(() => new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100), []);
  const flightScene = useMemo(() => new THREE.Scene(), []);
  const flightCam = useMemo(() => new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100), []);
  useEffect(() => {
    cam.position.set(0, 0, 10);
    flightCam.position.set(0, 0, 10);
  }, [cam, flightCam]);

  const clock = useRef({ last: performance.now(), still: 0, levels: new Map<number, number>() });
  useFrame(({ gl: r, scene: page, camera }) => {
    const now = performance.now();
    const c = clock.current;
    const dt = Math.min(0.05, (now - c.last) / 1000);
    c.last = now;
    const st = store.getState();

    // the column: easing where it is sent, the page most in view said as it
    // goes, and on top on the page once it rests
    if (pdf && reader.id === pdf.id) {
      const going = reader.step(dt);
      if (reader.pageNow().changed) reader.tell("page");
      if (going) {
        c.still = now;
        redraw();
      } else {
        const onTop = st.pdfs.find((p) => p.id === pdf.id)?.page;
        if (onTop != null && onTop !== reader.page) st.readToPage(pdf.id, onTop, reader.page);
        // the tiles of the pages in view, once it has been still a moment
        if (now - c.still > SETTLE_MS) askTiles(now);
        else window.setTimeout(() => invalidate(), SETTLE_MS + 20);
      }
      if (pics.fading(now)) redraw();
      // (a place shown marked, fading)
      if (st.pdfFlash && now - st.pdfFlash.start < FLASH_MS + 80) redraw();
    }
    // a page between the page and the column - or a text, handing over once there
    if (flight) {
      if (now - flight.start >= FLIGHT_MS) st.endPdfFlight();
      redraw();
    }
    if (textFlight) {
      const begun = textBegun.current?.start === textFlight.start ? textBegun.current.at : null;
      if (begun != null && now - begun >= FLIGHT_MS + HANDOVER_MS) st.endTextFlight();
      // (one never ready - its lines not laid out - set off all the same, a moment on)
      else if (begun == null && now - textFlight.start > READY_MOST_MS) textBegun.current = { start: textFlight.start, at: now };
      redraw();
    }

    // drawn: the page; the column's part, cut off where it is; the page on its way
    const W = size.width;
    const H = size.height;
    r.autoClear = true;
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    r.render(page, camera);
    const covered = st.cover;
    if ((pdf || text) && covered > 0.5) {
      cam.left = 0;
      cam.right = reader.width;
      cam.top = 0;
      cam.bottom = -tall;
      cam.updateProjectionMatrix();
      r.autoClear = false;
      r.setScissorTest(true);
      r.setScissor(W - covered, 0, covered, tall);
      r.setViewport(W - covered, 0, reader.width, tall);
      r.render(pdf ? scene : textScene, cam);
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
    }
    if (flight || textFlight || words || picture) {
      flightCam.left = 0;
      flightCam.right = W;
      flightCam.top = 0;
      flightCam.bottom = -H;
      flightCam.updateProjectionMatrix();
      r.autoClear = false;
      r.clearDepth();
      r.render(flightScene, flightCam);
    }
    r.autoClear = true;
  }, 1);

  /** The tiles of the column's pages in view asked for at the level the screen wants. */
  const askTiles = (now: number) => {
    if (!pdf) return;
    const { l, top, left } = reader.seen();
    const dpr = gl.getPixelRatio();
    const level = levelFor(l.scale * dpr, Math.max(...pdf.pages.map(([w]) => w)));
    const held = new Set<string>();
    let asked = false;
    for (const i of pagesInView(l, top, tall)) {
      const p = l.pages[i];
      // (its letters, and its figures, ready for a press on them)
      textHad(pdf.sha256, i);
      figuresHad(pdf.sha256, i);
      clock.current.levels.set(i, level);
      if (!level) continue;
      const part = {
        x0: (left - p.x) / l.scale,
        x1: (left + reader.width - p.x) / l.scale,
        y0: (top - p.y) / l.scale,
        y1: (top + tall - p.y) / l.scale,
      };
      // (the column's own come first, nearest its middle)
      const mid = { x: left + reader.width / 2, y: top + tall / 2 };
      asked =
        pics.ask(
          {
            sha256: pdf.sha256,
            page: i,
            size: pdf.pages[i],
            level,
            part,
            nearness: (ti, tj) => -0.5 + Math.hypot(p.x + ((ti + 0.5) * TILE * l.scale) / level - mid.x, p.y + ((tj + 0.5) * TILE * l.scale) / level - mid.y) * 1e-6,
            stillSince: () => clock.current.still,
          },
          now,
        ) || asked;
      for (const t of pics.tilesOf(pdf.sha256, i, level)) held.add(t.key);
    }
    pics.held = held;
    if (asked) redraw();
  };

  const now = performance.now();
  // the column's pages in view, and those just beyond, to be ready
  const column = (() => {
    if (!pdf || reader.id !== pdf.id) return null;
    const { l, top, left } = reader.seen();
    // (the page on its way, in or out, is the one flying, not one left in the column)
    const hidden = flight?.id === pdf.id ? flight.page : null;
    return pagesInView(l, top, tall, tall / 2)
      .filter((i) => i !== hidden)
      .map((i) => {
        const p = l.pages[i];
        return (
          <Page
            key={i}
            s={{ x: p.x - left + p.w / 2, y: -(p.y - top + p.h / 2), w: p.w, h: p.h }}
            pt={pdf.pages[i]}
            lift={0}
            z={0}
            now={now}
            px={1}
            preview={pics.preview(pdf, i)}
            tiles={pics.tilesOf(pdf.sha256, i, clock.current.levels.get(i) ?? 0)}
            marks={marksOn(pdf, i, pdfSel, pdfFind?.found ?? [], pdfFind ? (pdfFind.found[pdfFind.now] ?? null) : null, redraw, pdfFlash, pdfBox)}
          />
        );
      });
  })();

  // the page on its way: from the stack to its place in the column, or back
  const flying = (() => {
    if (!flight || !flown) return null;
    const t = Math.min(1, (now - flight.start) / FLIGHT_MS);
    const k = ease(t);
    const onPage = stackRect(flown, flight.page);
    let inColumn: Rect | null = null;
    const x0 = size.width - store.getState().cover;
    if (flight.to === "column" && reader.id === flight.id) {
      const { l, top, left } = reader.seen();
      const p = l.pages[flight.page];
      if (p) inColumn = { x: x0 + p.x - left, y: HEADER_PX + p.y - top, w: p.w, h: p.h };
    } else if (flight.to === "page" && from.current?.start === flight.start) inColumn = from.current.rect;
    if (!onPage || !inColumn) return null;
    const [a, b] = flight.to === "column" ? [onPage, inColumn] : [inColumn, onPage];
    const r = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
    const level = clock.current.levels.get(flight.page) ?? 0;
    return (
      <Page
        s={{ x: r.x + r.w / 2, y: -(r.y + r.h / 2), w: r.w, h: r.h }}
        pt={flown.pages[flight.page]}
        lift={Math.sin(Math.PI * t)}
        z={0}
        now={now}
        px={1}
        preview={pics.preview(flown, flight.page)}
        tiles={pics.tilesOf(flown.sha256, flight.page, level)}
      />
    );
  })();

  // a text on its way: from its sheet to the column, or back - the column's own lines unseen till it hands over, its sheet
  // in the column at its start when it goes back, as the column shuts
  const textFrom = useRef<{ start: number; rect: Rect } | null>(null);
  // (set off once its lines are laid out: when, for the flight it is)
  const textBegun = useRef<{ start: number; at: number } | null>(null);
  if (textFlight?.to === "page" && textFrom.current?.start !== textFlight.start) {
    textFrom.current = { start: textFlight.start, rect: { x: size.width - store.getState().cover, y: HEADER_PX, w: width, h: tall } };
  }
  const begunAt = textFlight && textBegun.current?.start === textFlight.start ? textBegun.current.at : null;
  const textT = textFlight ? (begunAt == null ? 0 : (now - begunAt) / FLIGHT_MS) : 1;
  // (the column's own lines unseen from when it sets off till it hands over)
  const textHidden = !!textFlight && begunAt != null && (textFlight.to === "page" || textT < 1);
  const textFlying = (() => {
    if (!textFlight || !flownText) return null;
    const b = bodyBoxOf(store.getState(), flownText);
    if (!b) return null;
    const c = camera as THREE.OrthographicCamera;
    const z = c.zoom || 1;
    const s = sheetOf(flownText.text, flownText.name);
    const onPage = { x: size.width / 2 + (b.x0 - c.position.x) * z, y: size.height / 2 - (b.y1 - c.position.y) * z, w: (b.x1 - b.x0) * z, h: (b.y1 - b.y0) * z };
    // (from a molecule or a step, not a sheet: coming up out of it, and going down into it, fading)
    const outOfBody = !flownText.at;
    const inColumn = textFlight.to === "column" ? { x: size.width - store.getState().cover, y: HEADER_PX, w: width, h: tall } : textFrom.current?.rect;
    if (!inColumn) return null;
    const t = Math.min(1, textT);
    const k = textFlight.to === "column" ? ease(t) : 1 - ease(t);
    const handing = textT <= 1 ? 1 : Math.max(0, 1 - ((textT - 1) * FLIGHT_MS) / HANDOVER_MS);
    const out = outOfBody ? Math.min(1, k / OUT_FADE) : 1;
    const seen = begunAt == null ? 0 : handing * out;
    const flightStart = textFlight.start;
    const onReady = () => {
      if (textBegun.current?.start === flightStart) return;
      textBegun.current = { start: flightStart, at: performance.now() };
      redraw();
    };
    // (a Markdown text's rows formatted, its sheet's growing into the column's - as the column lays it out, from where it is read)
    if (s.md && !outOfBody) {
      const r = markdownReaderOf(columnText(store, flownText.id, flownText.text), flownText.text);
      const laid = r.viewW ? r.layout : layOut(readMarkdown(flownText.text).blocks, Math.max(120, Math.round(width - 1)), measureText);
      return (
        <MarkdownFlight
          key={flightStart}
          sheet={onPage}
          column={inColumn}
          k={k}
          lift={Math.sin(Math.PI * t)}
          seen={seen}
          onSheet={{ laid: s.md.laid, rows: s.md.rows }}
          inColumn={{ laid, top: r.viewW ? r.scrollTop : 0 }}
          onReady={onReady}
        />
      );
    }
    // (from an icon, its lines as small as it shows them)
    const set = outOfBody ? columnSettingAt(onPage.w, inColumn) : sheetSetting(z * (flownText.icon ? iconScaleOf(s) : 1));
    return <TextFlight key={flightStart} sheet={onPage} column={inColumn} set={set} k={k} lift={Math.sin(Math.PI * t)} seen={seen} lines={s.lines} onReady={onReady} />;
  })();

  /** Where a PDF's page lies on the canvas now: on top of its stack, among its pages spread, or on its icon. */
  function stackRect(p: PdfItem, page: number): Rect | null {
    const s = shownSheet(p, page) ?? topSheet(p);
    if (!s) return null;
    const c = camera as THREE.OrthographicCamera;
    const z = c.zoom || 1;
    return {
      x: size.width / 2 + (s.x - s.w / 2 - c.position.x) * z,
      y: size.height / 2 - (s.y + s.h / 2 - c.position.y) * z,
      w: s.w * z,
      h: s.h * z,
    };
  }

  return (
    <>
      {createPortal(<>{column}</>, scene)}
      {createPortal(
        <>{text && (formatted ? <MarkdownText key={`md${text.id}`} text={text} hidden={textHidden} /> : <ColumnText key={text.id} text={text} hidden={textHidden} />)}</>,
        textScene,
      )}
      {createPortal(
        <>
          {flying}
          {textFlying}
          {words && <WordsFlight w={words} />}
          {picture && <PictureFlight f={picture} />}
        </>,
        flightScene,
      )}
    </>
  );
}
