/**
 * Who writes each kind Export offers (docs/FILE-IO.md, *The contract for
 * files*): Meno's own writers - MOL, SD and RXN files and SVG pictures,
 * given the page - and those of the plugins added, each given one molecule
 * (one system of molecules in 3D) as Meno's plain data (`WrittenMolecule`),
 * and giving back the file's text. Each says what it is called, the names
 * its files go by and the options it takes, in the general form
 * (lib/options) - drawn before the file's name is asked for, the chemist's
 * last choices remembered, but for those that start from what is written
 * (`knownOf`). Save writes the workspace, and takes none.
 */
import { ELEMENTS } from "../chem/elements";
import type { Radical } from "../chem/molecule";
import type { Known, Option } from "../options";
import type { WriteDecl } from "../plugins/manifest";

/** One of a writer's options, and what on the page it is about - the drawing, or the molecules in 3D - where it is about one only: shown only where the page holds that. */
export type WriterOption = Option & { about?: "drawing" | "molecules3d" };

/** A kind written, as Export offers it. */
export type Writer = {
  /** The kind it writes, known by it. */
  id: string;
  /** What it is called, in Export. */
  name: string;
  /** The names its files go by, with their dot: the first is the one Export gives. */
  extensions: readonly string[];
  /** What it is given: the page - its drawing and molecules in 3D - or one molecule, one system of molecules in 3D. */
  takes: "page" | "molecule";
  options: readonly WriterOption[];
  /** Who writes it: "meno", or the plugin, by its id. */
  by: string;
};

/** Which CTfile version a structure is written in: the drawing's - and, in an SD file, its records in 3D too; elsewhere molecules in 3D are written in V2000, or in V3000 where V2000 cannot hold them (lib/chem/molWriter `writeMolfile3d`). */
const VERSION: WriterOption = {
  about: "drawing",
  id: "version",
  label: "Version",
  type: "choice",
  choices: [
    { value: "auto", label: "V2000, or V3000 where V2000 cannot hold it" },
    { value: "V3000", label: "V3000" },
  ],
  default: "auto",
};

/** Meno's own writers: given the page, run on it (fileActions). */
export const WRITERS = {
  mol: { id: "mol", name: "MOL file", extensions: [".mol"], takes: "page", by: "meno", options: [VERSION] },
  sdf: {
    id: "sdf",
    name: "SD file",
    extensions: [".sdf"],
    takes: "page",
    by: "meno",
    options: [
      // (an SD file's records in 3D are written in it too: shown where the page holds molecules in 3D alone)
      { ...VERSION, about: undefined },
      {
        id: "frames",
        about: "molecules3d",
        label: "Molecules in 3D",
        type: "choice",
        choices: [
          { value: "shown", label: "The frame shown" },
          { value: "all", label: "Every frame, a record each" },
        ],
        default: "shown",
      },
    ],
  },
  rxn: { id: "rxn", name: "RXN file", extensions: [".rxn"], takes: "page", by: "meno", options: [VERSION] },
  // (molecules in 3D only: the format holds no drawing)
  pdb: {
    id: "pdb",
    name: "PDB file",
    extensions: [".pdb"],
    takes: "page",
    by: "meno",
    options: [
      {
        id: "frames",
        about: "molecules3d",
        label: "Molecules in 3D",
        type: "choice",
        choices: [
          { value: "shown", label: "The frame shown" },
          { value: "all", label: "Every frame, a model each" },
        ],
        default: "shown",
      },
    ],
  },
  // (molecules in 3D only: the format holds no drawing, and no bonds)
  xyz: {
    id: "xyz",
    name: "XYZ file",
    extensions: [".xyz"],
    takes: "page",
    by: "meno",
    options: [
      {
        id: "frames",
        about: "molecules3d",
        label: "Molecules in 3D",
        type: "choice",
        choices: [
          { value: "shown", label: "The frame shown" },
          { value: "all", label: "Every frame, a block each" },
        ],
        default: "shown",
      },
    ],
  },
  svg: { id: "svg", name: "SVG picture", extensions: [".svg"], takes: "page", by: "meno", options: [] },
} as const satisfies Record<string, Writer>;

/** A kind Meno writes itself. */
export type WriterId = keyof typeof WRITERS;

/** The writers of plugins - those added, say - each kind they write a writer, given one molecule (lib/plugins/manifest `WriteDecl`). */
export function pluginWriters(plugins: readonly { id: string; writes: readonly WriteDecl[] }[]): Writer[] {
  return plugins.flatMap((p) => p.writes.map((w) => ({ id: w.id, name: w.name, extensions: w.extensions, takes: "molecule" as const, options: w.options, by: p.id })));
}

/** A writer's files' extension, without its dot: the one Export gives. */
export const extensionOf = (w: Writer): string => w.extensions[0].slice(1);

/** A writer's options that are about what the page holds: those about its drawing where it has one, about its molecules in 3D where it has any, and the rest. */
export function optionsFor(writer: Writer, holds: { drawing: boolean; molecules3d: boolean }): WriterOption[] {
  return writer.options.filter((o) => !o.about || holds[o.about]);
}

/** The role a writer's options are remembered under (lib/settings/appSettings `options`). */
export const writeRole = (id: string) => `write:${id}`;
/** The role Export's last kind is remembered under. */
export const EXPORT_ROLE = "export";

/** An atom as a writer is given it: its element, where it is in ångströms, and what it carries. */
export type WrittenAtom = { el: string; x: number; y: number; z: number; charge?: number; isotope?: number; radical?: Radical };
/**
 * A molecule as a writer is given it (the contract's `write`): Meno's plain
 * data - its atoms, its bonds between them by index with their orders, and
 * its name - whoever writes it.
 */
/** A molecule a writer is given. `skeleton`: its hydrogens not there (lib/chem/skeleton) - it has no charge or spin to give. */
export type WrittenMolecule = { name?: string; atoms: WrittenAtom[]; bonds: { a1: number; a2: number; order: number }[]; skeleton?: boolean };

const NUMBERS = new Map(ELEMENTS.map((e) => [e.symbol, e.number]));
const UNPAIRED: Record<Radical, number> = { singlet: 0, doublet: 1, triplet: 2 };

/**
 * What Meno knows of a molecule written, which a writer's options may
 * start from (lib/options `Known`): its charge, its atoms' charges summed;
 * its spin multiplicity, one more than its unpaired electrons - its
 * radicals', and one more where its electrons are odd without them; and
 * its name.
 */
export function knownOf(m: WrittenMolecule): Record<Known, string | number> {
  const charge = m.atoms.reduce((n, a) => n + (a.charge ?? 0), 0);
  return { charge, multiplicity: multiplicityOf(m, charge), name: m.name ?? "" };
}

/** The multiplicity a molecule's atoms say at a charge: one more than its radicals' unpaired electrons, and one more again where its electrons, at that charge, are odd without them. */
function multiplicityOf(m: Pick<WrittenMolecule, "atoms">, charge: number): number {
  const electrons = m.atoms.reduce((n, a) => n + (NUMBERS.get(a.el) ?? 0), 0) - charge;
  let unpaired = m.atoms.reduce((n, a) => n + (a.radical ? UNPAIRED[a.radical] : 0), 0);
  if ((electrons - unpaired) % 2 !== 0) unpaired += 1;
  return unpaired + 1;
}

/**
 * Why a charge and multiplicity cannot be a molecule's, or null where they
 * can: its electrons are its atoms' atomic numbers less the charge, and a
 * multiplicity of m has m - 1 of them unpaired - so the rest, paired, are an
 * even number, and there are no fewer electrons than unpaired ones. (An even
 * count of electrons takes an odd multiplicity - singlet, triplet - and an
 * odd count an even one - doublet, quartet.)
 */
export function speciesProblem(m: Pick<WrittenMolecule, "atoms">, charge: number, multiplicity: number): string | null {
  const electrons = m.atoms.reduce((n, a) => n + (NUMBERS.get(a.el) ?? 0), 0) - charge;
  if (!Number.isInteger(charge)) return `A charge of ${charge} is not a whole number.`;
  if (!Number.isInteger(multiplicity) || multiplicity < 1) return `A multiplicity of ${multiplicity} is not a whole number of one or more.`;
  if (electrons < 0) return `A charge of ${charge} leaves fewer than no electrons.`;
  if (multiplicity - 1 > electrons) return `${electrons} electrons cannot have ${multiplicity - 1} unpaired (multiplicity ${multiplicity}).`;
  if ((electrons - (multiplicity - 1)) % 2 !== 0)
    return `${electrons} electrons cannot have multiplicity ${multiplicity}: an ${electrons % 2 ? "odd" : "even"} count takes an ${electrons % 2 ? "even" : "odd"} multiplicity.`;
  return null;
}

/** A molecule's charge and spin multiplicity, and where each came from: given (by the chemist, or the calculation it was read from), or its atoms. */
export type Species = { charge: number; multiplicity: number; from: { charge: "given" | "atoms"; multiplicity: "given" | "atoms" } };

/**
 * A molecule's charge and spin multiplicity by Meno's one rule
 * (docs/WORKFLOWS-FOUNDATION.md, *The entry*): what it was given, where it
 * was given one - a whole charge, a multiplicity of one or more - else what
 * its atoms say (`knownOf`). None for a skeleton: its hydrogens not there,
 * its atoms do not say how it is protonated, and so neither its charge nor
 * its spin (lib/chem/skeleton). Every place that tells a program, a writer
 * or a step a molecule's charge and spin asks here.
 */
export function speciesOf(m: WrittenMolecule, given?: { charge?: number | null; multiplicity?: number | null }): Species | null {
  if (m.skeleton) return null;
  const known = knownOf(m);
  const charge = Number.isInteger(given?.charge) ? given!.charge! : null;
  const multiplicity = Number.isInteger(given?.multiplicity) && given!.multiplicity! > 0 ? given!.multiplicity! : null;
  // (a multiplicity not given follows the charge in use: a charge given that is not the atoms' changes the electrons - Na with a charge of +1 has ten, a singlet)
  return {
    charge: charge ?? Number(known.charge),
    multiplicity: multiplicity ?? (charge != null ? multiplicityOf(m, charge) : Number(known.multiplicity)),
    from: { charge: charge != null ? "given" : "atoms", multiplicity: multiplicity != null ? "given" : "atoms" },
  };
}
