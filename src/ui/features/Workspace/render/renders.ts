/**
 * Rendering (docs/RENDER.md): molecules in 3D written as a scene
 * (./renderScene), given to the plugin that fills the role Render - the
 * Blender plugin - which prepares a job; the job run apart from Meno,
 * as a workflow's are (lib/jobs), looked at until it ends - how far it is,
 * as its log says ("progress 12/240") - and what it made, a picture or a
 * film, put on the page beside the molecules: where a placeholder of its
 * size stood meanwhile, with its progress and a way to stop it.
 *
 * What is rendering is the view's, kept for each workspace's store; a
 * render goes on if its workspace closes, and what it makes is then lost
 * - so a workspace closing stops its renders (`stopRenders`, as its tab
 * closes: App's `closeTab`).
 */
import { join } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { pluginsFilling, type PythonPlugin } from "../../../../lib/calc/catalog";
import { pluginClient, useReaders } from "../../../../lib/calc/workers";
import { givenValue, askKey, useAsks } from "../../../../lib/calc/asks";
import { isAsk, readGrid, resultKey, resultsOn } from "../../../../lib/calc/results";
import { finished, jobFolder, jobOf, readJobLog, removeJob, runningOf, startJob, stopJob, trimJob } from "../../../../lib/jobs";
import type { OptionValues } from "../../../../lib/options";
import { finishEntry, motionEntry, tooShort } from "./renderOptions";
import { lookFor, tooOld } from "../../../../lib/plugins/installed";
import { holdFilm } from "../../../../lib/picture/held";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { style3dOf } from "../style3d";
import type { EditorStore } from "../store";
import type { PictureItem } from "../store/types";
import { pictureToAdd } from "../utils/pictures";
import { freePlace, pageBoxes } from "../utils/freePlace";
import { PX } from "../workflow/look";
import { frameWords, wordsReach } from "./frameWords";
import { styleOf } from "../../../../lib/chem/style";
import { surfaceOf } from "../utils/surfaces";
import { carriedOf } from "../utils/workspace";
import { readPrepared } from "../workflow/programs";
import { renderScene, type RenderAsk, type Shown3D } from "./renderScene";

/** A render under way, or one that failed: what it makes, where it will lie on the page, how far it is, and what its job said last. */
export type Rendering = {
  key: number;
  kind: "picture" | "film";
  /** Where what it makes will lie, in the page's units: its middle, its width and height. */
  at: { x: number; y: number; w: number; h: number };
  /** Where what it renders lies, in the page's units: what is brought into view with it. */
  around: { x0: number; x1: number; y0: number; y1: number };
  state: "preparing" | "waiting" | "running" | "finishing" | "failed";
  /** How far it is: frames done of all, as its job says. */
  done?: number;
  total?: number;
  /** What its job said last. */
  line?: string;
  /** What is worth saying of what it makes, as it was asked (renderScene's `note`). */
  note?: string;
  /** Why it failed. */
  why?: string;
  job?: string;
  started: number;
  /** Asked to stop before its job began. */
  stopping?: boolean;
};

type Renders = { list: Rendering[] };

/** A render's place as a box, in the page's units. */
export const boxOf = (at: Rendering["at"]) => ({ x0: at.x - at.w / 2, x1: at.x + at.w / 2, y0: at.y - at.h / 2, y1: at.y + at.h / 2 });

/** A render's frame with its words where they stand below it (frameWords), in the page's units: what is kept clear for it, and what the view eases to. */
export function withWords(at: Rendering["at"], noted = false) {
  const b = boxOf(at);
  const reach = wordsReach(at.w / PX, frameWords(at.w / PX, at.h / PX, undefined, false, noted));
  return { x0: b.x0 - reach.side * PX, x1: b.x1 + reach.side * PX, y0: b.y0 - reach.below * PX, y1: b.y1 };
}

const stores = new WeakMap<EditorStore, UseBoundStore<StoreApi<Renders>>>();

/** The renders of a workspace, by its store. */
export function rendersOf(store: EditorStore): UseBoundStore<StoreApi<Renders>> {
  let r = stores.get(store);
  if (!r) {
    stores.set(store, (r = create<Renders>(() => ({ list: [] }))));
    // (their frames kept clear by what is put on the page meanwhile - a file opened, a set placed: utils/freePlace `pageBoxes`)
    r.subscribe((s, was) => {
      if (s.list.length === was.list.length && s.list.every((x, i) => x.at === was.list[i].at)) return;
      store.setState({ renderFrames: s.list.map((x) => withWords(x.at)) });
    });
  }
  return r;
}

/** Each workspace's closing, by its store (`stopRenders`): what its renders wait on cut short as it comes. */
const closings = new WeakMap<EditorStore, AbortController>();

function closingOf(store: EditorStore): AbortController {
  let c = closings.get(store);
  if (!c) closings.set(store, (c = new AbortController()));
  return c;
}

/** `ms` waited, or less: until `closing` comes. */
function waitFor(ms: number, closing: AbortSignal): Promise<void> {
  return new Promise((go) => {
    if (closing.aborted) return go();
    const done = () => {
      clearTimeout(t);
      closing.removeEventListener("abort", done);
      go();
    };
    const t = setTimeout(done, ms);
    closing.addEventListener("abort", done);
  });
}

/** The plugin that renders: the one chosen in Settings among those added, else the first added. */
export function renderer(): PythonPlugin | undefined {
  const added = useReaders.getState().state;
  const can = pluginsFilling("render").filter((p) => added[p.id] === "added");
  const chosen = useAppSettings.getState().plugins.roles.render;
  return can.find((p) => p.id === chosen) ?? can[0];
}

/** How often a render's job is looked at. */
const LOOK_MS = 1000;
/** What the scene is called in its job's folder. */
/** What the scene Meno writes is called in a render's job's folder. */
export const SCENE = "scene.gltf";
let next = 1;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "progress 12/240": how far a job is, as its log says it last. */
export function progressOf(text: string): { done: number; total: number } | null {
  let found: { done: number; total: number } | null = null;
  // (a line ends with \n, \r\n or a lone \r - as some systems' pipes and a program's own redraws leave it)
  for (const m of text.matchAll(/(?:^|[\r\n])progress (\d+)\/(\d+)[ \t]*(?=[\r\n]|$)/g)) {
    const done = Number(m[1]);
    const total = Number(m[2]);
    if (total > 0 && done <= total) found = { done, total };
  }
  return found;
}

/**
 * The molecules in 3D `ids` as they are shown: carried as a copy carries
 * them - turned, in the frame shown - and the surface and vibration each
 * shows from its calculation's list, where it shows one and it has been
 * given: the surface made at the value it is drawn at.
 */
export async function shownOf(store: EditorStore, ids: readonly number[]): Promise<Shown3D[]> {
  const st = store.getState();
  const carried = carriedOf(st);
  const asks = useAsks.getState().state;
  const out: Shown3D[] = [];
  for (let i = 0; i < st.molecules3d.length; i++) {
    const id = st.molecules3d[i].id;
    if (!ids.includes(id)) continue;
    const m = carried[i];
    const open = st.lists3d[id];
    const list = open ? resultsOn(st.molecules3d[i].calc?.results, "list").find((r) => resultKey(r) === open.list) : undefined;
    const row = list && open?.row != null ? list.rows[open.row] : undefined;
    const given = <T>(v: unknown, read: (x: unknown) => T | undefined): T | undefined => {
      if (!isAsk(v)) return read(v);
      const calc = st.molecules3d[i].calc;
      if (!calc || asks[askKey(calc.source, list?.from, v.ask)] !== "given") return undefined;
      return read(givenValue(calc.source, list?.from, v.ask));
    };
    const move = row?.move ? given(row.move, (v) => (Array.isArray(v) && v.length === 3 * m.atoms.length && v.every(Number.isFinite) ? (v as number[]) : undefined)) : undefined;
    const grid = row?.surface ? given(row.surface, readGrid) : undefined;
    // (coloured by another grid where it says so - NCI's sign(λ2)ρ - as the canvas colours it)
    const by = row?.colour ? given(row.colour.by, readGrid) : undefined;
    const colour = by && row?.colour ? { grid: by, from: row.colour.from, to: row.colour.to } : undefined;
    let surfaces: Shown3D["surfaces"];
    if (grid) {
      // (about the centre of the frame shown, as the canvas places it)
      const frame = m.frame ?? 0;
      const xyz = frame === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : (m.frames?.[frame - 1] ?? []);
      const n = Math.floor(xyz.length / 3) || 1;
      const centre: [number, number, number] = [0, 0, 0];
      for (let k = 0; k + 2 < xyz.length; k += 3) for (let c = 0; c < 3; c++) centre[c] += xyz[k + c] / n;
      surfaces = await surfaceOf(grid, centre, open?.iso ?? grid.iso ?? 0.05, colour).catch(() => undefined);
    }
    out.push({ m, ...(surfaces ? { surfaces } : {}), ...(move ? { move } : {}) });
  }
  return out;
}

/**
 * Renders the molecules in 3D `ids`, as asked, with the options chosen for
 * the plugin that renders: a placeholder where what it makes will lie -
 * beside them, on the right, as large as they are drawn - until it is
 * made, or why not said there. Throws, saying why, where there is nothing
 * to render - before any placeholder is put down.
 */
export async function startRender(store: EditorStore, ids: readonly number[], ask: RenderAsk, options: OptionValues): Promise<void> {
  const renders = rendersOf(store);
  const closing = closingOf(store).signal;
  const key = next++;
  const update = (patch: Partial<Rendering>) => renders.setState((s) => ({ list: s.list.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const fail = (why: string) => update({ state: "failed", why, line: undefined });
  const gone = () => !renders.getState().list.some((r) => r.key === key && !r.stopping);
  // (taken away with its workspace, as it closed: `stopRenders`)
  const taken = () => !renders.getState().list.some((r) => r.key === key);
  const plugin = renderer();
  if (!plugin) return;
  // (a film shorter than its motion can be read in is refused here, however it was asked for: Meno's rule, which no renderer keeps)
  const short = tooShort(ask, options, plugin.roleMotions?.render, plugin.roleLoopWhen?.render, ids.length);
  if (short) throw new Error(short);
  const shown = await shownOf(store, ids);
  if (closing.aborted) return;
  const rendered = renderScene(shown, style3dOf(store.getState()), ask);
  // (as large as they are drawn, beside them on the right - or, where something lies there, in the free space
  // nearest it: clear of all on the page and of other renders' places, by a bond's length. Where it will lie,
  // and where it is put)
  const { page } = rendered;
  const w = page.maxX - page.minX;
  const h = page.maxY - page.minY;
  const st = store.getState();
  const there = pageBoxes(st, styleOf(st.docStyle));
  // (with its words, where they stand below it: clear of all as the frame is)
  const reach = withWords({ x: 0, y: 0, w, h }, !!rendered.note);
  const place = freePlace(there, reach, { x: page.maxX + NOMINAL_BOND_LENGTH + reach.x1, y: (page.minY + page.maxY) / 2 }, NOMINAL_BOND_LENGTH);
  const at = { x: place.x, y: place.y, w, h };
  const around = { x0: page.minX, x1: page.maxX, y0: page.minY, y1: page.maxY };
  renders.setState((s) => ({ list: [...s.list, { key, kind: ask.kind, at, around, state: "preparing", started: Date.now(), ...(rendered.note ? { note: rendered.note } : {}) }] }));

  const settings = useAppSettings.getState();
  const { cores } = runningOf(settings.calculations);
  let job: string;
  try {
    const paths = new Map<string, string>();
    for (const decl of plugin.installed.filter((d) => plugin.rolePrograms.render?.includes(d.name))) {
      const where = await lookFor(plugin.id, decl.name);
      if (!where) return fail(`${tooOld(plugin.id, decl.name) ?? `${decl.label} is not found: locate it in Settings, Plugins`}.`);
      paths.set(decl.name, where);
    }
    const client = await pluginClient(plugin);
    const entry = { scene: SCENE, film: ask.kind === "film", width: rendered.width, height: rendered.height, frames: rendered.frames, fps: rendered.fps, ...finishEntry(ask.finish), ...motionEntry(ask) };
    const prepared = readPrepared(await client.prepare("render", [entry], options, cores), 1);
    if (typeof prepared === "string") return fail(prepared);
    const p = prepared[0];
    if (p.files.some((f) => f.name === SCENE)) return fail("It prepared a job Meno cannot run");
    if (gone()) return renders.setState((s) => ({ list: s.list.filter((r) => r.key !== key) }));
    const path = paths.get(p.program);
    job = await startJob({ plugin: plugin.id, program: p.program, args: p.args, files: [...p.files, { name: SCENE, text: rendered.gltf }], cores, ...(path ? { path } : {}), label: ask.kind === "film" ? "Film" : "Picture" });
  } catch (e) {
    return fail(message(e));
  }
  // (its workspace closed as its job began: stopped at once)
  if (taken()) return void stopJob(job).catch(() => {});
  update({ job, state: "waiting" });
  if (renders.getState().list.find((r) => r.key === key)?.stopping) void stopJob(job).catch(() => {});

  // looked at until it ends - or its workspace closes: where it is, and how far, as its log says
  let from = 0;
  let log = "";
  let state;
  for (;;) {
    await waitFor(LOOK_MS, closing);
    if (taken()) return;
    const record = await jobOf(job).catch(() => null);
    if (!record) return fail("Its job is gone");
    for (let k = 0; k < 40; k++) {
      const read = await readJobLog(job, from).catch(() => null);
      if (!read || read.next === from) break;
      from = read.next;
      log += read.text;
      // (what it said last is all that is wanted of a long log)
      if (log.length > 200_000) log = log.slice(-100_000);
    }
    const lines = log.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const said = [...lines].reverse().find((l) => !/^progress \d+\/\d+$/.test(l));
    const progress = progressOf(log);
    // (taken away while it was looked at: stopped with its workspace)
    if (taken()) return;
    update({ state: record.state === "running" ? "running" : record.state === "waiting" ? "waiting" : "finishing", ...(progress ?? {}), ...(said ? { line: said } : {}) });
    if (finished(record.state)) {
      state = record.state;
      break;
    }
  }
  if (state === "stopped" || state === "gone") {
    renders.setState((s) => ({ list: s.list.filter((r) => r.key !== key) }));
    void removeJob(job).catch(() => {});
    return;
  }
  // (its job failed: what it made - a film's frames, which it can make again - taken out of its folder, its log and what it
  // was given kept, to be read. One that made what cannot be shown keeps it, to be looked at)
  const failed = (why: string) => {
    void trimJob(job).catch(() => {});
    return fail(why);
  };
  try {
    const client = await pluginClient(plugin);
    const entry = { scene: SCENE, film: ask.kind === "film", width: rendered.width, height: rendered.height, frames: rendered.frames, fps: rendered.fps, ...finishEntry(ask.finish), ...motionEntry(ask) };
    const said = (await client.collect("render", [entry], options, {}, log, state)) as { why?: unknown; made?: unknown };
    if (typeof said?.why === "string") return failed(said.why.trim().slice(0, 300) || "It did not say why");
    const made = Array.isArray(said?.made) ? (said.made[0] as { file?: unknown; media?: unknown } | undefined) : undefined;
    const file = typeof made?.file === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(made.file) ? made.file : null;
    if (!file || (made?.media !== "image/png" && made?.media !== "video/mp4")) return fail("It said it made nothing Meno can show");
    const bytes = await readFile(await join(await jobFolder(job), file));
    const name = renderName(store, ids, made.media === "video/mp4" ? "mp4" : "png");
    // (where its frame stands now - moved since, as anything on the page is: what it made lands there)
    const there = renders.getState().list.find((r) => r.key === key)?.at ?? at;
    let picture: Omit<PictureItem, "id"> | null = null;
    if (made.media === "image/png") {
      const held = await pictureToAdd(name, bytes);
      if (held) picture = { name, sha256: held.sha256, media: held.media, px: [held.width, held.height], ...there };
    } else {
      const held = await holdFilm(bytes);
      if (held) picture = { name, sha256: held.sha256, media: "video/mp4", px: [rendered.width, rendered.height], ...there };
    }
    if (!picture) return fail("What it made cannot be shown");
    // (its workspace closed meanwhile: put on no page, and kept in its job's folder)
    if (taken()) return;
    store.getState().putPicture(picture);
    renders.setState((s) => ({ list: s.list.filter((r) => r.key !== key) }));
    void removeJob(job).catch(() => {});
  } catch (e) {
    fail(message(e));
  }
}

/** A render's frame moved to stand about (x, y), in the page's units: what it makes will land there (a drag on it, Renders2D). */
export function moveRender(store: EditorStore, key: number, x: number, y: number): void {
  rendersOf(store).setState((s) => ({ list: s.list.map((r) => (r.key === key ? { ...r, at: { ...r.at, x, y } } : r)) }));
}

/**
 * A render stopped: its job, where it has one - else it is not started - and its placeholder taken away. One that failed
 * is put away, its job's folder kept - its log, saying all Blender said - until Settings, Calculations, Jobs, clears it.
 */
export function stopRender(store: EditorStore, key: number): void {
  const renders = rendersOf(store);
  const r = renders.getState().list.find((x) => x.key === key);
  if (!r) return;
  if (r.state === "failed") {
    renders.setState((s) => ({ list: s.list.filter((x) => x.key !== key) }));
    return;
  }
  if (r.job) void stopJob(r.job).catch(() => {});
  renders.setState((s) => ({ list: s.list.map((x) => (x.key === key ? { ...x, stopping: true } : x)) }));
}

/**
 * Every render of a workspace stopped: it is closing, and what they make
 * would be lost. Their jobs are stopped as a step's are, their files kept
 * (a failed one's as it ended); none is looked at again, nothing goes on
 * its page, and none begins after. Resolved once each job has been asked.
 */
export function stopRenders(store: EditorStore): Promise<void> {
  closingOf(store).abort();
  const renders = rendersOf(store);
  const asked = renders.getState().list.flatMap((r) => (r.job && r.state !== "failed" ? [stopJob(r.job).catch(() => {})] : []));
  renders.setState({ list: [] });
  return Promise.all(asked).then(() => {});
}

/** What a render is called: after the molecule rendered, where it is one with a name. */
function renderName(store: EditorStore, ids: readonly number[], extension: string): string {
  const ms = store.getState().molecules3d.filter((m) => ids.includes(m.id));
  const named = ms.length === 1 && ms[0].name ? ms[0].name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) : "";
  return `${named || "Render"}.${extension}`;
}
