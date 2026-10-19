import clsx from "clsx";
import { useEffect, useState } from "react";
import { chemAtHand, chemWorker, rolePlugin, useChem } from "../../../lib/roles/worker";
import RoleChoices from "./RoleChoices";
import {
  useAppSettings,
  type ChemistrySettings as Settings,
} from "../../../lib/settings/appSettings";

const SWITCHES: { key: keyof Settings; name: string; detail: string }[] = [
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
          <button
            role="switch"
            aria-checked={chemistry[s.key]}
            aria-label={s.name}
            onClick={() =>
              setChemistry({ ...chemistry, [s.key]: !chemistry[s.key] })
            }
            className={clsx(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              chemistry[s.key] ? "bg-accel-base" : "bg-gh-line",
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                chemistry[s.key] ? "left-[1.375rem]" : "left-0.5",
              )}
            />
          </button>
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
      </div>
    </div>
  );
}
