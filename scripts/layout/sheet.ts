/**
 * The layout benchmark as one page: every molecule in molecules.json, its
 * Wikipedia structure beside each layout engine's, all drawn by Meno's own
 * drawing code in ACS 1996, with what layoutMetrics makes of each.
 *
 *   <chem python> scripts/layout/baselines.py   # RDKit's layouts, once
 *   npm run layout-bench                        # writes .layout/index.html
 *   npm run layout-bench -- --open              # and opens it
 *
 * The Wikipedia structures are shown from Wikimedia Commons, with their
 * licence and author; nothing of them is copied here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  createSVG,
  layoutMolecule,
  wedgeNarrowAtom,
  type Atom,
  type Bond,
} from "../../src/lib/chem/layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "../../src/lib/chem/acs";
import {
  layoutMetrics,
  scoreParts,
  type LayoutMetrics,
} from "../../src/lib/layout/metrics";
import { layout2D } from "../../src/lib/layout/engine";
import { placedAbbreviation } from "../../src/lib/chem/abbreviationPlace";
import type { Molecule } from "./fetch";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
// --list=heldout: another list of molecules beside molecules.json (heldout.json), drawn into .layout/heldout/
const listName = process.argv.find((a) => a.startsWith("--list="))?.slice(7) ?? "molecules";
const outDir = listName === "molecules" ? resolve(root, ".layout") : resolve(root, ".layout", listName);

type Graph = {
  atoms: {
    el: string;
    charge: number;
    hs: number;
    tetra?: { neighbours: number[]; volume: 1 | -1 };
  }[];
  bonds: {
    a: number;
    b: number;
    order: number;
    stereo?: { refs: [number, number]; cis: boolean };
  }[];
};
type Laid = {
  /** The molecule as this engine draws it: with the H atoms it adds. */
  graph: Graph;
  x: number[];
  y: number[];
  wedges: { bond: number; narrow: number; stereo: "up" | "down" }[];
  ms: number;
  /** Depth, for a cage drawn in perspective: a bond behind another is broken. */
  depth?: (number | null)[];
  solid?: boolean[];
};
type Baseline = {
  name: string;
  graph: Graph;
  layouts: Record<string, Laid>;
};

const ZOOM = 30;

/** A layout drawn by Meno, at Meno's bond length. */
function draw(g: Graph, laid: Laid): string {
  const lengths = g.bonds.map(({ a, b }) =>
    Math.hypot(laid.x[a] - laid.x[b], laid.y[a] - laid.y[b]),
  );
  const sorted = [...lengths].sort((p, q) => p - q);
  const typical = sorted.length ? sorted[sorted.length >> 1] : 1;
  const k = NOMINAL_BOND_LENGTH / (typical || 1);
  const atoms: Atom[] = g.atoms.map((a, i) => ({
    id: i,
    x: laid.x[i] * k,
    y: laid.y[i] * k,
    el: a.el,
    ...(laid.depth?.[i] != null ? { z: laid.depth[i]! * k } : {}),
  }));
  const degree = new Map<number, number>();
  for (const { a, b } of g.bonds) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const wedge = new Map(laid.wedges.map((w) => [w.bond, w]));
  const bonds: Bond[] = g.bonds.map(({ a, b, order }, i) => {
    const bond: Bond = { a1: a, a2: b, order: order as 1 | 2 | 3, stereo: "none" };
    const w = wedge.get(i);
    if (w) {
      bond.stereo = w.stereo;
      const usual = wedgeNarrowAtom({ ...bond, stereoOrient: "principle" }, degree);
      bond.stereoOrient = usual === w.narrow ? "principle" : "reverse";
    }
    return bond;
  });
  const opts = acsWorldOptions(atoms, bonds, { units: "world", minLinePx: 1.25 });
  return createSVG(layoutMolecule(atoms, bonds, opts, ZOOM), opts);
}

function measure(g: Graph, laid: Laid, base: Baseline): LayoutMetrics {
  return layoutMetrics({
    x: laid.x,
    y: laid.y,
    edges: g.bonds.map(({ a, b }) => [a, b] as const),
    orders: g.bonds.map((b) => b.order),
    wedged: laid.wedges.map((w) => w.bond),
    // a label for anything but a neutral carbon
    labelled: g.atoms.map((a) => a.el !== "C" || a.charge !== 0),
    elements: g.atoms.map((a) => a.el),
    hydrogens: g.atoms.map((a) => a.hs),
    cisTrans: base.graph.bonds.flatMap((b, i) =>
      b.stereo ? [{ bond: i, refs: b.stereo.refs, cis: b.stereo.cis }] : [],
    ),
    perspective: laid.solid,
    depth: laid.depth,
    tetra: g.atoms.map((_, i) => base.graph.atoms[i]?.tetra),
  });
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** What each part of the score is called on the sheet. */
const partNames: Record<keyof ReturnType<typeof scoreParts>, string> = {
  overlaps: "overlaps",
  crossings: "crossings",
  wrongDoubles: "wrong cis/trans",
  clashes: "clashes",
  crowdedLabels: "crowded labels",
  ringWedges: "wedges on rings",
  bondSpread: "bond lengths",
  angleError: "angles",
  macroAngleError: "macrocycle angles",
  ringError: "rings",
  tilt: "tilt",
  gridError: "askew",
  substituentError: "substituents",
  chainFold: "folded chains",
  chainSplay: "splayed chains",
  chainTilt: "chains off level",
  axisTilt: "long axis",
  aspect: "tall",
  macroAspect: "macrocycle tall",
  readingOrder: "reading order",
  ringOrder: "ring order",
  face: "face",
};

const fmt = (m: LayoutMetrics) => {
  // what the score is made of, the largest first
  const parts = Object.entries(scoreParts(m))
    .filter(([, v]) => v >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${partNames[k as keyof typeof partNames]} ${v.toFixed(1)}`);
  return [
    `<b>score ${m.score.toFixed(1)}</b>${parts.length ? ` = ${parts.join(" + ")}` : ""}`,
    `overlaps ${m.overlaps} · crossings ${m.crossings} · clashes ${m.clashes} · crowded labels ${m.crowdedLabels} · wrong cis/trans ${m.wrongDoubles}`,
    `bonds ±${(m.bondSpread * 100).toFixed(1)}% · angles ${m.angleError.toFixed(1)}° · rings ${m.ringError.toFixed(3)} · macrocycle ${m.macroAngleError.toFixed(1)}°`,
    `tilt ${m.tilt.toFixed(1)}° · askew ${m.gridError.toFixed(1)}° · substituents ${m.substituentError.toFixed(1)}° · wedges on rings ${m.ringWedges}`,
    `chains folded ${m.chainFold.toFixed(2)}, splayed ${m.chainSplay.toFixed(0)}°, off level ${m.chainTilt.toFixed(0)}° · long axis ${m.axisTilt.toFixed(0)}°`,
    `height/width ${m.aspect.toFixed(2)}, macrocycle ${m.macroAspect.toFixed(2)} · reading order ${m.readingOrder} · ring order ${m.ringOrder} · face ${m.face}`,
  ].join("<br>");
};

const listed: Molecule[] = JSON.parse(
  readFileSync(resolve(here, `${listName}.json`), "utf8"),
).molecules;
const basePath = resolve(outDir, "baselines.json");
if (!existsSync(basePath)) {
  console.error("No baselines: run scripts/layout/baselines.py in the chem environment first.");
  process.exit(1);
}
const baselines = new Map<string, Baseline>(
  (JSON.parse(readFileSync(basePath, "utf8")).molecules as Baseline[]).map((b) => [b.name, b]),
);

const engines = ["Meno", "CoordGen", "RDKit"];

/** Meno's own layout of a molecule, timed: with the H atoms it draws, and its wedges. */
function meno(g: Graph): Laid {
  const t = performance.now();
  const out = layout2D(g);
  const ms = Math.round((performance.now() - t) * 10) / 10;
  const graph: Graph = { atoms: [...g.atoms], bonds: [...g.bonds] };
  const x = [...out.x];
  const y = [...out.y];
  const hydrogenOf = new Map<number, number>();
  for (const h of out.hydrogens) {
    graph.atoms.push({ el: "H", charge: 0, hs: 0 });
    graph.bonds.push({ a: h.on, b: graph.atoms.length - 1, order: 1 });
    x.push(h.at.x);
    y.push(h.at.y);
    hydrogenOf.set(h.on, graph.atoms.length - 1);
  }
  const wedges = out.wedges.map((w) => {
    const to = w.to === -1 ? hydrogenOf.get(w.from)! : w.to;
    const bond = graph.bonds.findIndex(
      (b) => (b.a === w.from && b.b === to) || (b.b === w.from && b.a === to),
    );
    return { bond, narrow: w.from, stereo: w.stereo };
  });
  return { graph, x, y, wedges, ms, depth: out.depth, solid: out.solid };
}

// --only=Name,Name draws just those molecules
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",")
  .map((s) => s.toLowerCase());
const totals = new Map<string, { score: number; overlaps: number; crossings: number; n: number }>();
/** Mean score by category, then engine. */
const byCategory = new Map<string, Map<string, { score: number; n: number }>>();
const rows: string[] = [];
const scores: Record<string, Record<string, LayoutMetrics>> = {};
let category = "";
for (const m of listed) {
  const base = baselines.get(m.name);
  if (!base) continue;
  if (only && !only.some((o) => m.name.toLowerCase().startsWith(o))) continue;
  base.layouts.Meno = meno(base.graph);
  if (m.category !== category) {
    category = m.category;
    rows.push(`<h2>${escape(category)}</h2>`);
  }
  const ref = m.reference
    ? `<figure class="ref"><div class="art"><img src="${m.reference.url}" alt="${escape(m.name)} on Wikipedia" loading="lazy"></div>
<figcaption>Wikipedia · <a href="${m.reference.page}">${escape(m.reference.licence)}</a>, ${escape(m.reference.author).slice(0, 60)}${m.referenceNote ? `<br><b>${escape(m.referenceNote)}</b>` : ""}</figcaption></figure>`
    : `<figure class="ref"><div class="art empty">no reference</div><figcaption>${escape(m.noReference ?? "Wikipedia")}</figcaption></figure>`;
  const cells = engines.map((e) => {
    const laid = base.layouts[e];
    if (!laid) return "";
    const metrics = measure(laid.graph, laid, base);
    (scores[m.name] ??= {})[e] = metrics;
    const cat = byCategory.get(m.category) ?? new Map();
    const c = cat.get(e) ?? { score: 0, n: 0 };
    cat.set(e, { score: c.score + metrics.score, n: c.n + 1 });
    byCategory.set(m.category, cat);
    const t = totals.get(e) ?? { score: 0, overlaps: 0, crossings: 0, n: 0 };
    totals.set(e, {
      score: t.score + metrics.score,
      overlaps: t.overlaps + metrics.overlaps,
      crossings: t.crossings + metrics.crossings,
      n: t.n + 1,
    });
    return `<figure><div class="art">${draw(laid.graph, laid)}</div>
<figcaption><b>${e}</b> · ${laid.ms} ms<br>${fmt(metrics)}</figcaption></figure>`;
  });
  rows.push(`<section><h3>${escape(m.name)} <span class="cid">CID ${m.cid} · ${base.graph.atoms.length} atoms</span></h3>
<div class="row">${ref}${cells.join("")}</div></section>`);
}

// Complexes of metals, from organometallics.json: each laid out as Meno's
// own label for it stands for it (PubChem's SMILES leaves a haptic bond
// out), drawn and measured as the rest - but a pi system's star, and the
// haptic bond to it, which are no atom and no bond to measure.
type Metal = { name: string; label: string; page: string; category: string };
const metals: Metal[] = listName === "molecules" ? JSON.parse(readFileSync(resolve(here, "organometallics.json"), "utf8")).molecules : [];
const metalTotals = { score: 0, overlaps: 0, crossings: 0, n: 0 };
let metalCategory = "";
for (const m of metals) {
  if (only && !only.some((o) => m.name.toLowerCase().startsWith(o))) continue;
  if (m.category !== metalCategory) {
    metalCategory = m.category;
    rows.push(`<h2>Metals: ${escape(metalCategory)}</h2>`);
  }
  const t = performance.now();
  const s = placedAbbreviation(m.label, null, 1);
  const ms = Math.round((performance.now() - t) * 10) / 10;
  const ref = `<figure class="ref"><div class="art empty"><a href="${m.page}">${escape(m.name)} on Wikipedia</a></div><figcaption>Meno's label: <code>${escape(m.label)}</code></figcaption></figure>`;
  if (!s) {
    rows.push(`<section><h3>${escape(m.name)}</h3><div class="row">${ref}<figure><div class="art empty">not read</div></figure></div></section>`);
    continue;
  }
  const keep = s.atoms.map((_, i) => i).filter((i) => s.atoms[i].el !== "*");
  const index = new Map(keep.map((i, k) => [i, k]));
  const own = s.bonds.filter((b) => !b.endpoints && index.has(b.a1) && index.has(b.a2));
  const metrics = layoutMetrics({
    x: keep.map((i) => s.atoms[i].x),
    y: keep.map((i) => s.atoms[i].y),
    edges: own.map((b) => [index.get(b.a1)!, index.get(b.a2)!] as const),
    orders: own.map((b) => b.order),
    wedged: own.flatMap((b, k) => (b.stereo === "up" || b.stereo === "down" ? [k] : [])),
    labelled: keep.map((i) => s.atoms[i].el !== "C" || !!s.atoms[i].charge),
    elements: keep.map((i) => s.atoms[i].el),
    hydrogens: keep.map(() => 0),
    cisTrans: [],
    depth: keep.map((i) => s.atoms[i].z ?? null),
    // (a ring in perspective - face-on to its metal, turned on its bond - as a cage is)
    perspective: keep.map((i) => s.atoms[i].z != null),
    tetra: keep.map(() => undefined),
  });
  (scores[m.name] ??= {}).Meno = metrics;
  metalTotals.score += metrics.score;
  metalTotals.overlaps += metrics.overlaps;
  metalTotals.crossings += metrics.crossings;
  metalTotals.n++;
  const atoms: Atom[] = s.atoms.map((a, i) => ({
    ...a,
    id: i,
    x: a.x * NOMINAL_BOND_LENGTH,
    y: a.y * NOMINAL_BOND_LENGTH,
    ...(a.z != null ? { z: a.z * NOMINAL_BOND_LENGTH } : {}),
  }));
  const bonds: Bond[] = s.bonds.map((b) => ({ ...b, stereo: b.stereo ?? "none" }));
  const opts = acsWorldOptions(atoms, bonds, { units: "world", minLinePx: 1.25 });
  const svg = createSVG(layoutMolecule(atoms, bonds, opts, ZOOM), opts);
  rows.push(`<section><h3>${escape(m.name)} <span class="cid">${keep.length} atoms</span></h3>
<div class="row">${ref}<figure><div class="art">${svg}</div><figcaption><b>Meno</b> · ${ms} ms<br>${fmt(metrics)}</figcaption></figure></div></section>`);
}

const summary = engines
  .filter((e) => totals.has(e))
  .map((e) => {
    const t = totals.get(e)!;
    return `<tr><td>${e}</td><td>${(t.score / t.n).toFixed(1)}</td><td>${t.overlaps}</td><td>${t.crossings}</td></tr>`;
  })
  .join("");

const categories = [...byCategory]
  .map(
    ([cat, per]) =>
      `<tr><td>${escape(cat)}</td>${engines
        .map((e) => {
          const c = per.get(e);
          return `<td>${c ? (c.score / c.n).toFixed(1) : ""}</td>`;
        })
        .join("")}</tr>`,
  )
  .join("");

const page = `<!doctype html>
<meta charset="utf-8">
<title>Meno layout benchmark</title>
<style>
  :root { color-scheme: light }
  body { margin: 0 auto; padding: 2rem 1.5rem 4rem; max-width: 1800px; background: #fff; color: #111;
         font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem }
  .lede { color: #555; max-width: 75ch }
  h2 { font-size: 1.1rem; margin: 2.5rem 0 0; padding-top: 1rem; border-top: 2px solid #111 }
  section { border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 1.25rem }
  h3 { font-size: .95rem; margin: 0 0 .5rem }
  .cid { color: #777; font-weight: normal; font-size: 12px }
  .row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem }
  figure { margin: 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff }
  .art { display: flex; align-items: center; justify-content: center; height: 300px; padding: .5rem }
  .art svg, .art img { max-width: 100%; max-height: 100%; height: auto }
  .art.empty { color: #999 }
  figcaption { border-top: 1px solid #f1f3f5; padding: .35rem .6rem; font-size: 12px; color: #444 }
  table { border-collapse: collapse; margin: 1rem 0 }
  td, th { border: 1px solid #e5e7eb; padding: .25rem .6rem; text-align: right }
  td:first-child, th:first-child { text-align: left }
  @media (max-width: 800px) { .row { grid-template-columns: 1fr } }
</style>
<h1>Meno layout benchmark</h1>
<p class="lede">Each molecule's Wikipedia structure, the reference to draw as well as, beside each layout
engine's, every layout drawn by Meno in ACS 1996. Lower scores are better: overlaps, crossings and atoms
on bonds count most; then how the drawing sits - turned off the lattice, chains off level, out of reading
order - and its shape - uneven bonds, rings off regular, angles off ideal. Each caption shows what its
score is made of, the largest part first. Written by
<code>npm run layout-bench</code>; nothing here is checked in, and the Wikipedia images are shown from
Wikimedia Commons under the licences given.</p>
<table><tr><th>engine</th><th>mean score</th><th>overlaps</th><th>crossings</th></tr>${summary}</table>
${metalTotals.n ? `<table><tr><th>metals</th><th>mean score</th><th>overlaps</th><th>crossings</th></tr><tr><td>Meno</td><td>${(metalTotals.score / metalTotals.n).toFixed(1)}</td><td>${metalTotals.overlaps}</td><td>${metalTotals.crossings}</td></tr></table>` : ""}
<table><tr><th>mean score by category</th>${engines.map((e) => `<th>${e}</th>`).join("")}</tr>${categories}</table>
${rows.join("\n")}
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "scores.json"), JSON.stringify(scores, null, 1));
const out = resolve(outDir, "index.html");
writeFileSync(out, page);
console.log(`${rows.length} rows -> ${out}`);
for (const e of engines) {
  const t = totals.get(e)!;
  if (!t) continue;
  console.log(`${e.padEnd(10)} mean score ${(t.score / t.n).toFixed(1)}, overlaps ${t.overlaps}, crossings ${t.crossings}`);
}
if (metalTotals.n) {
  const t = metalTotals;
  console.log(`${"metals".padEnd(10)} mean score ${(t.score / t.n).toFixed(1)}, overlaps ${t.overlaps}, crossings ${t.crossings} (Meno, ${t.n})`);
}
if (process.argv.includes("--open")) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", out]]
      : process.platform === "darwin"
        ? ["open", [out]]
        : ["xdg-open", [out]];
  execFileSync(cmd as string, args as string[]);
}
