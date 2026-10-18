import { useState, type ReactNode } from "react";
import { ABBREVIATIONS, abbreviationStructure, labelRuns, precatalystDrawn, type CustomAbbreviation } from "../../../lib/chem/abbreviations";
import { COUNTER_IONS, counterIonStructure, LIGAND_FAMILIES, ligandPicture, structureFormula, type GroupStructure, type Ligand } from "../../../lib/chem/ligands";
import { shownAs } from "../../../lib/chem/enantiomers";
import { PRECATALYST_GENERATIONS, REAGENT_USES, REAGENTS, type Reagent } from "../../../lib/chem/reagents";
import { useAppSettings } from "../../../lib/settings/appSettings";
import AbbreviationForm from "../../abbreviations/AbbreviationForm";
import AbbreviationPicture from "../../abbreviations/AbbreviationPicture";

/**
 * Settings › Dictionary: what each label stands for. The user's own -
 * added, changed and taken away here, or saved from a canvas - and Meno's:
 * groups, reagents, ligands, Buchwald's precatalysts and counter-anions,
 * each drawn as what it is, all of them found by one search.
 */
export default function AbbreviationSettings() {
  const mine = useAppSettings((s) => s.abbreviations);
  const setAbbreviations = useAppSettings((s) => s.setAbbreviations);
  // the one being changed, or "new" while one is being added
  const [editing, setEditing] = useState<CustomAbbreviation | "new" | null>(null);
  const [query, setQuery] = useState("");
  const matches = (a: { label: string; also?: string[]; name: string; smiles?: string }) => {
    const q = query.trim().toLowerCase();
    return !q || [a.label, ...(a.also ?? []), a.name, a.smiles ?? ""].some((t) => t.toLowerCase().includes(q));
  };
  const groups = ABBREVIATIONS.filter(matches);
  const reagentMatches = (r: Reagent) => matches({ ...r, smiles: r.smiles ?? r.complex ?? "" });
  const precatalysts = PRECATALYST_GENERATIONS.map(({ generation, name }) => {
    const label = `XPhos Pd ${generation}`;
    return { generation, name, label };
  }).filter(({ label, name }) => matches({ label, name, also: ["Buchwald precatalyst"] }));
  const ions = Object.entries(COUNTER_IONS)
    .map(([label, ion]) => ({ label, ...ion }))
    .filter(matches);
  const found =
    groups.length +
    REAGENTS.filter(reagentMatches).length +
    LIGAND_FAMILIES.reduce((n, f) => n + f.ligands.filter(matches).length, 0) +
    precatalysts.length +
    ions.length;

  return (
    <div className="space-y-8">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a label, name or SMILES"
        aria-label="Find a label"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-8 w-full rounded-md border border-gh-line bg-white px-2 text-sm"
      />

      <section aria-labelledby="mine-heading">
        <div className="flex items-center justify-between">
          <h3 id="mine-heading" className="text-sm font-semibold text-gh-black">
            Yours
          </h3>
          {editing === null && (
            <button
              onClick={() => setEditing("new")}
              className="h-8 rounded-md border border-gh-line bg-white px-3 text-sm text-gh-black hover:bg-gh-base meno-fade-in"
            >
              Add a label
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gh-gray max-w-2xl">
          A group on a canvas can be added too: select it, and choose <i>Save as abbreviation…</i> from its menu.
        </p>
        {editing === "new" && (
          <div className="mt-3 rounded-lg border border-gh-line bg-white p-4 meno-fade-in">
            <AbbreviationForm
              initial={{}}
              saveText="Add"
              onCancel={() => setEditing(null)}
              onSave={(a) => {
                setAbbreviations([...mine, a]);
                setEditing(null);
              }}
            />
          </div>
        )}
        {mine.length === 0 && editing !== "new" && (
          <p className="mt-3 rounded-lg border border-dashed border-gh-line px-4 py-6 text-center text-sm text-gh-gray meno-fade-in">
            None yet.
          </p>
        )}
        <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {mine.map((a) =>
            editing === a ? (
              <div key={a.label} className="col-span-full rounded-lg border border-gh-line bg-white p-4 meno-fade-in">
                <AbbreviationForm
                  initial={a}
                  editing={a}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    setAbbreviations(mine.map((x) => (x === a ? next : x)));
                    setEditing(null);
                  }}
                />
              </div>
            ) : (
              <Entry key={a.label} a={a}>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setEditing(a)}
                    className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base"
                  >
                    Change
                  </button>
                  <button
                    onClick={() => setAbbreviations(mine.filter((x) => x !== a))}
                    className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base"
                  >
                    Remove
                  </button>
                </div>
              </Entry>
            ),
          )}
        </div>
      </section>

      {found === 0 && <p className="text-sm text-gh-gray">Nothing of Meno&apos;s matches.</p>}

      {groups.length > 0 && (
        <Listed title="Groups">
          {groups.map((a) => (
            <Entry key={a.label} a={a} keep={`group:${a.label}`} />
          ))}
        </Listed>
      )}

      {REAGENTS.some(reagentMatches) && (
        <section aria-labelledby="reagents-heading">
          <h3 id="reagents-heading" className="text-sm font-semibold text-gh-black">
            Reagents
          </h3>
          {REAGENT_USES.map(({ use, title }) => {
            const these = REAGENTS.filter((r) => r.use === use && reagentMatches(r));
            if (!these.length) return null;
            return (
              <div key={use} className="mt-3">
                <h4 className="text-xs font-semibold text-gh-black">{title}</h4>
                <div className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
                  {these.map((r) => (
                    <ReagentEntry key={r.label} r={r} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {LIGAND_FAMILIES.some((f) => f.ligands.some(matches)) && (
        <section aria-labelledby="ligands-heading">
          <h3 id="ligands-heading" className="text-sm font-semibold text-gh-black">
            Ligands
          </h3>
          {LIGAND_FAMILIES.map(({ title, ligands }) => {
            const these = ligands.filter(matches);
            if (!these.length) return null;
            return (
              <div key={title} className="mt-3">
                <h4 className="text-xs font-semibold text-gh-black">{title}</h4>
                <div className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
                  {these.map((l) => (
                    <LigandEntry key={l.label} l={l} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {precatalysts.length > 0 && (
        <Listed title="Buchwald precatalysts">
          {precatalysts.map(({ generation, name, label }) => (
            <article key={generation} className="min-w-0 overflow-hidden rounded-lg border border-gh-line bg-white">
              <AbbreviationPicture
                of={() => precatalystDrawn(generation)!}
                keep={`precatalyst:${generation}`}
                className="flex h-32 items-center justify-center border-b border-gh-line p-2"
              />
              <div className="space-y-0.5 px-3 py-2">
                <div className="text-base font-semibold text-gh-black">L Pd {generation}</div>
                <div className="text-xs text-gh-black">{name}, L any of the Buchwald ligands</div>
                <div className="text-xs text-gh-gray">
                  {label}: <LabelText label={structureFormula(abbreviationStructure(label)!)} />
                </div>
              </div>
            </article>
          ))}
        </Listed>
      )}

      {ions.length > 0 && (
        <Listed title="Counter-anions">
          {ions.map((ion) => (
            <Entry key={ion.label} a={ion} of={() => counterIonStructure(ion.label)!} keep={`ion:${ion.label}`} />
          ))}
        </Listed>
      )}
    </div>
  );
}

/** A heading and its entries. */
function Listed({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gh-black">{title}</h3>
      <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">{children}</div>
    </section>
  );
}

/**
 * A reagent as the molecule it is - a chiral one as the enantiomer its
 * SMILES is, with its descriptors; a metal's complex drawn from its formula,
 * which is shown with its name.
 */
function ReagentEntry({ r }: { r: Reagent }) {
  const as = shownAs(r.enantiomers);
  return (
    <Entry
      a={{ ...r, smiles: r.smiles ?? "" }}
      formula={r.complex}
      of={() => abbreviationStructure(as ? `${as}-${r.label}` : r.label)!}
      keep={`reagent:${r.label}`}
    >
      {as && <Descriptors as={as} mirror={r.enantiomers!.mirror[0]} />}
    </Entry>
  );
}

/** A ligand, drawn with a * on the atoms it binds a metal by and at the centre of each pi system it binds through. */
function LigandEntry({ l }: { l: Ligand }) {
  const as = shownAs(l.enantiomers);
  return (
    <Entry a={l} of={() => ligandPicture(l)} keep={`ligand:${l.label}`}>
      {as && <Descriptors as={as} mirror={l.enantiomers!.mirror[0]} />}
    </Entry>
  );
}

/** Which enantiomer a chiral one is drawn as, and the other's descriptor. */
function Descriptors({ as, mirror }: { as: string; mirror?: string }) {
  return (
    <div className="text-xs text-gh-gray">
      {as}- as drawn{mirror ? `, ${mirror}- its mirror image` : ""}
    </div>
  );
}

/** One label: what it stands for, drawn, and its label, names and SMILES. */
function Entry({
  a,
  of,
  keep,
  formula,
  children,
}: {
  a: CustomAbbreviation & { free?: boolean };
  of?: () => GroupStructure;
  keep?: string;
  /** A metal complex's formula, shown in place of SMILES. */
  formula?: string;
  children?: ReactNode;
}) {
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-gh-line bg-white">
      <AbbreviationPicture
        smiles={a.smiles}
        of={of}
        keep={keep}
        className="flex h-32 items-center justify-center border-b border-gh-line p-2"
      />
      <div className="space-y-0.5 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-gh-black">
            <LabelText label={a.label} />
          </span>
          {a.free && (
            <span
              title="In IUPAC's Table II: may be used without explanation"
              className="rounded-full bg-gh-base px-2 text-[0.7rem] text-gh-gray"
            >
              IUPAC
            </span>
          )}
        </div>
        {a.name && <div className="text-xs text-gh-black">{a.name}</div>}
        <AlsoNames names={a.also} />
        {formula && (
          <div className="text-xs text-gh-gray">
            <LabelText label={formula} />
          </div>
        )}
        {a.smiles && <code className="block break-all font-mono text-[0.7rem] text-gh-gray">{a.smiles}</code>}
        {children}
      </div>
    </article>
  );
}

/** A label's other names, each set as a label. */
function AlsoNames({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return (
    <div className="text-xs text-gh-gray">
      also{" "}
      {names.map((x, i) => (
        <span key={x}>
          {i ? ", " : ""}
          <LabelText label={x} />
        </span>
      ))}
    </div>
  );
}

/** A label - or a formula - set as a drawing sets it: its counts below the line (PPh₃, C₄₅H₅₉ClNPPd), a descriptor's R and S and a t- in italics. */
function LabelText({ label }: { label: string }) {
  return (
    <>
      {labelRuns(label).map((r, i) =>
        r.sub ? <sub key={i}>{r.text}</sub> : r.sup ? <sup key={i}>{r.text}</sup> : r.italic ? <i key={i}>{r.text}</i> : <span key={i}>{r.text}</span>,
      )}
    </>
  );
}
