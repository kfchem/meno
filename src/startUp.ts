import { loadAppSettings } from "./lib/settings/appSettings";

/**
 * What is done before Meno draws anything: the plugins it knows of taken from
 * its backend (lib/plugins/known) - where that fails, Meno starts knowing of
 * none, and says so in its log (lib/log: the reason given only as what it is,
 * as it may name a folder) - and Settings read. A workspace opens in Settings'
 * style as it is made, and is asked about a style that changes in Settings
 * only after (docs/WORKSPACE.md, *Drawing style*): one made before they are
 * read would be in the built-in style, and ask at once. They are read here,
 * not after the network (App): it is a file read; where it fails the defaults
 * are in use, and `loaded` says so.
 */
export async function beforeFirstDraw(plugins: () => Promise<unknown>): Promise<void> {
  await Promise.all([plugins().catch((e) => console.error("Meno: the plugins in place could not be read.", e)), loadAppSettings()]);
}
