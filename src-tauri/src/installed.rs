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
/// Where a version is made before it is put in place (catalogue.rs): never read as a plugin.
pub const STAGING: &str = ".staging";

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

/// Plugin `id`'s version in use set to `version`, at once: written beside, then renamed over the old - so that a
/// reader finds the old or the new, never half of either.
pub fn put_in_use(root: &Path, id: &str, version: &str) -> std::io::Result<()> {
    let folder = root.join(id);
    let tmp = folder.join(format!("{CURRENT}.{}.tmp", std::process::id()));
    fs::write(&tmp, version)?;
    fs::rename(&tmp, folder.join(CURRENT)).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
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

/// The version plugin `id`'s `current` names, where that version is in place - its folder there, its manifest
/// read - and none otherwise: no `current`, one that cannot be read, or one naming a version not there.
fn in_use(root: &Path, id: &str) -> Option<String> {
    let version = current(root, id)?;
    fs::read(root.join(id).join(&version).join("manifest.json")).ok()?;
    Some(version)
}

/// The versions in `root` no plugin uses taken away, as Meno starts: each version's folder its plugin's `current`
/// does not name - one replaced by an update, one half put in place - however it came there; but none of a plugin a
/// job of which runs (`running`): left for the next start. And none of a plugin whose `current` names no version in
/// place - none, one that cannot be read (a file held a moment, as a virus scanner holds one), or one naming a
/// folder not there: which version it uses is not known, so none is taken for unused; each of its versions is kept,
/// and that is said. What was taken away, or kept so, a line each, for Meno's log.
pub fn tidy(root: &Path, running: &dyn Fn(&str) -> bool) -> Vec<String> {
    let mut said = Vec::new();
    let Ok(entries) = fs::read_dir(root) else { return said };
    let mut ids: Vec<String> = entries.flatten().filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().to_str().map(str::to_string)).collect();
    ids.sort();
    for id in ids.into_iter().filter(|id| crate::plugin_id_ok(id)) {
        let now = in_use(root, &id);
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
        // (which version is in use not known: every one kept, and said - never all of a plugin taken for unused)
        if now.is_none() {
            said.push(format!("{id}: its current names no version in place, so none of its {} taken away", plural_versions(gone.len())));
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

/// "1 version was", "3 versions were": as many as were kept.
fn plural_versions(n: usize) -> String {
    if n == 1 { "1 version was".to_string() } else { format!("{n} versions were") }
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
        // (and what is not a version's folder, or not a plugin's: left - a file, a folder whose name is no version)
        fs::write(root.join("alpha").join("notes.txt"), "").unwrap();
        fs::create_dir_all(root.join("alpha").join(".cache")).unwrap();
        fs::create_dir_all(root.join(".staging").join("x")).unwrap();
        let busy = |id: &str| id == "alpha";
        // (beta has no current: which version it uses is not known - kept, and said)
        assert_eq!(tidy(&root, &busy), ["beta: its current names no version in place, so none of its 1 version was taken away"]);
        assert!(root.join("alpha").join("0.9.0").exists() && root.join("beta").join("0.1.0").exists());
        let none = |_: &str| false;
        assert_eq!(
            tidy(&root, &none),
            ["alpha 0.9.0: no longer in use, taken away", "alpha 1.1.0: no longer in use, taken away", "beta: its current names no version in place, so none of its 1 version was taken away"]
        );
        assert!(dir(&root, "alpha").is_ok() && root.join("alpha").join("notes.txt").exists() && root.join("alpha").join(".cache").exists() && root.join(".staging").join("x").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn every_version_is_kept_where_current_names_none_in_place() {
        let none = |_: &str| false;
        let kept = |root: &Path, id: &str, versions: &[&str]| versions.iter().all(|v| root.join(id).join(v).join("manifest.json").exists());
        let two = |root: &Path, id: &str| {
            for v in ["0.1.21", "0.1.24"] {
                fs::create_dir_all(root.join(id).join(v)).unwrap();
                fs::write(root.join(id).join(v).join("manifest.json"), "{}").unwrap();
            }
        };
        // (current naming a version whose folder is gone - set back by hand to one an earlier start took away: none taken)
        let root = temp("dangling");
        two(&root, "rdkit");
        fs::write(root.join("rdkit").join(CURRENT), "0.1.20").unwrap();
        assert_eq!(tidy(&root, &none), ["rdkit: its current names no version in place, so none of its 2 versions were taken away"]);
        assert!(kept(&root, "rdkit", &["0.1.21", "0.1.24"]));
        let _ = fs::remove_dir_all(&root);
        // (no current at all, or one that names no version Meno takes - empty: none taken)
        for written in [None, Some(""), Some("../x")] {
            let root = temp("nocurrent");
            two(&root, "rdkit");
            if let Some(w) = written {
                fs::write(root.join("rdkit").join(CURRENT), w).unwrap();
            }
            assert_eq!(tidy(&root, &none).len(), 1, "{written:?}");
            assert!(kept(&root, "rdkit", &["0.1.21", "0.1.24"]), "{written:?}");
            let _ = fs::remove_dir_all(&root);
        }
        // (current naming a version whose folder is there but whose manifest is missing: not in place - none taken)
        let root = temp("nomanifest");
        two(&root, "rdkit");
        fs::create_dir_all(root.join("rdkit").join("0.1.25")).unwrap();
        fs::write(root.join("rdkit").join(CURRENT), "0.1.25").unwrap();
        assert_eq!(tidy(&root, &none).len(), 1);
        assert!(kept(&root, "rdkit", &["0.1.21", "0.1.24"]) && root.join("rdkit").join("0.1.25").exists());
        // (and once current names a version in place again: the others taken away, as ever)
        fs::write(root.join("rdkit").join(CURRENT), "0.1.24").unwrap();
        assert_eq!(tidy(&root, &none), ["rdkit 0.1.21: no longer in use, taken away", "rdkit 0.1.25: no longer in use, taken away"]);
        assert!(kept(&root, "rdkit", &["0.1.24"]));
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn every_version_is_kept_where_current_cannot_be_read_or_the_manifest_it_names() {
        use std::os::unix::fs::PermissionsExt;
        let none = |_: &str| false;
        let root = temp("unreadable");
        for v in ["0.1.21", "0.1.24"] {
            fs::create_dir_all(root.join("rdkit").join(v)).unwrap();
            fs::write(root.join("rdkit").join(v).join("manifest.json"), "{}").unwrap();
        }
        let current = root.join("rdkit").join(CURRENT);
        fs::write(&current, "0.1.24").unwrap();
        // (current held, unreadable for the moment: none taken)
        fs::set_permissions(&current, fs::Permissions::from_mode(0o000)).unwrap();
        // (a root that reads it anyway cannot test this: then it is in place, and 0.1.21 is taken as unused)
        if fs::read(&current).is_err() {
            assert_eq!(tidy(&root, &none).len(), 1);
            assert!(root.join("rdkit").join("0.1.21").exists() && root.join("rdkit").join("0.1.24").exists());
        }
        fs::set_permissions(&current, fs::Permissions::from_mode(0o644)).unwrap();
        // (current read, the manifest of the version it names held: none taken)
        let manifest = root.join("rdkit").join("0.1.24").join("manifest.json");
        fs::set_permissions(&manifest, fs::Permissions::from_mode(0o000)).unwrap();
        if fs::read(&manifest).is_err() {
            assert_eq!(tidy(&root, &none).len(), 1);
            assert!(root.join("rdkit").join("0.1.21").exists());
        }
        fs::set_permissions(&manifest, fs::Permissions::from_mode(0o644)).unwrap();
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
