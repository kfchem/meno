import { AnimatePresence, motion } from "motion/react";
import { RISE } from "../../theme/motion";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useAppSettings } from "../../../lib/settings/appSettings";
import NetworkSettings from "../../network/NetworkSettings";
import StyleEditor from "../StyleEditor";
import Style3DEditor from "../StyleEditor/Style3DEditor";
import AbbreviationSettings from "./AbbreviationSettings";
import ChemistrySettings from "./ChemistrySettings";
import DefaultAppSettings from "./DefaultAppSettings";
import FileSettings from "./FileSettings";
import PointerSettings from "./PointerSettings";
import CanvasSettings from "./CanvasSettings";
import ColourSettings from "./ColourSettings";
import WorkspaceSizeSettings from "./WorkspaceSizeSettings";
import FirstStepsSettings from "./FirstStepsSettings";
import LogSettings from "./LogSettings";
import LicenceSettings from "./LicenceSettings";
import LabelSettings from "./LabelSettings";
import PictureSettings from "./PictureSettings";
import CalculationSettings from "./CalculationSettings";
import JobSettings from "./JobSettings";
import ProcedureSettings from "./ProcedureSettings";
import PluginSettings from "./PluginSettings";
import { useSettingsSection, type SettingsSection } from "./section";
import { COLUMN_WIDTH, SECTION_WIDTH } from "./widths";

const SECTIONS: { id: SettingsSection; name: string }[] = [
  { id: "general", name: "General" },
  // (each named in one word - the maintainer, 2026-10-19; a section's own heading may say more)
  { id: "style", name: "Drawing" },
  { id: "style3d", name: "3D" },
  { id: "chemistry", name: "Chemistry" },
  { id: "files", name: "Files" },
  { id: "calculations", name: "Calculations" },
  { id: "plugins", name: "Plugins" },
  { id: "abbreviations", name: "Dictionary" },
  { id: "network", name: "Network" },
];

/**
 * The application's settings: Meno's as a whole (how the mouse and the
 * trackpad work the canvas), the drawing style new workspaces are made in
 * (each keeps its own after), how molecules in 3D look and turn,
 * what is pointed out on a structure, who reads and writes each kind
 * of file and how sharp a copied picture is, the calculations of a workflow and how its jobs run, the plugins, what the labels Meno reads stand for, and what Meno
 * may do on the network; and the licences of the software by others it is
 * built with.
 */
/** Every section as wide as the others, its words at one measure within it (./widths). */
const SECTION = `mt-6 ${SECTION_WIDTH}`;

export default function SettingsPanel() {
  const drawingStyle = useAppSettings((s) => s.drawingStyle);
  const setDrawingStyle = useAppSettings((s) => s.setDrawingStyle);
  const style3d = useAppSettings((s) => s.style3d);
  const setStyle3d = useAppSettings((s) => s.setStyle3d);
  const error = useAppSettings((s) => s.error);
  const section = useSettingsSection((s) => s.section);
  return (
    <div className="w-full h-full overflow-auto bg-gh-base/40">
      {/* (the tabs and the section as one column, centred in a wide window - its margins
          equal - and the window's width, less its padding, in a narrow one: ./widths) */}
      <div className={`${COLUMN_WIDTH} mx-auto px-6 py-6`}>
        {/* The sections' names each on one line, and as many on a row as
            the window has room for: past that they go on to a row of
            their own, under the heading, and on from there. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h1 className="text-xl font-semibold text-gh-black">Settings</h1>
          <div role="tablist" className="flex flex-wrap gap-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => useSettingsSection.setState({ section: s.id })}
                className={clsx(
                  "h-8 px-3 shrink-0 whitespace-nowrap rounded-md text-sm border transition-[background-color,border-color,color,box-shadow] duration-150 ease-meno",
                  section === s.id
                    ? "bg-white border-gh-line text-gh-black shadow-sm"
                    : "border-transparent text-gh-gray hover:text-gh-black",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              {...RISE}
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md border border-gh-line bg-white px-3 py-2 text-xs text-gh-black"
            >
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        <div key={section} className="meno-fade-in">
        {section === "general" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">General</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">How Meno works as a whole. Changes are saved as you make them.</p>
            <FirstStepsSettings />
            <PointerSettings />
            <CanvasSettings />
            <LabelSettings />
            <ColourSettings />
            <WorkspaceSizeSettings />
            <LogSettings />
            <LicenceSettings />
          </section>
        ) : section === "style" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">
              Drawing style
            </h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              The style new workspaces are drawn in, on the canvas and in
              exported pictures. Start from a journal's style and change what
              you like. A workspace keeps the style it was made in; change it
              from its canvas, with Styles in its menu. Changes are saved
              as you make them.
            </p>
            <StyleEditor
              choice={drawingStyle}
              onChange={(next) => setDrawingStyle(next)}
            />
          </section>
        ) : section === "style3d" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">
              Molecules in 3D
            </h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              How molecules in 3D look in new workspaces, on the canvas and in
              exported pictures, and how they turn under the pointer. A molecule
              is drawn in the primary style; a double-click takes it to the
              secondary and back. A workspace keeps the styles and the light it
              was made in; change them from its canvas, with Styles in its menu.
              Changes are saved as you make them.
            </p>
            <Style3DEditor
              choice={style3d}
              onChange={(next) => setStyle3d(next)}
            />
          </section>
        ) : section === "chemistry" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">Chemistry</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              What is pointed out on a structure as it is drawn, and who does
              it. The marks are Meno's, not the drawing's: no exported picture
              has them.
            </p>
            <ChemistrySettings />
          </section>
        ) : section === "files" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">Files</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              Who reads each kind of file Meno opens, and who writes it. Where more than one can read a kind, one
              reads it - the molecule, and what the calculation was, are its - and those ticked read it as well,
              what they find added beside it.
            </p>
            <FileSettings />
            <h3 className="mt-6 text-sm font-semibold text-gh-black">Opening files</h3>
            <p className="mt-1 mb-3 text-sm text-gh-gray">
              The app each kind of file opens with when it is double-clicked, and Meno for it where you choose.
            </p>
            <DefaultAppSettings />
            <h3 className="mt-6 text-sm font-semibold text-gh-black">Copied pictures</h3>
            <p className="mt-1 mb-3 text-sm text-gh-gray">
              What a copy puts beside a structure for other programs - Word, PowerPoint - to paste.
            </p>
            <PictureSettings />
          </section>
        ) : section === "calculations" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">Calculations</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              Default options for each calculation in a workflow, by what does it: each plugin added, and Meno. A
              step put on the page starts with these; options changed in a step are that step's alone.
            </p>
            <CalculationSettings />
            <h3 className="mt-6 text-sm font-semibold text-gh-black">Jobs</h3>
            <p className="mt-1 mb-3 text-sm text-gh-gray">
              The programs steps run, on this computer. They go on when Meno closes, and those waiting start in turn, as many at once as fit. A job counts the memory its
              plugin declares - ORCA's %maxcore, Gaussian's %Mem; one that declares none counts by its cores alone.
            </p>
            <JobSettings />
            <h3 className="mt-6 text-sm font-semibold text-gh-black">Procedures</h3>
            <p className="mt-1 mb-3 text-sm text-gh-gray">
              Workflows saved without their molecules - their steps, as they are set, and the sets they take their input
              from - to put down again from Quick Add, or to share as a workspace file.
            </p>
            <ProcedureSettings />
          </section>
        ) : section === "plugins" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">Plugins</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              What Meno does beyond itself: read files, make sense of a structure, make it in 3D, run calculations - and its first steps.
              A plugin that runs a program is downloaded when it is added, or first needed - Meno asks first - and any can be taken away again.
            </p>
            <PluginSettings />
          </section>
        ) : section === "abbreviations" ? (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">Dictionary</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              What each label stands for - Boc, DMP, XPhos, Grubbs II - drawn. Labels of your own are saved as you add them.
            </p>
            <AbbreviationSettings />
          </section>
        ) : (
          <section className={SECTION}>
            <h2 className="text-base font-semibold text-gh-black">Network</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray">
              Meno asks before anything first uses the network, shows each
              connection as it happens, and keeps a record of them all.
            </p>
            <NetworkSettings />
          </section>
        )}
        </div>
      </div>
    </div>
  );
}
