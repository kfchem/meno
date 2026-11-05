//! The plugins Meno knows of (docs/PLUGINS.md, *Where plugins are*): each a
//! folder of its own in Meno's local data folder, `plugins/<id>/<version>/` -
//! its manifest, worker, lock and the rest, as the plugin is - the one in use
//! named by `plugins/<id>/current`, the version alone. A folder that
//! `current` does not name is no plugin Meno knows of: one half put in place,
//! one left by an update. Meno reads them; only Meno's own backend puts them
//! there (the page may not write here: capabilities/main.json).
//!
//! Meno carries none: each is got from the plugins online and put here
//! (catalogue.rs: `.staging/`, `catalogue*` beside them, not read here).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// The plugins' folder, in Meno's local data folder.
pub const ROOT: &str = "plugins";
/// The file naming the version in use, in a plugin's folder.
pub const CURRENT: &str = "current";

/// The plugins' folder in Meno's local data folder `data`.
pub fn root(data: &Path) -> PathBuf {
    data.join(ROOT)
}

/// Whether `v` may be a version's folder: a manifest's version as Meno takes it - digits, letters, dots, `+` and
/// `-`, at most 40 - and never `.` or `..` or a name beginning with a dot.
pub fn version_ok(v: &str) -> bool {
    !v.is_empty() && v.len() <= 40 && !v.starts_with('.') && v.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'+' | b'-'))
}

/// The version of plugin `id` in use, as its `current` says - none where it says none Meno takes.
pub fn current(root: &Path, id: &str) -> Option<String> {
    if !crate::plugin_id_ok(id) {
        return None;
    }
    let v = fs::read_to_string(root.join(id).join(CURRENT)).ok()?;
    let v = v.trim();
    version_ok(v).then(|| v.to_string())
}

/// The folder of plugin `id`'s version in use: where its manifest is. An error, saying so, where none is in place.
pub fn dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    if !crate::plugin_id_ok(id) {
        return Err(format!("no plugin is called {id:?}"));
    }
    let version = current(root, id).ok_or_else(|| format!("the plugin {id} is not in place"))?;
    let dir = root.join(id).join(&version);
    if dir.join("manifest.json").is_file() {
        Ok(dir)
    } else {
        Err(format!("the plugin {id} {version} is not in place"))
    }
}

/// A plugin in place: its id, the version in use, and its folder.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Installed {
    pub id: String,
    pub version: String,
    pub dir: PathBuf,
}

/// The plugins in place, in their ids' order: each folder whose `current` names a version there.
pub fn list(root: &Path) -> Vec<Installed> {
    let Ok(entries) = fs::read_dir(root) else { return Vec::new() };
    let mut out: Vec<Installed> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .filter_map(|e| {
            let id = e.file_name().to_str()?.to_string();
            let dir = dir(root, &id).ok()?;
            Some(Installed { version: current(root, &id)?, id, dir })
        })
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// The versions in `root` no plugin uses taken away, as Meno starts: each version's folder its plugin's `current`
/// does not name - one replaced by an update, one half put in place - however it came there; but none of a plugin a
/// job of which runs (`running`): left for the next start. What was taken away, a line each, for Meno's log.
pub fn tidy(root: &Path, running: &dyn Fn(&str) -> bool) -> Vec<String> {
    let mut said = Vec::new();
    let Ok(entries) = fs::read_dir(root) else { return said };
    let mut ids: Vec<String> = entries.flatten().filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().to_str().map(str::to_string)).collect();
    ids.sort();
    for id in ids.into_iter().filter(|id| crate::plugin_id_ok(id)) {
        let now = current(root, &id);
        let Ok(versions) = fs::read_dir(root.join(&id)) else { continue };
        let mut gone: Vec<PathBuf> = versions
            .flatten()
            .filter(|v| v.path().is_dir())
            .filter(|v| v.file_name().to_str().is_some_and(|n| version_ok(n) && now.as_deref() != Some(n)))
            .map(|v| v.path())
            .collect();
        if gone.is_empty() || running(&id) {
            continue;
        }
        gone.sort();
        for dir in gone {
            if fs::remove_dir_all(&dir).is_ok() {
                said.push(format!("{id} {}: no longer in use, taken away", dir.file_name().unwrap_or_default().to_string_lossy()));
            }
        }
    }
    said
}

/// What a plugin in place gives the page (`plugins_installed`): its id, version and folder, its manifest as it is
/// written, and its grammars (`*.grammar` beside it), by file name.
#[derive(Serialize, Debug)]
pub struct InstalledPlugin {
    pub id: String,
    pub version: String,
    pub dir: String,
    pub manifest: String,
    pub grammars: std::collections::BTreeMap<String, String>,
}

/// The plugins in place in `root`, each as the page takes it; one whose manifest cannot be read is left out.
pub fn described(root: &Path) -> Vec<InstalledPlugin> {
    list(root)
        .into_iter()
        .filter_map(|p| {
            let manifest = fs::read_to_string(p.dir.join("manifest.json")).ok()?;
            let grammars = fs::read_dir(&p.dir)
                .ok()?
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_str()?.to_string();
                    (name.ends_with(".grammar") && e.path().is_file()).then(|| Some((name, fs::read_to_string(e.path()).ok()?)))?
                })
                .collect();
            Some(InstalledPlugin { id: p.id, version: p.version, dir: p.dir.to_string_lossy().into_owned(), manifest, grammars })
        })
        .collect()
}

/// The plugins whose environments were set up on this computer, by id, in order: each environment's stamp
/// (`uv/stamps/plugin-<id>.json`, `pixi/stamps/plugin-<id>.json` in Meno's local data folder `data`, as
/// lib/pyEnv writes it once set up, and takes away with the environment). Whether each is in place is not
/// asked here: a Meno that carried its plugins set them up from among its own, and kept none in this folder.
pub fn set_up_before(data: &Path) -> Vec<String> {
    let mut ids: Vec<String> = ["uv", "pixi"]
        .iter()
        .filter_map(|host| fs::read_dir(data.join(host).join("stamps")).ok())
        .flat_map(|entries| entries.flatten())
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let name = e.file_name().to_str()?.to_string();
            let id = name.strip_prefix("plugin-")?.strip_suffix(".json")?.to_string();
            crate::plugin_id_ok(&id).then_some(id)
        })
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A plugin in place for a test: `root/<id>/<version>/manifest.json`, and `current` naming it. Its folder.
    pub fn in_place(root: &Path, id: &str, version: &str, manifest: &str) -> PathBuf {
        let dir = root.join(id).join(version);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), manifest).unwrap();
        fs::write(root.join(id).join(CURRENT), version).unwrap();
        dir
    }

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("meno-installed-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_plugin_is_the_version_current_names_and_no_other() {
        let root = temp("current");
        assert!(dir(&root, "demo").is_err());
        let d = in_place(&root, "demo", "1.2.0", "{}");
        assert_eq!(dir(&root, "demo").unwrap(), d);
        // (a version's folder current does not name: no plugin; a current naming none there, or none Meno takes: none)
        fs::create_dir_all(root.join("half").join("0.1.0")).unwrap();
        fs::create_dir_all(root.join("gone")).unwrap();
        fs::write(root.join("gone").join(CURRENT), "1.0.0").unwrap();
        fs::create_dir_all(root.join("odd")).unwrap();
        fs::write(root.join("odd").join(CURRENT), "../demo/1.2.0").unwrap();
        assert!(dir(&root, "half").is_err() && dir(&root, "gone").is_err() && dir(&root, "odd").is_err());
        assert!(dir(&root, "../demo").is_err());
        // (the staging folder and what lies beside the plugins: never plugins)
        fs::create_dir_all(root.join(".staging").join("x")).unwrap();
        fs::write(root.join("catalogue.json"), "{}").unwrap();
        assert_eq!(list(&root).iter().map(|p| (p.id.as_str(), p.version.as_str())).collect::<Vec<_>>(), [("demo", "1.2.0")]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn versions_are_folder_names_meno_takes() {
        for v in ["1.2.0", "0.1.0-rc.1", "2.0.0+build.5"] {
            assert!(version_ok(v), "{v}");
        }
        for v in ["", ".", "..", ".hidden", "1/2", "1\\2", "1 2", &"9".repeat(41)] {
            assert!(!version_ok(v), "{v}");
        }
    }

    #[test]
    fn the_versions_no_plugin_uses_are_taken_away_but_not_while_a_job_of_it_runs() {
        let root = temp("tidy");
        in_place(&root, "alpha", "1.0.0", "{}");
        // (one replaced by an update, from anywhere; one half put in place; one beside a plugin with no current)
        fs::create_dir_all(root.join("alpha").join("0.9.0")).unwrap();
        fs::create_dir_all(root.join("alpha").join("1.1.0")).unwrap();
        fs::create_dir_all(root.join("beta").join("0.1.0")).unwrap();
        // (and what is not a version's folder, or not a plugin's: left)
        fs::write(root.join("alpha").join("notes.txt"), "").unwrap();
        fs::create_dir_all(root.join(".staging").join("x")).unwrap();
        let busy = |id: &str| id == "alpha";
        assert_eq!(tidy(&root, &busy), ["beta 0.1.0: no longer in use, taken away"]);
        assert!(root.join("alpha").join("0.9.0").exists());
        let none = |_: &str| false;
        assert_eq!(tidy(&root, &none), ["alpha 0.9.0: no longer in use, taken away", "alpha 1.1.0: no longer in use, taken away"]);
        assert!(dir(&root, "alpha").is_ok() && root.join("alpha").join("notes.txt").exists() && root.join(".staging").join("x").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_plugins_set_up_before_are_those_with_a_stamp() {
        let data = temp("stamps");
        assert!(set_up_before(&data).is_empty());
        // (one in pixi's that comes first by its id: in their ids' order, whichever folder each is in)
        for (host, file) in [("uv", "plugin-sketchkit.json"), ("uv", "plugin-tightbind.json"), ("pixi", "plugin-wavecalc.json"), ("pixi", "plugin-sketchkit.json"), ("pixi", "plugin-alpha.json")] {
            fs::create_dir_all(data.join(host).join("stamps")).unwrap();
            fs::write(data.join(host).join("stamps").join(file), "{}").unwrap();
        }
        // (what is not a plugin's stamp: another profile's, a name Meno takes for no plugin, a folder, another file)
        fs::write(data.join("uv/stamps/console.json"), "{}").unwrap();
        fs::write(data.join("uv/stamps/plugin-Bad_Id.json"), "{}").unwrap();
        fs::create_dir_all(data.join("uv/stamps/plugin-dir.json")).unwrap();
        fs::write(data.join("uv/stamps/plugin-quanta.json.tmp"), "{}").unwrap();
        assert_eq!(set_up_before(&data), ["alpha", "sketchkit", "tightbind", "wavecalc"]);
        let _ = fs::remove_dir_all(&data);
    }

    #[test]
    fn the_page_is_given_each_plugin_s_manifest_and_grammars() {
        let root = temp("described");
        let d = in_place(&root, "demo", "1.0.0", r#"{"id": "demo"}"#);
        fs::write(d.join("demo.grammar"), "@top X").unwrap();
        fs::write(d.join("worker.py"), "").unwrap();
        let [p] = described(&root).try_into().unwrap();
        assert_eq!((p.id.as_str(), p.version.as_str(), p.manifest.as_str()), ("demo", "1.0.0", r#"{"id": "demo"}"#));
        assert_eq!(p.grammars.into_iter().collect::<Vec<_>>(), [("demo.grammar".to_string(), "@top X".to_string())]);
        let _ = fs::remove_dir_all(&root);
    }
}
