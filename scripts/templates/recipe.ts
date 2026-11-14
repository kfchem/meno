/**
 * The recipe of the ConfoTS-type template, as data: each step of the page - its stage, its kind, who does it, its options - and where each of
 * its inputs comes from. One table, reviewed line by line (docs/WORKFLOWS-FOUNDATION.md, case F); `build.ts` puts it on a page through the
 * workspace's own actions, so the page always matches the current kinds and is made again, never edited by hand.
 *
 * A source is `"@reaction"` - the chemist's set round the drawn reaction - or a step's key, `"key"` for its first exit, `"key.rest"` for another.
 * Every number here is the chemist's to change; the values are the recipe's starting ones (docs/WORKFLOWS.md, *The ConfoTS-type templates*).
 */
import type { OptionValues } from "../../src/lib/options";
import type { StepKind } from "../../src/ui/features/Workspace/workflow/kinds";

/**
 * The options each plugin's steps take, by kind, as their manifests say (kfchem/meno-plugins, 2026-11-12: orca 0.5.7, gaussian 0.6.1, rdkit 0.1.24; the manifests are read
 * where the plugin is installed, so the test holds the recipe to this list): a recipe naming an option a plugin has not is caught here, not on a card.
 */
export const PLUGIN_OPTIONS: Record<string, Record<string, readonly string[]>> = {
  orca: {
    optimise: ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "maxcore", "wavefunction"],
    frequencies: ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "maxcore", "vibrations", "wavefunction"],
    "path-search": ["method", "basis", "run", "images", "maxiter", "keywords", "maxcore"],
    "reaction-path": ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "maxiter", "maxcore"],
    "saddle-point": ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "hessian", "maxcore"],
  },
  gaussian: {
    optimise: ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "memory", "wavefunction"],
    energy: ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "memory", "wavefunction"],
    frequencies: ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "memory", "wavefunction"],
    "saddle-point": ["method", "basis", "dispersion", "solvation", "solvent", "keywords", "memory", "hessian", "tight"],
  },
  rdkit: { conformers: [], minimise: ["field", "fallback", "steps", "start"], descriptors: [] },
};

export type Source = string;
export type RecipeStep = {
  key: string;
  /** The stage it belongs to: a row of the page, and the name its frame takes. */
  stage: string;
  kind: StepKind;
  /** The plugin that does it: none for Meno's own steps. */
  by?: string;
  options?: OptionValues;
  /** Each input port, and where it is fed from; several sources are several wires into the port. */
  in: Record<string, Source | Source[]>;
  /** What it is for, in a few words: the table's own comment (a step's set is named by what made it; the stage's heading is on the page). */
  note?: string;
};

/** The program steps' options: xTB by the ORCA plugin's native GFN2, as the page of record uses it. */
export const XTB = { method: "NATIVE-XTB2", basis: "", dispersion: "none", wavefunction: false } as const;
const NEB = { method: "NATIVE-XTB2", basis: "", run: "NEB-TS", images: 8, maxiter: 999, keywords: "", maxcore: 0 } as const;
const IRC = { method: "NATIVE-XTB2", basis: "", dispersion: "none", solvation: "none", solvent: "water", keywords: "", maxiter: 256, maxcore: 0 } as const;
const MINIMISE = { field: "MMFF94", steps: 2000, start: "first" } as const;
/** The torsions held again, each round's strength in kcal/mol/rad^2: one value a round. */
export const ROUNDS = ["50", "100", "150"] as const;

const step = (s: RecipeStep): RecipeStep => s;

const STAGES = {
  reaction: "The reaction",
  species: "3D for each species",
  conformers: "Conformers of each species",
  pairs: "Pairs",
  paths: "Paths",
  diagram: "Diagram (xTB)",
  dft: "DFT",
} as const;

/**
 * Words on the page beside a stage's heading: what a chemist opening the template needs to read there. The difference from the program the template
 * is of is said now, in these words (CHEM, 2026-11-11); no equivalence of numbers is claimed.
 */
/**
 * The Conformers steps' own options, set on each card: a step keeps the options it was put down with, so none is left to Settings
 * (kfchem/ConfoTS, template/mm_cs.com and default.ini: one search for each species, what goes on from it within 10 kcal/mol).
 * - the first, a 3D structure of each species: "This many", 200 tries (Meno's own: ConfoTS is given 3D structures);
 * - the search: "As many as the molecule needs", in rounds until one brings no new conformer within 10 kcal/mol, at most 5000 tries
 *   (ConfoTS's window; its up to 10000 search steps are of another kind, no count of these).
 */
export const ONE_OF_EACH = { sought: "fixed", count: 200 } as const;
export const SEARCH = { sought: "needed", within: 10, first: 0, most: 5000 } as const;

export const NOTES: { stage: string; text: string }[] = [
  { stage: STAGES.reaction, text: "Draw your reaction over this one, inside the frame: the set takes what lies in it, and each structure's role from the arrow. The template takes one reactant structure (or reactants drawn as one); a second is not given a side of its own." },
  { stage: STAGES.species, text: "The first Conformers make one 3D structure of each species from 200 tries (ConfoTS is given its 3D structures). The search runs in rounds until one brings no new conformer within 10 kcal/mol, ConfoTS's window for what it keeps, at most 5000 tries (ConfoTS's up to 10000 steps are of another kind: the two counts are not the same). Energies here are the search's force field's, another than ConfoTS's." },
  {
    stage: STAGES.conformers,
    text: "The windows, 10 and 5 kcal/mol, and the limit of 64 are ConfoTS's; they are yours to change. Optimisations have no step limit of their own. An energy exactly at a window's edge is kept here; ConfoTS drops it.",
  },
  {
    stage: `${STAGES.pairs} to the products`,
    text: "Counted per entry: each torsion held in a pass takes that pass's value for its entry. ConfoTS counts each torsion's own failed passes, so a torsion here can be held more strongly than there. The first round's strength, 50, is Meno's own measured one; 100 and 150, three rounds (ConfoTS allows ten) and 2000 minimisation steps (the plugin's default) have no basis of their own: they are yours to change. Ends still wrong after the last round are dropped.",
  },
  { stage: `${STAGES.pairs} to the reactant`, text: "The same rounds, from the products' conformers. Both directions are wired: take the paths of the one you want, or both." },
  {
    stage: STAGES.diagram,
    text: "Each direction keeps up to 16 saddle points of a path (ConfoTS's 16 is for the path); the two together are capped at the lowest 16 of each path. A saddle point found from both directions may appear twice: its two entries are bonded differently, as the product and as the reactant, and Duplicates does not take them as one. The share of the reaction through each path is not in Meno yet. The barriers and the diagram show which path is lower.",
  },
  {
    stage: STAGES.dft,
    text: "The saddle point is optimised from the guess and the two ends of its reaction path (ends optimised in xTB, as they are not in ConfoTS), with the model Hessian: change it to computed if the route asks for force constants. Minima are optimised without ConfoTS's tight convergence, which the Gaussian plugin's Optimise does not offer. No standard-state term; the share of each path is not in Meno yet.",
  },
];

/** What differs between the two directions of the pairs and the paths. */
type Sides = {
  /** The conformers whose geometry is kept: the reactant's (forward) or the products' (backward), and the ID each is given. */
  geometry: Source;
  geometryTag: string;
  /** What those conformers are re-bonded as: the products (forward) or the reactant (backward), and the ID each is given. */
  bonding: Source;
  /** The ID each of the bonding entries is given: a Tag of it, unless the source carries it already (`tagged`). */
  bondingTag: string;
  tagged?: true;
  /** Forward, the product's species is put on each end (matched on the product's ID), so that the path's end can be told to be the one it was made for. */
  target?: Source;
  /** Backward, the product each conformer is of is put on it (matched on its species), so that both directions' saddle points name their path alike. */
  product?: Source;
  /** What names an entry's species, the ends of a path are read against. */
  reference: Source;
  /** The saddle points' property that groups the paths: the product, for both. */
  pathsBy: string;
};

/**
 * The pairs and the paths from one side to the other. Forward, the reactant's conformers are given the products' bonding; backward, the products'
 * conformers the reactant's. The path runs from an end - one side's geometry as the other - to the geometry's own conformer, each end matched to its
 * own conformer on the ID that conformer was given, as the page of record's is: so each saddle point carries its end's properties, among them the
 * product it was made for.
 */
function direction(d: "forward" | "backward", sides: Sides): RecipeStep[] {
  const k = (name: string) => `${d}/${name}`;
  const bond = sides.tagged ? sides.bonding : k("bonding");
  const pairs = `${STAGES.pairs} ${d === "forward" ? "to the products" : "to the reactant"}`;
  const paths = `${STAGES.paths} ${d === "forward" ? "to the products" : "to the reactant"}`;
  // (the conformers as they enter: backward, each given the product it is of)
  const geometryIn = sides.product ? k("geometry-of") : sides.geometry;
  const out: RecipeStep[] = [];
  if (sides.product) {
    out.push(step({ key: k("geometry-of"), stage: pairs, kind: "join", options: { on: "species", carry: "product" }, in: { onto: sides.geometry, from: sides.product }, note: "Each conformer given the product it is of" }));
  }
  out.push(
    step({ key: k("geometry"), stage: pairs, kind: "tag", options: { name: sides.geometryTag }, in: { in: geometryIn } }),
    ...(sides.tagged ? [] : [step({ key: k("bonding"), stage: pairs, kind: "tag" as const, options: { name: sides.bondingTag }, in: { in: sides.bonding } })]),
    step({ key: k("rebonded"), stage: pairs, kind: "rebond", options: { pairs: "each" }, in: { geometry: k("geometry"), bonding: bond }, note: "Ends: one side's conformers with the other's bonding" }),
  );
  if (sides.target) {
    out.push(step({ key: k("ends"), stage: pairs, kind: "join", options: { on: "product", carry: "species as target" }, in: { onto: k("rebonded"), from: sides.target }, note: "Each end given the species of the product it was made for" }));
  }
  const ends = sides.target ? k("ends") : k("rebonded");
  out.push(
    // (each end its own ID, as every end of one product shares the product's and every end of one start the start's: the torsions are held on it)
    step({ key: k("end"), stage: pairs, kind: "tag", options: { name: `end-${d}` }, in: { in: ends }, note: "Each end its own ID" }),
    step({ key: k("held"), stage: pairs, kind: "restraints", options: { on: sides.bondingTag, coordination: true, factor: "0.9", strength: "500" }, in: { in: bond }, note: "Coordination bonds held" }),
  );
  // (the first minimisation, then each round: the torsions that turned from trans across the targets' double bonds held again, every earlier table wired in beside)
  let tables = [k("held")];
  let again = k("end");
  let min = k("min0");
  out.push(step({ key: min, stage: pairs, kind: "minimise", by: "rdkit", options: MINIMISE, in: { in: again, restraints: tables } }));
  ROUNDS.forEach((strength, r) => {
    const check = k(`check${r}`);
    const sorted = k(`sorted${r}`);
    out.push(
      step({ key: check, stage: pairs, kind: "compare-torsions", options: { reference: "property", property: sides.bondingTag }, in: { molecules: min, reference: bond } }),
      step({ key: sorted, stage: pairs, kind: "filter", options: { conditions: "torsions unlike reference = 0", match: "all" }, in: { in: check } }),
    );
    const table = k(`torsions${r + 1}`);
    out.push(
      step({
        key: table,
        stage: pairs,
        kind: "torsion-restraints",
        options: { on: `end-${d}`, torsions: "reference", at: "trans", reference: "property", property: sides.bondingTag, hold: "strength", strength },
        in: { molecules: `${sorted}.rest`, reference: bond },
        note: `Torsions held, round ${r + 1}`,
      }),
    );
    tables = [...tables, table];
    min = k(`min${r + 1}`);
    out.push(step({ key: min, stage: pairs, kind: "minimise", by: "rdkit", options: MINIMISE, in: { in: `${sorted}.rest`, restraints: tables } }));
    again = min;
  });
  const last = k("check3");
  out.push(step({ key: last, stage: pairs, kind: "compare-torsions", options: { reference: "property", property: sides.bondingTag }, in: { molecules: min, reference: bond } }));
  out.push(step({ key: k("sorted3"), stage: pairs, kind: "filter", options: { conditions: "torsions unlike reference = 0", match: "all" }, in: { in: last } }));
  // (the ends whose torsions are right, from every round, together)
  const done = [k("sorted0"), k("sorted1"), k("sorted2"), k("sorted3")];
  out.push(
    step({ key: k("merged1"), stage: pairs, kind: "merge", options: { keep: "all", property: "" }, in: { first: done[0], second: done[1] } }),
    step({ key: k("merged2"), stage: pairs, kind: "merge", options: { keep: "all", property: "" }, in: { first: k("merged1"), second: done[2] } }),
    step({ key: k("merged3"), stage: pairs, kind: "merge", options: { keep: "all", property: "" }, in: { first: k("merged2"), second: done[3] } }),
    step({ key: k("optimised"), stage: pairs, kind: "optimise", by: "orca", options: XTB, in: { in: k("merged3") } }),
    step({
      key: k("ends-ok"),
      stage: pairs,
      kind: "compare-bonding",
      options: { reference: "property", property: sides.bondingTag, rs: true, ez: true, numbered: true },
      in: { molecules: k("optimised"), reference: bond },
      note: "Ends, optimised and checked against the bonding they were given",
    }),
  );
  // (the paths: from each end to its own conformer, matched on the ID the conformer carries; each path is its end's entry, so it carries the end's properties)
  const keep = `path-${d}\nspecies\n${sides.geometryTag}\n${sides.bondingTag}\nproduct`;
  out.push(
    step({ key: k("path"), stage: paths, kind: "path-search", by: "orca", options: { ...NEB, pairs: "property", property: sides.geometryTag }, in: { start: k("ends-ok"), end: k("geometry") }, note: "Paths" }),
    step({ key: k("guesses"), stage: paths, kind: "duplicates", in: { in: k("path") } }),
    step({ key: k("freq"), stage: paths, kind: "frequencies", by: "orca", options: XTB, in: { in: k("guesses") } }),
    step({ key: k("one"), stage: paths, kind: "filter", options: { conditions: "imaginary = 1", match: "all" }, in: { in: k("freq") } }),
    step({ key: k("tag"), stage: paths, kind: "tag", options: { name: `path-${d}` }, in: { in: k("one") } }),
    step({ key: k("irc"), stage: paths, kind: "reaction-path", by: "orca", options: IRC, in: { in: k("tag") } }),
    step({ key: k("first"), stage: paths, kind: "take-frames", options: { which: "first", keep }, in: { in: k("irc") } }),
    step({ key: k("last"), stage: paths, kind: "take-frames", options: { which: "last", keep }, in: { in: k("irc") } }),
    step({ key: k("first-opt"), stage: paths, kind: "optimise", by: "orca", options: XTB, in: { in: k("first") } }),
    step({ key: k("last-opt"), stage: paths, kind: "optimise", by: "orca", options: XTB, in: { in: k("last") } }),
    step({
      key: k("first-end"),
      stage: paths,
      kind: "compare-bonding",
      options: { reference: "each", writes: "first end", from: "species", rs: true, ez: true, numbered: true },
      in: { molecules: k("first-opt"), reference: sides.reference },
    }),
    step({
      key: k("last-end"),
      stage: paths,
      kind: "compare-bonding",
      options: { reference: "each", writes: "last end", from: "species", rs: true, ez: true, numbered: true },
      in: { molecules: k("last-opt"), reference: sides.reference },
    }),
    step({ key: k("with-first"), stage: paths, kind: "join", options: { on: `path-${d}`, carry: "first end" }, in: { onto: k("tag"), from: k("first-end") } }),
    step({ key: k("with-both"), stage: paths, kind: "join", options: { on: `path-${d}`, carry: "last end" }, in: { onto: k("with-first"), from: k("last-end") } }),
  );
  // (a path is right where its ends are the reactant and the product it was made for, in either order: the reaction path's two ways come in no set order.
  //  Each group is then given its ends by their roles, so that both are alike: the reactant's end, and the product's)
  const own = d === "forward" ? "its target" : "its species";
  out.push(
    step({ key: k("valid-a"), stage: paths, kind: "filter", options: { conditions: `first end = species-1\nlast end = ${own}`, match: "all" }, in: { in: k("with-both") }, note: "The first end the reactant, the last the product it was made for" }),
    step({ key: k("valid-b"), stage: paths, kind: "filter", options: { conditions: `last end = species-1\nfirst end = ${own}`, match: "all" }, in: { in: `${k("valid-a")}.rest` }, note: "The last end the reactant, the first the product it was made for" }),
  );
  for (const [g, reactant, product] of [["a", "first end", "last end"], ["b", "last end", "first end"]] as const) {
    out.push(
      step({ key: k(`roled-${g}`), stage: paths, kind: "join", options: { on: `path-${d}`, carry: `${reactant} as reactant end` }, in: { onto: k(`valid-${g}`), from: reactant === "first end" ? k("first-end") : k("last-end") } }),
      step({ key: k(`roles-${g}`), stage: paths, kind: "join", options: { on: `path-${d}`, carry: `${product} as product end` }, in: { onto: k(`roled-${g}`), from: product === "last end" ? k("last-end") : k("first-end") } }),
    );
  }
  out.push(
    step({ key: k("valid"), stage: paths, kind: "merge", options: { keep: "all", property: "" }, in: { first: k("roles-a"), second: k("roles-b") }, note: `Saddle points, ${d === "forward" ? "from the reactant" : "from the products"}, each with its reactant end and its product end` }),
    // (those within 10 kcal/mol of the lowest of their path, at most 16 of each: ConfoTS's window and limit before the higher level)
    step({ key: k("window"), stage: paths, kind: "energy-window", options: { window: 10, within: "each value", groupBy: sides.pathsBy }, in: { in: k("valid") } }),
    step({
      key: k("ranked"),
      stage: paths,
      kind: "rank",
      options: { property: "energy", order: "lowest first", keep: 16, within: "each value", groupBy: sides.pathsBy },
      in: { in: k("window") },
      note: "At most 16 saddle points of each path",
    }),
  );
  return out;
}

/** The DFT level the template starts from, the chemist's to change: the geometry's and the single point's. By convention of the protocol the template follows; no claim of it. */
const DFT_GEOMETRY = { method: "wB97XD", basis: "6-31G(d)", dispersion: "none", solvation: "none", keywords: "", memory: "", wavefunction: false } as const;
const DFT_SINGLE_POINT = { ...DFT_GEOMETRY, basis: "6-311+G(d,p)" } as const;

/**
 * The DFT stage: the saddle points of each direction optimised from the ends the reaction path found, the minima optimised, both with
 * frequencies at that level and checked (one imaginary vibration, and the reacting atoms moving most in it; none for a minimum), a larger single point
 * and the thermal correction summed to a free energy at the higher level, the lowest of each, the populations, the diagram and the barriers.
 * The standard-state term is left off: it cancels in every difference where each species is one system. The share of each path is not in Meno yet.
 */
function dft(): RecipeStep[] {
  const stage = STAGES.dft;
  const sum = { parts: "energy; thermo.g-correction", as: "G-DFT" };
  const r: RecipeStep[] = [
    step({ key: "dft-min", stage, kind: "optimise", by: "gaussian", options: DFT_GEOMETRY, in: { in: "minima-16" } }),
    step({ key: "dft-min-freq", stage, kind: "frequencies", by: "gaussian", options: DFT_GEOMETRY, in: { in: "dft-min" } }),
    step({ key: "dft-min-ok", stage, kind: "filter", options: { conditions: "imaginary = 0", match: "all" }, in: { in: "dft-min-freq" }, note: "No imaginary vibration: a minimum" }),
    step({ key: "dft-min-sp", stage, kind: "energy", by: "gaussian", options: DFT_SINGLE_POINT, in: { in: "dft-min-ok" } }),
    step({ key: "dft-min-g", stage, kind: "add", options: sum, in: { in: "dft-min-sp" }, note: "G at the DFT level: the single point plus the thermal correction" }),
    step({ key: "dft-min-distinct", stage, kind: "duplicates", in: { in: "dft-min-g" } }),
  ];
  // (the capped saddle points back by the direction they were found from: only a forward one carries the forward path's tag)
  r.push(step({ key: "dft-split", stage, kind: "filter", options: { conditions: "path-forward != none", match: "all" }, in: { in: "saddles-16" }, note: "The saddle points found from the reactant, and the rest, from the products" }));
  for (const d of ["forward", "backward"] as const) {
    // (the ends of a reaction path, taken by place: the first where the paths are made from the reactant's conformers, the last where from the
    // products'. Which end the reaction path gives first is not set (the filters above take either order), so this is the reactant's side only
    // where the program keeps the order of the path it was given; QST3 is given both ends either way)
    const [reactantSide, productSide] = d === "forward" ? [`${d}/first-opt`, `${d}/last-opt`] : [`${d}/last-opt`, `${d}/first-opt`];
    const k = (name: string) => `dft-${d}-${name}`;
    r.push(
      step({
        key: k("saddle"),
        stage,
        kind: "saddle-point",
        by: "gaussian",
        options: { method: DFT_GEOMETRY.method, basis: DFT_GEOMETRY.basis, dispersion: DFT_GEOMETRY.dispersion, solvation: DFT_GEOMETRY.solvation, keywords: "", memory: "", hessian: "model", tight: true, pairs: "property", property: `path-${d}` },
        in: { guesses: d === "forward" ? "dft-split" : "dft-split.rest", reactant: reactantSide, product: productSide },
        note: "The saddle point from the guess and the two ends, matched on the path",
      }),
      step({ key: k("freq"), stage, kind: "frequencies", by: "gaussian", options: DFT_GEOMETRY, in: { in: k("saddle") } }),
      step({ key: k("one"), stage, kind: "filter", options: { conditions: "imaginary = 1", match: "all" }, in: { in: k("freq") } }),
      step({ key: k("mode"), stage, kind: "mode-on-atoms", options: { from: "table", which: "made", rows: "", atoms: "", reach: "1" }, in: { in: k("one"), atoms: "mapped.changes" } }),
      step({ key: k("moving"), stage, kind: "filter", options: { conditions: "mode.outside <= 1", match: "all" }, in: { in: k("mode") }, note: "The reacting atoms move most, at most one outside" }),
      step({ key: k("sp"), stage, kind: "energy", by: "gaussian", options: DFT_SINGLE_POINT, in: { in: k("moving") } }),
      step({ key: k("g"), stage, kind: "add", options: sum, in: { in: k("sp") } }),
    );
  }
  r.push(
    step({ key: "dft-saddles", stage, kind: "merge", options: { keep: "all", property: "" }, in: { first: "dft-forward-g", second: "dft-backward-g" } }),
    step({ key: "dft-saddles-distinct", stage, kind: "duplicates", in: { in: "dft-saddles" } }),
    step({ key: "dft-levels", stage, kind: "merge", options: { keep: "all", property: "" }, in: { first: "dft-min-distinct", second: "dft-saddles-distinct" } }),
    step({
      key: "dft-diagram",
      stage,
      kind: "energy-diagram",
      options: { quantity: "G-DFT", levels: "", reference: "species-1", levelsBy: "product\nspecies", joinedBy: "reactant end\nproduct end", conformers: "every" },
      in: { levels: "dft-levels" },
    }),
    step({ key: "dft-lowest", stage, kind: "rank", options: { property: "G-DFT", order: "lowest first", keep: 1, within: "each value", groupBy: "species" }, in: { in: "dft-min-distinct" } }),
    step({ key: "dft-lowest-named", stage, kind: "join", options: { on: "species", carry: "species as reactant end" }, in: { onto: "dft-lowest", from: "dft-lowest" } }),
    step({ key: "dft-barriers", stage, kind: "barrier", options: { energy: "G", free: "G-DFT", symmetry: "as-read", pairs: "property", property: "reactant end" }, in: { saddles: "dft-saddles-distinct", starts: "dft-lowest-named" } }),
  );
  return r;
}

/** The xTB + DFT template's steps: the xTB template's, and the DFT stage after its diagram. */
export function dftRecipe(): RecipeStep[] {
  return [...body(), ...dft()];
}

/** The xTB template's steps, in an order where each step's sources come before it. */
export function xtbRecipe(): RecipeStep[] {
  return body();
}

function body(): RecipeStep[] {
  const r: RecipeStep[] = [
    // The reaction: the structures drawn, by their role
    step({ key: "reactants", stage: STAGES.reaction, kind: "filter", options: { conditions: "role = reactant", match: "all" }, in: { in: "@reaction" }, note: "Reactants" }),
    step({ key: "products", stage: STAGES.reaction, kind: "filter", options: { conditions: "role = product", match: "all" }, in: { in: "@reaction" }, note: "Products" }),
    step({ key: "weighed", stage: STAGES.reaction, kind: "descriptors", by: "rdkit", in: { in: "reactants" } }),
    step({ key: "light", stage: STAGES.reaction, kind: "filter", options: { conditions: "mw <= 512 g/mol", match: "all" }, in: { in: "weighed" } }),
    // 3D for each species: one structure each, every hydrogen there
    step({ key: "reactant-conformers", stage: STAGES.species, kind: "conformers", by: "rdkit", options: ONE_OF_EACH, in: { in: "light" } }),
    step({ key: "reactant-3d", stage: STAGES.species, kind: "rank", options: { property: "energy", order: "lowest first", keep: 1, within: "each group", groupBy: "" }, in: { in: "reactant-conformers" }, note: "Reactant in 3D" }),
    step({ key: "product-conformers", stage: STAGES.species, kind: "conformers", by: "rdkit", options: ONE_OF_EACH, in: { in: "products" } }),
    step({ key: "product-3d", stage: STAGES.species, kind: "rank", options: { property: "energy", order: "lowest first", keep: 1, within: "each group", groupBy: "" }, in: { in: "product-conformers" }, note: "Products in 3D" }),
    step({
      key: "mapped",
      stage: STAGES.species,
      kind: "atom-map",
      options: { reference: "one", property: "", moleculesAre: "each", referenceIs: "together", bonds: "change", maps: "first" },
      in: { molecules: "product-3d", reference: "reactant-3d" },
      note: "Products in the reactant's numbering",
    }),
    // Conformers of each species
    step({ key: "species-set", stage: STAGES.conformers, kind: "merge", options: { keep: "all", property: "" }, in: { first: "reactant-3d", second: "mapped" } }),
    step({ key: "species", stage: STAGES.conformers, kind: "tag", options: { name: "species" }, in: { in: "species-set" }, note: "Each species" }),
    step({ key: "coordination", stage: STAGES.conformers, kind: "restraints", options: { on: "species", coordination: true, factor: "0.9", strength: "500" }, in: { in: "species" } }),
    step({ key: "search", stage: STAGES.conformers, kind: "conformers", by: "rdkit", options: SEARCH, in: { in: "species", restraints: "coordination" } }),
    step({
      key: "numbered",
      stage: STAGES.conformers,
      kind: "atom-map",
      options: { reference: "property", property: "species", moleculesAre: "each", referenceIs: "each", bonds: "same", maps: "first" },
      in: { molecules: "search", reference: "species" },
    }),
    step({ key: "within-10", stage: STAGES.conformers, kind: "energy-window", options: { window: 10 }, in: { in: "numbered" } }),
    step({ key: "optimised", stage: STAGES.conformers, kind: "optimise", by: "orca", options: XTB, in: { in: "within-10" } }),
    step({ key: "distinct", stage: STAGES.conformers, kind: "duplicates", in: { in: "optimised" } }),
    step({
      key: "bonded",
      stage: STAGES.conformers,
      kind: "compare-bonding",
      options: { reference: "property", property: "species", rs: false, ez: false },
      in: { molecules: "distinct", reference: "species" },
    }),
    step({ key: "within-5", stage: STAGES.conformers, kind: "energy-window", options: { window: 5 }, in: { in: "bonded" } }),
    step({ key: "most-64", stage: STAGES.conformers, kind: "rank", options: { property: "energy", order: "lowest first", keep: 64, within: "each group", groupBy: "" }, in: { in: "within-5" } }),
    step({ key: "sides", stage: STAGES.conformers, kind: "filter", options: { conditions: "species = species-1", match: "all" }, in: { in: "most-64" }, note: "Reactant conformers" }),
    // (the species by their IDs, apart: the reactant, and the products each given the ID of the path to it)
    step({ key: "reactant-species", stage: STAGES.conformers, kind: "filter", options: { conditions: "species = species-1", match: "all" }, in: { in: "species" }, note: "The reactant, with its species ID" }),
    step({ key: "product-species", stage: STAGES.conformers, kind: "tag", options: { name: "product" }, in: { in: "reactant-species.rest" }, note: "The products, each with its species ID and its own product ID" }),
    ...direction("forward", { geometry: "sides", geometryTag: "start", bonding: "product-species", bondingTag: "product", tagged: true, target: "product-species", reference: "species", pathsBy: "product" }),
    ...direction("backward", { geometry: "sides.rest", geometryTag: "pc", bonding: "reactant-species", bondingTag: "reactant", product: "product-species", reference: "species", pathsBy: "product" }),
    // The diagram at the xTB level
    step({ key: "saddles", stage: STAGES.diagram, kind: "merge", options: { keep: "all", property: "" }, in: { first: "forward/ranked", second: "backward/ranked" }, note: "Validated saddle points of both directions" }),
    // (ConfoTS's 16 is for the path: the two directions together are capped at the lowest 16 of each path)
    step({ key: "saddles-16", stage: STAGES.diagram, kind: "rank", options: { property: "energy", order: "lowest first", keep: 16, within: "each value", groupBy: "product" }, in: { in: "saddles" }, note: "At most 16 saddle points of each path, from both directions" }),
    step({ key: "minima-5", stage: STAGES.diagram, kind: "energy-window", options: { window: 5 }, in: { in: "bonded" } }),
    step({ key: "minima-16", stage: STAGES.diagram, kind: "rank", options: { property: "energy", order: "lowest first", keep: 16, within: "each group", groupBy: "" }, in: { in: "minima-5" } }),
    step({ key: "minima-freq", stage: STAGES.diagram, kind: "frequencies", by: "orca", options: XTB, in: { in: "minima-16" } }),
    step({ key: "levels", stage: STAGES.diagram, kind: "merge", options: { keep: "all", property: "" }, in: { first: "minima-freq", second: "saddles-16" }, note: "Minima and saddle points" }),
    step({
      key: "diagram",
      stage: STAGES.diagram,
      kind: "energy-diagram",
      options: { quantity: "thermo.free-energy", levels: "", reference: "species-1", levelsBy: "product\nspecies", joinedBy: "reactant end\nproduct end", conformers: "every" },
      in: { levels: "levels" },
      note: "Energy diagram",
    }),
    step({ key: "lowest", stage: STAGES.diagram, kind: "rank", options: { property: "thermo.free-energy", order: "lowest first", keep: 1, within: "each value", groupBy: "species" }, in: { in: "minima-freq" } }),
    // (each saddle point less the lowest conformer of the reactant it was made from: matched on its reactant end, the reactant's name - put on each
    // lowest conformer as its own species - so that a saddle point is never set against a product, nor every species' lowest)
    step({ key: "lowest-named", stage: STAGES.diagram, kind: "join", options: { on: "species", carry: "species as reactant end" }, in: { onto: "lowest", from: "lowest" }, note: "Each lowest conformer named as a reactant end" }),
    step({ key: "barriers", stage: STAGES.diagram, kind: "barrier", options: { energy: "G", free: "thermo.free-energy", symmetry: "as-read", pairs: "property", property: "reactant end" }, in: { saddles: "saddles-16", starts: "lowest-named" }, note: "Barriers: each saddle point above the reactant's lowest conformer" }),
  ];
  return r;
}
