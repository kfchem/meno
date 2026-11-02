import { useEffect } from "react";
import { alsoReadersFor, READERS, readerFor, readersOf, WRITER_PLUGINS } from "../../../lib/calc/catalog";
import { addedReaders, useReaders } from "../../../lib/calc/workers";
import { MENO_KINDS, MENO_WRITES, useKinds } from "../../../lib/io/kinds";
import { pluginWriters } from "../../../lib/io/writers";
import { useAppSettings } from "../../../lib/settings/appSettings";
import Checkbox from "../../controls/Checkbox";
import Select from "../../controls/Select";

/**
 * Files in Settings: every kind of file Meno reads - its own, and those the
 * plugins added bring - and who reads it - Meno, or a plugin added - who
 * else reads it, their findings added to the reader's, and who writes it;
 * and the kinds the plugins added write, and nothing reads. Where more than
 * one can read a kind, the chemist chooses.
 */
export default function FileSettings() {
  const states = useReaders((s) => s.state);
  const files = useAppSettings((s) => s.files);
  const setFiles = useAppSettings((s) => s.setFiles);
  useEffect(() => {
    void addedReaders([...READERS, ...WRITER_PLUGINS.filter((p) => !READERS.includes(p))]);
  }, []);
  const added = new Set(READERS.filter((p) => states[p.id] === "added").map((p) => p.id));
  const shown = useKinds((s) => s.kinds).filter((k) => k.id !== MENO_KINDS.record.id);
  // (the kinds the plugins added write, by who writes each)
  const writers = pluginWriters(WRITER_PLUGINS.filter((p) => states[p.id] === "added"));
  const writtenOnly = writers.filter((w) => !shown.some((k) => k.id === w.id));
  const writerName = (id: string) => WRITER_PLUGINS.find((p) => p.id === writers.find((w) => w.id === id)?.by)?.name;

  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      <div className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem] gap-4 px-4 py-2 text-xs text-gh-gray">
        <span>Kind</span>
        <span>Read by</span>
        <span>Also read by</span>
        <span>Written by</span>
      </div>
      {shown.map((k) => {
        const can = readersOf(k.id).filter((p) => p.builtin || added.has(p.id));
        const reader = readerFor(k.id, added, files);
        const also = alsoReadersFor(k.id, added, files);
        const others = can.filter((p) => p !== reader);
        const could = readersOf(k.id).filter((p) => !p.builtin && !added.has(p.id));
        const toggle = (id: string, on: boolean) => {
          const now = new Set(files.also[k.id] ?? []);
          if (on) now.add(id);
          else now.delete(id);
          setFiles({ ...files, also: { ...files.also, [k.id]: [...now] } });
        };
        return (
          <div key={k.id} className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem] gap-4 items-center px-4 py-2">
            <span className="text-sm text-gh-black">
              {k.name} <span className="text-xs text-gh-gray">{k.extensions.join(" ")}</span>
            </span>
            {can.length > 1 ? (
              <Select
                label={`Who reads ${k.name}`}
                value={reader?.id ?? null}
                placeholder="Choose which"
                options={can.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => setFiles({ ...files, read: { ...files.read, [k.id]: v } })}
                className="w-fit"
              />
            ) : reader ? (
              <span className="text-xs text-gh-black">{reader.name}</span>
            ) : (
              <span className="text-xs text-gh-gray">{could.length ? `Add ${could.map((p) => p.name).join(" or ")} in Plugins` : "Nothing yet"}</span>
            )}
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {others.length ? (
                others.map((p) => (
                  <Checkbox key={p.id} checked={also.includes(p)} onChange={(v) => toggle(p.id, v)} className="gap-1.5 text-xs text-gh-black">
                    {p.name}
                  </Checkbox>
                ))
              ) : (
                <span className="text-xs text-gh-gray">-</span>
              )}
            </span>
            <span className="text-xs text-gh-black">{MENO_WRITES.includes(k.id) ? "Meno" : (writerName(k.id) ?? <span className="text-gh-gray">-</span>)}</span>
          </div>
        );
      })}
      {writtenOnly.map((w) => (
        <div key={w.id} className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem] gap-4 items-center px-4 py-2">
          <span className="text-sm text-gh-black">
            {w.name} <span className="text-xs text-gh-gray">{w.extensions.join(" ")}</span>
          </span>
          <span className="text-xs text-gh-gray">-</span>
          <span className="text-xs text-gh-gray">-</span>
          <span className="text-xs text-gh-black">{writerName(w.id)}</span>
        </div>
      ))}
    </div>
  );
}
