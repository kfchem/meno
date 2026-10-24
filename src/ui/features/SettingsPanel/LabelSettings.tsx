import { useAppSettings } from "../../../lib/settings/appSettings";
import Switch from "../../controls/Switch";

/** How an atom's label is read, and words on the page are written, as they are typed, in Settings: as they were meant, or exactly as typed. */
export default function LabelSettings() {
  const labels = useAppSettings((s) => s.labels);
  const setLabels = useAppSettings((s) => s.setLabels);
  const words = useAppSettings((s) => s.words);
  const setWords = useAppSettings((s) => s.setWords);
  return (
    <>
      <Smart
        title="Read labels as they are meant"
        about="An atom's label typed as nh2 is NH2, obz is OBz. Off, a label is kept exactly as typed."
        on={labels.smart}
        turn={() => setLabels({ ...labels, smart: !labels.smart })}
      />
      <Smart
        title="Write words on the page as they are meant"
        about="Typed in words on the page, 60dc is 60 °C, -78 is −78 and 1-2 h is 1–2 h. Off, words are kept exactly as typed."
        on={words.smart}
        turn={() => setWords({ ...words, smart: !words.smart })}
      />
    </>
  );
}

function Smart({ title, about, on, turn }: { title: string; about: string; on: boolean; turn: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-gh-line bg-white px-3 py-2.5 flex gap-3 items-start">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gh-black">{title}</div>
        <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-2xl">{about}</p>
      </div>
      <Switch on={on} label={title} onChange={turn} />
    </div>
  );
}
