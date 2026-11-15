import { pluginsFilling } from "../../../lib/calc/catalog";
import { ROLES, roleOptionsRole, type Role, type RoleId } from "../../../lib/plugins/roles";
import { rolePlugin } from "../../../lib/roles/worker";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { useReaders } from "../../../lib/calc/workers";
import { valuesOf } from "../../../lib/options";
import OptionRows from "../../options/OptionRows";
import clsx from "clsx";
import Select from "../../controls/Select";

/**
 * Who fills each role shown in a part of Settings (docs/PLUGINS.md, the
 * roles chosen where they are used): the plugin, by name - a choice where
 * more than one fills it - and the options it takes for the role, as its
 * manifest declares them, each a row under the role's, remembered. Laid out
 * as the settings beside it are: under a heading, where it is given one,
 * rows in one card.
 */
export default function RoleChoices({ where, heading }: { where: Role["where"]; heading?: string }) {
  const plugins = useAppSettings((s) => s.plugins);
  const setPlugins = useAppSettings((s) => s.setPlugins);
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  // (who fills a role nobody chose follows what is added)
  useReaders((s) => s.state);
  const roles = (Object.keys(ROLES) as RoleId[]).filter((r) => ROLES[r].where === where);
  const card = (
    <div className={clsx("rounded-lg border border-gh-line bg-white divide-y divide-gh-line", heading && "mt-2")}>
      {roles.map((role) => {
        const can = pluginsFilling(role);
        const chosen = rolePlugin(role);
        const options = chosen?.roleOptions[role] ?? [];
        return (
          <div key={role} className="divide-y divide-gh-line/60">
            <div className="px-3 py-2.5 flex items-center gap-3">
              <span className="min-w-0 flex-1 text-sm text-gh-black">{ROLES[role].name}</span>
              {can.length > 1 ? (
                <Select
                  label={`Who does this: ${ROLES[role].name}`}
                  value={chosen?.id ?? null}
                  placeholder="Choose which"
                  options={can.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(v) => setPlugins({ ...plugins, roles: { ...plugins.roles, [role]: v } })}
                />
              ) : (
                <span className="text-xs text-gh-black">{chosen?.name ?? <span className="text-gh-gray">Nothing yet</span>}</span>
              )}
            </div>
            {options.length > 0 && (
              <OptionRows
                indent
                options={options}
                values={valuesOf(options, remembered[roleOptionsRole(role)])}
                onChange={(v) => rememberOptions(roleOptionsRole(role), v)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
  if (!heading) return card;
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">{heading}</h3>
      {card}
    </section>
  );
}
