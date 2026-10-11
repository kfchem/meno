/**
 * Every kind of file Meno takes in, and the one place that says what a
 * file is (docs/FILE-IO.md). Open, a drop and pasted text all ask here,
 * once; what reads the file then is the kind's - Meno itself, or the
 * readers (lib/calc).
 *
 * Meno knows its own kinds only: its workspace and records, the structure
 * files, and the cube, which it reads itself. It knows no program. Every
 * kind of a program's output is brought by the plugins that read it, in
 * their manifests (lib/plugins/manifest), and registered while a plugin
 * that brings it is added - told by marks, text, never a pattern. A mark
 * that would claim one of Meno's own sample files is refused, so that no
 * plugin takes a molfile for its own.
 *
 * A file is told by what it holds, the strongest evidence first:
 * 1. Meno's own records - a workspace, a structure's record;
 * 2. a program's banner - the one that comes first in the file, where it
 *    holds more than one (an output quoting another program's);
 * 3. an RXN file's or a molfile's markers;
 * 4. a PDB file's records;
 * 5. a cube's layout;
 * 6. an XYZ file's layout.
 * Its name decides only where what it holds does not - a molfile Meno
 * cannot make out is still a molfile, and says why it cannot be read - and
 * a kind its plugin tells, asked (`probe`), is asked about last.
 */
import { create } from "zustand";
import { CUBE_MARK } from "../calc/cube";
import { recordName, RECORD_NAMES } from "../chem/pdb";
import { folded, holdsMark, markAt, type GrammarDecl, type KindDecl, type Manifest, type Mark } from "../plugins/manifest";
import sampleSdf from "../../samples/cholesterol.sdf?raw";
import sampleXyz from "../../samples/cholesterol.xyz?raw";
import sampleRxn from "../../samples/diels-alder.rxn?raw";
import samplePdb from "../../samples/cholesterol.pdb?raw";

/** How much of a file's start is looked at to tell what it is. */
export const MARK_REACH = 64 * 1024;

/** A kind of file: what it is called, the names its files go by, how one is told, and - a calculation's output - its program. */
export type Kind = {
  id: string;
  /** What it is called, in Settings and in messages: "MOL file". */
  name: string;
  /** The file names it goes by, lower case, with their dot. */
  extensions: readonly string[];
  /** A calculation's output, read by the readers (lib/calc): the program that writes it, as a molecule read from it names it, where it is one program's. Unset for a kind Meno reads on the page. */
  output?: { program?: string };
  /** What the start of such a file says - a program's banner - one of them at least. */
  marks?: readonly Mark[];
  /** How such a file is laid out: Meno's own kinds only, a pattern being Meno's to trust. */
  layout?: RegExp;
  /** Told by a plugin that reads it, asked, where nothing else tells it. */
  probe?: true;
  /** How a text of it is coloured: the first of its plugins' grammars, and whose it is (lib/text/colouring). */
  grammar?: PluginGrammar;
  /** A kind only a plugin's catalogue names: the plugins it suggests to read it, by id - none of them added (lib/plugins/guide). */
  suggest?: readonly string[];
};

/** A plugin's grammar, and the plugin whose folder holds it. */
export type PluginGrammar = { plugin: string; decl: GrammarDecl };

/**
 * A kind of text a plugin knows by its files' names - one it writes, or an
 * input to its program written by hand - coloured by its grammar: told by
 * its name, and, where it says, by what one of its first lines begins with
 * (the manifest's `lines`, each a mark at a line's start).
 */
export type TextKind = { id: string; extensions: readonly string[]; marks: readonly Mark[]; grammar: PluginGrammar };

/** The kinds Meno knows: its own. Each but the cube read on the page; the cube, which programs of every kind write, by Meno under the readers' contract. */
export const MENO_KINDS = {
  workspace: { id: "meno-workspace", name: "Meno workspace", extensions: [".meno"] },
  record: { id: "meno-record", name: "Meno structure", extensions: [] },
  rxn: { id: "rxn", name: "RXN file", extensions: [".rxn"] },
  mol: { id: "mol", name: "MOL file", extensions: [".mol"] },
  sdf: { id: "sdf", name: "SD file", extensions: [".sdf"] },
  xyz: { id: "xyz", name: "XYZ file", extensions: [".xyz"] },
  pdb: { id: "pdb", name: "PDB file", extensions: [".pdb"] },
  cube: { id: "cube", name: "Cube file", extensions: [".cube", ".cub"], output: {}, layout: CUBE_MARK },
} as const satisfies Record<string, Kind>;

/** The kinds Meno writes itself: the workspace by Save, the rest by Export (Workspace/fileActions). */
export const MENO_WRITES: readonly string[] = [MENO_KINDS.workspace.id, MENO_KINDS.mol.id, MENO_KINDS.sdf.id, MENO_KINDS.rxn.id, MENO_KINDS.pdb.id];

/** Files of Meno's own kinds a plugin's marks are tried on: a mark one of them holds is not the plugin's to claim. */
const MENO_SAMPLES: readonly string[] = [
  sampleSdf,
  sampleXyz,
  sampleRxn,
  samplePdb,
  '{"format":"meno-workspace","version":1,"atoms":[],"bonds":[],"arrows":[],"pluses":[],"molecules3d":[]}',
  '{"format":"meno-structure","version":1,"atoms":[],"bonds":[]}',
];

/** A mark refused, and why: the plugin, the kind, the mark, and the kind of Meno's it would have claimed. */
export type Refused = { plugin: string; kind: string; mark: string };

/**
 * The kinds of Meno's and those `manifests` bring: a kind two plugins bring,
 * by one id, is one kind - the first's name, their marks and file names put
 * together - and a plugin's kind of the id of one of Meno's is Meno's. Marks
 * that would claim one of Meno's samples are refused, and said; a kind left
 * with no way to be told is left out.
 */
export function registered(manifests: readonly Manifest[]): { kinds: Kind[]; refused: Refused[]; texts: TextKind[]; catalogued: Kind[] } {
  const samples = MENO_SAMPLES.map(headOf);
  const refused: Refused[] = [];
  const brought = new Map<string, Kind>();
  const own = new Set(Object.values(MENO_KINDS).map((k) => k.id as string));
  for (const m of manifests) {
    // (the kinds it reads: one it only colours or writes is no file Meno takes in by it)
    for (const k of m.kinds.filter((k) => m.reads.includes(k.id))) {
      if (own.has(k.id)) continue;
      const marks = k.marks.filter((mark) => {
        const claims = samples.some((s) => holdsMark(s, mark));
        if (claims) refused.push({ plugin: m.id, kind: k.id, mark: mark.text });
        return !claims;
      });
      if (!marks.length && !k.probe) continue;
      const was = brought.get(k.id);
      brought.set(
        k.id,
        was
          ? {
              ...was,
              extensions: [...new Set([...was.extensions, ...k.extensions])],
              marks: [...(was.marks ?? []), ...marks.filter((x) => !was.marks?.some((y) => y.text === x.text && y.at === x.at))],
              ...(k.probe || was.probe ? { probe: true as const } : {}),
              // (coloured by the first's grammar that has one)
              ...(was.grammar ? { grammar: was.grammar } : k.grammar ? { grammar: { plugin: m.id, decl: k.grammar } } : {}),
            }
          : kindFrom(k, marks, m.id),
      );
    }
  }
  // (the kinds it knows but does not read - those it writes, inputs to its program written by hand - as texts it colours)
  const texts = manifests.flatMap((m) =>
    m.kinds.flatMap((k): TextKind[] =>
      !m.reads.includes(k.id) && k.grammar && k.extensions.length
        ? [{ id: k.id, extensions: k.extensions, marks: k.lines.map((line) => ({ text: line, at: "line-start" as const })), grammar: { plugin: m.id, decl: k.grammar } }]
        : [],
    ),
  );
  // (the kinds of file catalogues name, told by their own marks - those that would claim Meno's own files refused, as a plugin's are)
  const catalogued = new Map<string, Kind>();
  for (const m of manifests) {
    for (const f of m.files) {
      if (own.has(f.id)) continue;
      const marks = f.marks.filter((mark) => {
        const claims = samples.some((s) => holdsMark(s, mark));
        if (claims) refused.push({ plugin: m.id, kind: f.id, mark: mark.text });
        return !claims;
      });
      if (!marks.length) continue;
      const was = catalogued.get(f.id);
      catalogued.set(f.id, {
        id: f.id,
        name: was?.name ?? f.name,
        extensions: [...new Set([...(was?.extensions ?? []), ...f.extensions])],
        output: {},
        marks: [...(was?.marks ?? []), ...marks],
        suggest: [...new Set([...(was?.suggest ?? []), ...f.suggest])],
      });
    }
  }
  return { kinds: [...Object.values(MENO_KINDS), ...brought.values()], refused, texts, catalogued: [...catalogued.values()] };
}

const kindFrom = (k: KindDecl, marks: Mark[], plugin: string): Kind => ({
  id: k.id,
  name: k.name,
  extensions: k.extensions,
  output: k.program ? { program: k.program } : {},
  ...(marks.length ? { marks } : {}),
  ...(k.probe ? { probe: true as const } : {}),
  ...(k.grammar ? { grammar: { plugin, decl: k.grammar } } : {}),
});

/** A file's start as marks are tried on it: its first `MARK_REACH` characters, line ends "\n", runs of spaces one. */
export function headOf(text: string): string {
  return folded(text.slice(0, MARK_REACH).replace(/\r\n?/g, "\n"));
}

/**
 * The kinds registered: Meno's own, and those the plugins added bring
 * (lib/calc/workers registers them as plugins are added and taken away) -
 * and those the catalogues of the plugins added name, each with the
 * plugins it suggests to read it.
 */
export const useKinds = create<{ kinds: readonly Kind[]; texts: readonly TextKind[]; catalogued: readonly Kind[] }>(() => ({
  kinds: registered([]).kinds,
  texts: [],
  catalogued: [],
}));

/** Registers the kinds `manifests` - the plugins added - bring and name, with Meno's own, in place of those registered before. */
export function registerKinds(manifests: readonly Manifest[]): void {
  const { kinds, texts, catalogued } = registered(manifests);
  useKinds.setState({ kinds, texts, catalogued });
}

/** The kinds only the catalogues of the plugins added name: what a file no plugin added reads is told as, to suggest a plugin that would. */
export function cataloguedKinds(): readonly Kind[] {
  return useKinds.getState().catalogued;
}

/** Every kind registered. */
export function kinds(): readonly Kind[] {
  return useKinds.getState().kinds;
}

/** The kinds of text the plugins added know by their files' names. */
export function textKinds(): readonly TextKind[] {
  return useKinds.getState().texts;
}

/** The kind of that id, among those registered or `among`. */
export function kindById(id: string, among: readonly Kind[] = kinds()): Kind | undefined {
  return among.find((k) => k.id === id);
}

/** What a file is, from what it holds and then its name, among the kinds registered or `among`; null where neither says - text, say, a kind no plugin added brings, or one only its plugin tells (`probeCandidates`). */
export function kindOf(name: string, text: string, among: readonly Kind[] = kinds()): Kind | null {
  const raw = text.slice(0, MARK_REACH).replace(/\r\n?/g, "\n");
  const head = folded(raw);
  const ext = extensionOf(name);
  // 1. Meno's own records, which are JSON, and say what they are
  if (/^\s*\{/.test(raw)) {
    const said = /"format"\s*:\s*"(meno-workspace|meno-structure)"/.exec(raw)?.[1];
    if (said === "meno-workspace") return MENO_KINDS.workspace;
    if (said === "meno-structure") return MENO_KINDS.record;
  }
  // 2. a program's banner: the first in the file
  let banner: { kind: Kind; at: number } | null = null;
  for (const kind of among) {
    for (const mark of kind.marks ?? []) {
      const at = markAt(head, mark);
      if (at >= 0 && (!banner || at < banner.at)) banner = { kind, at };
    }
  }
  if (banner) return banner.kind;
  // 3. an RXN file's or a molfile's markers
  if (/^\s*\$RXN\b/m.test(raw)) return MENO_KINDS.rxn;
  if (/\b(V2000|V3000)\b/.test(raw) || /^\s*M {2}END\s*$/m.test(raw)) return ext === ".sdf" ? MENO_KINDS.sdf : MENO_KINDS.mol;
  // 4. a PDB file's records
  if (looksLikePdb(raw)) return MENO_KINDS.pdb;
  // 5. a cube's layout
  const layout = among.find((k) => k.layout?.test(raw));
  if (layout) return layout;
  // 6. an XYZ file's layout
  if (looksLikeXyz(raw)) return MENO_KINDS.xyz;
  // its name, where what it holds says nothing - of Meno's own kinds, whose names their files keep
  return Object.values(MENO_KINDS).find((k) => (k.extensions as readonly string[]).includes(ext)) ?? null;
}

/** The kinds a plugin could tell a file to be, asked: those told by asking, whose files go by its name's extension. */
export function probeCandidates(name: string, among: readonly Kind[] = kinds()): Kind[] {
  const ext = extensionOf(name);
  return ext ? among.filter((k) => k.probe && k.extensions.includes(ext)) : [];
}

/** A file name's extension, lower case, with its dot; "" where it has none. */
export function extensionOf(name: string): string {
  const m = /\.[^./\\]+$/.exec(name);
  return m ? m[0].toLowerCase() : "";
}

const XYZ_NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
// line 3, the first atom: "<symbol or atomic number> <x> <y> <z>"
const XYZ_ATOM_LINE = new RegExp(String.raw`^\s*(?:[A-Za-z]{1,3}|\d{1,3})\s+${XYZ_NUM}\s+${XYZ_NUM}\s+${XYZ_NUM}\b`);

/** Whether text is laid out as an XYZ file: an atom count alone on its first line, and its first atom on its third. */
function looksLikeXyz(text: string): boolean {
  const lines = text.replace(/^\s*\n/, "").split("\n");
  const first = lines[0] ?? "";
  if (!/^\s*\d+\s*$/.test(first)) return false;
  if (Number.parseInt(first, 10) === 0) return true;
  return XYZ_ATOM_LINE.test(lines[2] ?? "");
}

/**
 * Whether text is laid out as a PDB file: its first line begins with one of
 * the format's record names, and an atom's record - ATOM or HETATM - has
 * its coordinates where the format puts them, columns 31 to 54.
 */
function looksLikePdb(text: string): boolean {
  const lines = text.split("\n");
  const first = lines.find((l) => l.trim());
  if (!first || !RECORD_NAMES.has(recordName(first))) return false;
  const real = (s: string) => /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(s);
  return lines.some((l) => {
    const name = recordName(l);
    return (name === "ATOM" || name === "HETATM") && real(l.substring(30, 38)) && real(l.substring(38, 46)) && real(l.substring(46, 54));
  });
}
