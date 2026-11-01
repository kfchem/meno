/**
 * Asking the worker of a plugin that fills the chemistry roles (lib/plugins/
 * roles; RDKit's, for now: resources/plugins/rdkit/worker.py): one JSON
 * object a line each way, answers matched to questions by id. The worker
 * answers a fixed set of requests - these, the roles' contract - and runs
 * nothing else. Molecules go to it, and come back, as MOL blocks.
 *
 * The transport is handed in, so that the client knows nothing of how the
 * worker runs (a sidecar, here; anything that carries lines, in tests).
 */
import type { OptionValues } from "../options";
import type { SmilesRead } from "../chem/smilesWhy";
import { counter, type Watch } from "../calc/client";

/** The requests the worker answers, and what each answers with. */
export type ChemRequests = {
  to_smiles: { args: { molblock: string }; result: { smiles: string } };
  /** A reaction, as an RXN file holds it, as a reaction SMILES: "reactants>agents>products". */
  rxn_to_smiles: { args: { rxnblock: string }; result: { smiles: string } };
  from_smiles: { args: { smiles: string }; result: { molblock: string } };
  /** What the toolkit makes of a SMILES, as facts - whether it reads, whether it parses at all, the problems its own check finds (lib/chem/smilesWhy): Meno says why in words. */
  smiles_read: { args: { smiles: string }; result: SmilesRead };
  /** Hydrogens, valence, aromaticity and stereo labels, per atom and bond. */
  analyse: { args: { molblock: string }; result: Analysis };
  /**
   * The stereocentres and double bonds left open, by index, and how many
   * stereoisomers they make - but for those `like` gives a configuration.
   */
  open_stereo: { args: { molblock: string; like?: Like }; result: OpenStereo };
  /** Only which stereocentres and double bonds are left open, by index - none of `open_stereo`'s trying each stereoisomer in 3D. */
  stereo_left_open: { args: { molblock: string }; result: { atoms: number[]; bonds: number[]; cumulated?: number[][] } };
  /**
   * Which stereoisomer each molecule in 3D is, read from its own geometry:
   * its elements that could be stereogenic and a key that two molecules
   * share exactly when they are one stereoisomer - or, for one it could not
   * read, why (lib/entry `EntryStereo`).
   */
  configurations: { args: { molblocks: string[] }; result: { molecules: Configured[] } };
  /**
   * Conformers of a structure, made in 3D (ETKDG, then MMFF94): of the first
   * of its stereoisomers, or of each, where some of its stereo is left open
   * - and `like` does not give it. Of two enantiomers, one is made as the
   * other's mirror image.
   */
  conformers: {
    /**
     * `options`: those the plugin declares for the role (its manifest's
     * roleOptions), as chosen in Settings. `onPage`: made for Meno's own page
     * (each conformer once, laid over the first, alike atoms in like places -
     * docs/PLUGINS.md), sent by the page alone, never by a workflow's step.
     */
    args: { molblock: string; isomers?: "one" | "all"; count?: number; like?: Like; options?: OptionValues; onPage?: true };
    result: { isomers: Conformers[] };
  };
  /**
   * A molecule in 3D as a formula to draw: its heavy atoms in their order,
   * laid out in 2D and wedged as it is in 3D; its bonds' orders found where
   * they are not known (`perceive`) - and whether they were (`perceived`):
   * never without hydrogens, which they are found by.
   */
  drawing_of: { args: { molblock: string; perceive?: boolean }; result: { molblock: string; perceived?: boolean } };
  /**
   * A molecule in 3D whose file gives no bond orders given them from a
   * SMILES of the same molecule (RDKit's AssignBondOrdersFromTemplate): its
   * atoms in their order, its bonds' orders and charges the SMILES's.
   */
  orders_from_smiles: { args: { molblock: string; smiles: string }; result: { molblock: string } };
  /**
   * A picture - a PNG or a JPEG, in base64 - read as the structure drawn in
   * it (docs/PDF.md, *Stage 5*): see `PictureRead`.
   */
  read_picture: { args: { picture: string }; result: PictureRead };
  /** A molecule in 3D, its bond orders known, given the hydrogens its file leaves out (RDKit's AddHs, placed by geometry): its atoms in their order, the hydrogens after. */
  add_hydrogens: { args: { molblock: string; hydrogens?: number[] }; result: { molblock: string } };
};

/**
 * The structure drawn in a picture, as the plugin that reads pictures reads
 * it - its model's reading, as the model gives it: its atoms' places, as
 * the model gives them, across the picture as it cropped it - `pad`, the
 * white it keeps round what is drawn, in pixels - or across the structure
 * itself; each atom an element, with its charge and, where the model gives
 * one, its isotope's mass number, or a label as it is drawn (a group's:
 * OTBS) - neither, where the model gives no symbol; its bonds, by index -
 * a wedge or a hash saying which end lies nearer (`up`, `b` nearer than
 * `a`; `down`, farther), which is all a model tells; and the model's
 * confidence in each, from 0 to 1, where it gives one. No structure found:
 * no atoms. Meno lays it on the picture (lib/figure/inkFit).
 */
export type PictureRead = {
  atoms: { x: number; y: number; el?: string; charge?: number; isotope?: number; label?: string; confidence?: number }[];
  bonds: { a: number; b: number; order: 1 | 2 | 3; aromatic?: true; stereo?: "up" | "down"; confidence?: number }[];
  pad?: number;
};

/**
 * What a structure leaves open: its stereocentres and double bonds by
 * index; how many stereoisomers they make that can be made in 3D (a
 * bridgehead left open gives only the one its rings allow); of the double
 * bonds, those that are cumulated (an allene's axis, whose stereoisomers are
 * not counted); and whether none of its stereoisomers embeds with its
 * stereo held - made then as the embedding places it.
 */
export type OpenStereo = { atoms: number[]; bonds: number[]; isomers: number; cumulenes?: number[]; cumulated?: number[][]; free?: boolean };

/** One molecule's configuration, as the plugin answers it: its elements and key, or why it has none. */
export type Configured = { elements: { kind: "centre" | "double" | "axis" | "cumulene" | "other"; atoms: number[]; specified: boolean }[]; key: string } | { error: string };

/**
 * Some of a block's atoms, by index, where a molecule in 3D made from it
 * before has them: a stereocentre or double bond the block leaves open is
 * made as it is there, where it and the atoms bonded to it all have a place.
 */
export type Like = Record<number, [number, number, number]>;

/**
 * One stereoisomer's conformers: its atoms - those of the block in their
 * order, then the hydrogens made for them - its bonds by index, each
 * conformer's coordinates in angstroms, laid over the first, and its energy
 * in hartrees, lowest first - none where no force field had parameters for a
 * metal in it, and the conformers are not ranked; the force field's name
 * ("none" where none was used); and the CIP label of
 * every stereocentre and double bond, and of those that were left open and
 * chosen, by the block's atom and bond index.
 */
export type Conformers = {
  atoms: { el: string; charge: number }[];
  bonds: { a1: number; a2: number; order: 1 | 2 | 3 }[];
  frames: number[][];
  energies?: number[];
  /** The stars at the centres of the rings or chains bound to a metal through all their atoms (V3000 ENDPTS), by atom: placed at each one's centre, and no atoms of the molecule. */
  stars?: number[];
  field: string;
  /** How they were made, as rows to show - what made them, the method, the force field - in the plugin's words. */
  how?: { label: string; text: string }[];
  /** How they were made, in one line - embedding, force field, and what was held that is no term of it: shown with them, kept with them. */
  method?: string;
  cip: { atoms: Record<string, string>; bonds: Record<string, string> };
  chosen: { atoms: Record<string, string>; bonds: Record<string, string> };
  smiles: string;
};

export type ChemOp = keyof ChemRequests;

export type Analysis = {
  atoms: {
    index: number;
    hydrogens: number;
    /**
     * More bonds than the atom can have: its valence, and the most it can
     * be, when that is known.
     */
    valenceError?: { valence: number; most?: number };
    cip?: "R" | "S" | "r" | "s";
    aromatic?: boolean;
  }[];
  /** A bond's CIP descriptor: E or Z, or an axis of chirality's M or P. */
  bonds: { index: number; aromatic?: boolean; cip?: "E" | "Z" | "M" | "P" }[];
};

/** What carries lines to the worker and back. */
export type ChemTransport = {
  send(line: string): void;
  /** Calls `onLine` for every line the worker writes; returns the unsubscribe. */
  listen(onLine: (line: string) => void): () => void;
};

/** An answer that is an error: the plugin could not do what was asked. */
export class ChemError extends Error {}

/** No answer in the time a request was given: the worker held on it is started afresh (lib/plugins/queue). */
export class ChemTimeout extends ChemError {}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** How long an answer may take before it is given up on. */
const TIMEOUT_MS = 30_000;

export class ChemClient {
  private pending = new Map<number, Pending>();
  private stop: () => void;
  /** Why it was closed, once it is: what it is asked from then on fails at once, saying so. */
  private closed: string | null = null;
  /** Where what it is asked once closed goes instead, where its worker was stopped unused: the worker started in its place (lib/plugins/process). */
  private retake?: () => Promise<ChemClient>;
  private notReady: (e: Error) => void = () => {};
  /** The plugin's version, once the worker has said it is ready. */
  version: string | null = null;
  /** Its version, once its worker says it is ready - or why it never will, closed first. */
  readonly ready: Promise<string>;

  constructor(
    private transport: ChemTransport,
    private timeoutMs = TIMEOUT_MS,
    /** What the plugin is called, in what is said of it. */
    private name = "The plugin",
    /** Where its questions' ids come from: shared with the other clients of the same worker (lib/calc/client `counter`). */
    private ids: () => number = counter(),
    /** The worker's queue, which hears each question asked, answered and given up on (lib/plugins/queue). */
    private watch?: Watch,
  ) {
    let markReady!: (v: string) => void;
    this.ready = new Promise((resolve, reject) => {
      markReady = resolve;
      this.notReady = reject;
    });
    // (a client closed before its worker was ready, that no one waited on: nothing to say)
    this.ready.catch(() => {});
    this.stop = transport.listen((line) => this.receive(line, markReady));
  }

  private receive(line: string, markReady: (v: string) => void) {
    let m: {
      id?: number;
      ok?: boolean;
      result?: unknown;
      error?: string;
      event?: string;
      version?: string;
    };
    try {
      m = JSON.parse(line);
    } catch {
      return; // not an answer: what the plugin's library printed, say
    }
    if (m.event === "ready") {
      this.version = m.version ?? "";
      markReady(this.version);
      return;
    }
    const p = typeof m.id === "number" ? this.pending.get(m.id) : undefined;
    if (!p) return;
    this.pending.delete(m.id!);
    clearTimeout(p.timer);
    this.watch?.settled(m.id!);
    if (m.ok) p.resolve(m.result);
    else p.reject(new ChemError(m.error ?? `${this.name} could not answer`));
  }

  /**
   * Asks the worker; the answer, or an error saying why there is none -
   * after `timeoutMs`, if given, for what takes long.
   */
  request<Op extends ChemOp>(
    op: Op,
    args: ChemRequests[Op]["args"],
    timeoutMs = this.timeoutMs,
  ): Promise<ChemRequests[Op]["result"]> {
    // (its worker stopped unused: asked of the one started in its place)
    if (this.closed !== null && this.retake) return this.retake().then((fresh) => fresh.request(op, args, timeoutMs));
    // (its worker gone: asked of no one, so failing at once - not after its time, nor stopping the worker that runs now)
    if (this.closed !== null) return Promise.reject(new ChemError(this.closed));
    const id = this.ids();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ChemTimeout(`${this.name} did not answer ${op} in time`));
        this.watch?.overdue(id);
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      this.watch?.sent(id);
      this.transport.send(JSON.stringify({ id, op, ...args }));
    });
  }

  /** What it is asked once closed, handed to the client `retake` gives (its worker stopped unused). */
  handOver(retake: () => Promise<ChemClient>): void {
    this.retake = retake;
  }

  /** Stops listening; whatever is still waiting fails, as does whatever it is asked from then on. */
  close(reason = "the chemistry worker stopped"): void {
    this.closed ??= reason;
    this.notReady(new ChemError(this.closed));
    this.stop();
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new ChemError(reason));
      this.pending.delete(id);
      this.watch?.settled(id);
    }
  }
}
