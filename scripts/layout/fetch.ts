/**
 * Fills in molecules.json: each molecule's isomeric SMILES and CID from
 * PubChem, and the structure its English Wikipedia article leads with - the
 * image's address, and its licence and author from Wikimedia Commons.
 *
 * Only the address is kept, never the image: the sheet shows it from where
 * it lives, with its licence beside it. An image that is not on Commons
 * (a file held by Wikipedia itself, often under a claim of fair use) is left
 * out, as is one whose licence Commons does not state.
 *
 *   npm run layout-fetch            # fills in what is missing
 *   npm run layout-fetch -- --again # looks everything up afresh
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// --list=heldout: another list beside molecules.json, filled in the same way
const listPath = resolve(here, `${process.argv.find((a) => a.startsWith("--list="))?.slice(7) ?? "molecules"}.json`);

// Wikimedia asks tools to say who they are.
const AGENT = "Meno-layout-benchmark/1.0 (https://github.com/kfchem/meno; dev tool)";

export type Reference = {
  /** The image's own address, on upload.wikimedia.org. */
  url: string;
  /** Its page on Commons, which says who made it and how it may be used. */
  page: string;
  licence: string;
  author: string;
};

export type Molecule = {
  name: string;
  category: string;
  pubchem: string;
  wikipedia: string;
  /** The Commons file to take, where the article's infobox leads with another. */
  referenceFile?: string;
  /** Why there is no reference: none on Commons is drawn as it should be. */
  noReference?: string;
  /** What to make of the reference, where it is not one to follow. */
  referenceNote?: string;
  /**
   * The tautomer the reference draws, where PubChem records another (as it
   * does porphine's): used in place of PubChem's SMILES.
   */
  tautomer?: string;
  cid?: number;
  smiles?: string;
  reference?: Reference | null;
};

type List = { "//": string; molecules: Molecule[] };

async function json(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fromPubChem(name: string) {
  const d = await json(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/IsomericSMILES/JSON`,
  );
  const p = d.PropertyTable.Properties[0];
  // PubChem has renamed the property; either name is the isomeric SMILES
  return { cid: p.CID as number, smiles: (p.IsomericSMILES ?? p.SMILES) as string };
}

/** Text from Commons' metadata, which comes as HTML. */
const plain = (html: string | undefined) =>
  (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** Not a structural formula: a model, a photograph, a crystal. */
const NOT_A_FORMULA = /3d|ball|space|model|stick|vdw|photo|crystal|sample|powder|jpe?g$/i;

/**
 * The structural formula an article's infobox shows (Chembox and Drugbox
 * name it ImageFile, ImageFileL1, image...): the first drawing that is not
 * a model, a vector one before any other. Failing that, the article's lead
 * image, if it is not a model either.
 */
async function formulaFile(title: string): Promise<string | null> {
  const page = encodeURIComponent(title.replace(/ /g, "_"));
  const parsed = await json(
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&section=0&page=${page}`,
  ).catch(() => null);
  const text: string = parsed?.parse?.wikitext?.["*"] ?? "";
  const named = [
    ...text.matchAll(/\|\s*(?:ImageFile\w*|image\d*)\s*=\s*([^|\n}]+)/gi),
  ].map((m) => m[1].trim().replace(/^(?:File|Image):/i, ""));
  const drawings = named.filter((f) => f && !NOT_A_FORMULA.test(f));
  const pick = drawings.find((f) => /\.svg$/i.test(f)) ?? drawings[0];
  if (pick) return pick;
  const s = await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`);
  const src: string | undefined = s.originalimage?.source;
  // .../wikipedia/commons/[thumb/]a/ab/File_name.svg[/500px-...png]
  const found = src?.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/);
  const file = found ? decodeURIComponent(found[1]) : null;
  return file && !NOT_A_FORMULA.test(file) ? file : null;
}

async function fromWikipedia(title: string, chosen?: string): Promise<Reference | null> {
  const file = chosen ?? (await formulaFile(title));
  if (!file) return null;
  // Only a file on Commons, which states its licence; one Wikipedia holds
  // itself may be there under a claim of fair use.
  const info = await json(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(`File:${file}`)}`,
  );
  const page: any = Object.values(info.query.pages)[0];
  const ii = page?.imageinfo?.[0];
  const meta = ii?.extmetadata ?? {};
  const licence = plain(meta.LicenseShortName?.value);
  if (!ii || !licence) return null;
  const bare = (u: string) => u.split("?")[0];
  return {
    url: bare(ii.url),
    page: bare(ii.descriptionurl),
    licence,
    author: plain(meta.Artist?.value) || "unknown",
  };
}

const list: List = JSON.parse(readFileSync(listPath, "utf8"));
const again = process.argv.includes("--again");
for (const m of list.molecules) {
  try {
    if (again || !m.smiles) Object.assign(m, await fromPubChem(m.pubchem));
    if (m.tautomer) m.smiles = m.tautomer;
    await pause(250); // PubChem asks for no more than five a second
    if (m.noReference) m.reference = null;
    else if (again || !m.reference) m.reference = await fromWikipedia(m.wikipedia, m.referenceFile);
    console.log(
      `${m.name.padEnd(28)} CID ${String(m.cid).padEnd(10)} ${m.reference ? m.reference.licence : "(no reference)"}`,
    );
  } catch (e) {
    console.log(`${m.name.padEnd(28)} failed: ${e instanceof Error ? e.message : e}`);
  }
}
writeFileSync(listPath, JSON.stringify(list, null, 2) + "\n");
