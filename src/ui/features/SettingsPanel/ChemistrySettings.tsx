import { useEffect, useState } from "react";
import { chemAtHand, chemWorker, rolePlugin, useChem } from "../../../lib/roles/worker";
import RoleChoices from "./RoleChoices";
import {
  useAppSettings,
  WINDOW_3D,
  WINDOW_3D_MOST,
  type ChemistrySettings as Settings,
} from "../../../lib/settings/appSettings";
import type { Option, OptionValues } from "../../../lib/options";
import OptionRows from "../../options/OptionRows";
import Switch from "../../controls/Switch";

const SWITCHES: { key: "valenceWarnings"; name: string; detail: string }[] = [
  {
    key: "valenceWarnings",
    name: "Point out atoms with too many bonds",
    detail:
      "A mark round any atom with more bonds than it can have - a carbon with five, say - " +
      "saying what is wrong while the pointer is on it.",
  },
];

/**
 * Chemistry in Settings: what is pointed out on a structure as it is drawn,
 * who does it - the plugin that fills each role - and whether it is there to
 * do it.
 */
export default function ChemistrySettings() {
  const chemistry = useAppSettings((s) => s.chemistry);
  const setChemistry = useAppSettings((s) => s.setChemistry);
  const chem = useChem();
  const removed = useAppSettings((s) => s.plugins.removed);
  // (the plugin that checks a structure as it is drawn, and whether the chemist took it away)
  const who = rolePlugin("checks");
  const name = who?.name ?? "A plugin";
  const takenAway = who != null && removed.includes(who.id);
  const [atHand, setAtHand] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void chemAtHand().then((v) => {
      if (live) setAtHand(v);
    });
    return () => {
      live = false;
    };
  }, [chem.state]);

  const status =
    chem.state === "ready"
      ? `${chem.plugin} ${chem.version} is running.`
      : chem.state === "setting-up"
        ? `Setting up ${chem.plugin}…`
        : chem.state === "starting"
          ? `Starting ${chem.plugin}…`
          : atHand
            ? `${name} is set up, and starts when a structure is drawn.`
            : takenAway
              ? `${name} was taken away. Add it again in Settings, Plugins, and these are pointed out again.`
              : atHand === false
                ? `${name} is not set up yet. Meno sets it up - asking before it downloads - the ` +
                  "first time something needs it: SMILES, a structure in 3D, or R and S. Until then " +
                  "nothing is pointed out."
                : "";

  return (
    <div className="space-y-3">
      {SWITCHES.map((s) => (
        <div
          key={s.key}
          className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4"
        >
          <div className="flex-1">
            <div className="text-sm text-gh-black">{s.name}</div>
            <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">{s.detail}</p>
          </div>
          <Switch on={chemistry[s.key]} label={s.name} onChange={(v) => setChemistry({ ...chemistry, [s.key]: v })} />
        </div>
      ))}
      <div className="flex items-start gap-3 px-1 pt-1 text-xs text-gh-gray">
        <p key={`${chem.state}-${!!error}`} className="flex-1 meno-fade-in">
          {status}
          {chem.state === "failed" && <span className="text-accel-accent">{chem.message}</span>}
          {error && <span className="block text-accel-accent">{error}</span>}
        </p>
        {atHand === false && !takenAway && chem.state === "idle" && (
          <button
            onClick={() => {
              setError(null);
              chemWorker().catch((e: unknown) =>
                setError(e instanceof Error ? e.message : String(e)),
              );
            }}
            className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base meno-fade-in"
          >
            Set up {name}
          </button>
        )}
      </div>
      <RoleChoices where="chemistry" />
      {/* (who makes molecules in 3D: done on a structure drawn, at once, as the rest here) */}
      <div className="mt-6">
        <RoleChoices where="molecules3d" heading="3D" />
        <Window3D chemistry={chemistry} setChemistry={setChemistry} />
      </div>
    </div>
  );
}

const WINDOW: Option[] = [{ id: "window", label: "Keep conformers within", type: "number", default: WINDOW_3D, min: 0, max: WINDOW_3D_MOST, step: 5, unit: "kcal/mol" }];

/**
 * The energy window a structure's conformers are kept within, made in 3D on
 * the canvas (docs/WORKSPACE.md, *Conformers kept*): of the lowest, those
 * above set aside. A workflow's conformer step keeps every one; only its
 * *Energy window* step sets any aside.
 */
function Window3D({ chemistry, setChemistry }: { chemistry: Settings; setChemistry: (c: Settings) => void }) {
  const values: OptionValues = { window: chemistry.window3d ?? WINDOW_3D };
  const change = (v: OptionValues) => {
    const n = typeof v.window === "number" && Number.isFinite(v.window) ? Math.min(Math.max(0, v.window), WINDOW_3D_MOST) : WINDOW_3D;
    const { window3d: _, ...rest } = chemistry;
    setChemistry({ ...rest, ...(n !== WINDOW_3D ? { window3d: n } : {}) });
  };
  return (
    <div className="mt-2 rounded-lg border border-gh-line bg-white">
      <OptionRows options={WINDOW} values={values} onChange={change} />
      <p className="px-3 pb-2.5 text-xs leading-snug text-gh-gray max-w-2xl">
        Of a structure made in 3D here, its conformers within this of the lowest are kept, and the window is said with how they were made. A workflow's conformer step keeps every one: there, an Energy window step sets any aside.
      </p>
    </div>
  );
}
