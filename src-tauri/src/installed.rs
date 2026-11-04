//! The plugins Meno knows of (docs/PLUGINS.md, *Where plugins are*): each a
//! folder of its own in Meno's local data folder, `plugins/<id>/<version>/` -
//! its manifest, worker, lock and the rest, as the plugin is - the one in use
//! named by `plugins/<id>/current`, the version alone. A folder that
//! `current` does not name is no plugin Meno knows of: one half put in place,
//! one left by an update. Meno reads them; only Meno's own backend puts them
//! there (the page may not write here: capabilities/main.json).
//!
//! For now Meno carries its plugins too, among its resources, and puts each
//! in place here as it starts (`seed`), marked as from Meno (`FROM_BUNDLE`) -
//! never over one put here otherwise. Plugins put here from a catalogue are
//! another's to put (`.staging/`, `catalogue*` beside them, not read here).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// The plugins' folder, in Meno's local data folder.
pub const ROOT: &str = "plugins";
/// The file naming the version in use, in a plugin's folder.
pub const CURRENT: &str = "current";
/// The mark of a version put in place from the plugins Meno carries, in that version's folder: what it was put from.
pub const FROM_BUNDLE: &str = ".from-bundle";
/// Where a version is made before it is put in place: never read as a plugin.
const STAGING: &str = ".staging";

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

/// Plugin `id`'s version in use set to `version`, at once: written beside, then renamed over the old.
pub fn set_current(root: &Path, id: &str, version: &str) -> io::Result<()> {
    let folder = root.join(id);
    let tmp = folder.join(format!("{CURRENT}.{}.tmp", std::process::id()));
    fs::write(&tmp, version)?;
    fs::rename(tmp, folder.join(CURRENT))
}

/// A folder's files copied into another, made anew, every level: none that is a link.
fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)? {
        let e = e?;
        let kind = e.file_type()?;
        let name = e.file_name();
        if kind.is_dir() {
            copy_tree(&e.path(), &to.join(&name))?;
        } else if kind.is_file() {
            fs::copy(e.path(), to.join(&name))?;
        }
    }
    Ok(())
}

/// What a folder holds, as a fingerprint: each file's path within it and its bytes, in order - the same files, the
/// same fingerprint; a file changed, added or taken away, another.
fn fingerprint(dir: &Path) -> io::Result<String> {
    use sha2::{Digest, Sha256};
    fn walk(dir: &Path, base: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
        for e in fs::read_dir(dir)? {
            let e = e?;
            let kind = e.file_type()?;
            if kind.is_dir() {
                walk(&e.path(), base, files)?;
            } else if kind.is_file() {
                files.push(e.path().strip_prefix(base).unwrap_or(&e.path()).to_path_buf());
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    walk(dir, dir, &mut files)?;
    files.sort();
    let mut h = Sha256::new();
    for f in files {
        h.update(f.to_string_lossy().replace('\\', "/").as_bytes());
        h.update([0]);
        h.update(fs::read(dir.join(&f))?);
        h.update([0]);
    }
    Ok(format!("{:x}", h.finalize()))
}

/// The version a plugin's folder says it is, in its manifest.
fn manifest_version(dir: &Path) -> Option<String> {
    let m: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("manifest.json")).ok()?).ok()?;
    let v = m.get("version")?.as_str()?.trim().to_string();
    version_ok(&v).then_some(v)
}

/// Whether a version's folder was put in place from the plugins Meno carries, and from what (`FROM_BUNDLE`'s text).
fn bundled_mark(dir: &Path) -> Option<String> {
    fs::read_to_string(dir.join(FROM_BUNDLE)).ok().map(|t| t.trim().to_string())
}

/// The plugins Meno carries (`bundle`: its resources' `plugins` folder) each put in place in `root`, as Meno starts:
/// - one with nothing in place, or whose version in use was put there from Meno and is not what Meno carries now -
///   another version, or the same one changed - put in place, marked as from Meno, and made the one in use;
/// - never one put there otherwise (a catalogue's), nor one replaced while a job of that plugin runs (`running`):
///   one with nothing in place is put there all the same - nothing of it is in use.
///
/// The versions no longer in use are taken away after (`tidy`).
/// What was done, a line each, for Meno's log.
pub fn seed(bundle: &Path, root: &Path, running: &dyn Fn(&str) -> bool) -> Vec<String> {
    let mut said = Vec::new();
    let Ok(entries) = fs::read_dir(bundle) else { return said };
    let mut carried: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    carried.sort();
    for from in carried {
        let Some(id) = from.file_name().and_then(|n| n.to_str()).map(str::to_string) else { continue };
        if !crate::plugin_id_ok(&id) {
            continue;
        }
        let Some(version) = manifest_version(&from) else {
            said.push(format!("{id}: the manifest Meno carries names no version Meno takes"));
            continue;
        };
        let Ok(print) = fingerprint(&from) else { continue };
        let in_use = current(root, &id);
        let ours = in_use.as_ref().map(|v| bundled_mark(&root.join(&id).join(v)));
        let wanted = match (&in_use, &ours) {
            (None, _) => true,
            (Some(_), Some(Some(mark))) => *mark != print,
            // (one put in place otherwise: never over it)
            (Some(_), _) => false,
        };
        if wanted && in_use.is_some() && running(&id) {
            said.push(format!("{id}: not put in place while a job of it runs"));
            continue;
        }
        if wanted {
            match put(&from, root, &id, &version, &print) {
                Ok(()) => said.push(format!("{id} {version}: put in place from Meno")),
                Err(e) => {
                    said.push(format!("{id} {version}: could not be put in place: {e}"));
                    continue;
                }
            }
        }
    }
    said
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

/// One plugin Meno carries put in place as `version`: made in the staging folder, renamed into its place (over a
/// version from Meno of the same number, never over another), marked, and made the one in use.
fn put(from: &Path, root: &Path, id: &str, version: &str, print: &str) -> io::Result<()> {
    let staging = root.join(STAGING).join(format!("bundle-{id}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&staging);
    copy_tree(from, &staging)?;
    fs::write(staging.join(FROM_BUNDLE), print)?;
    let target = root.join(id).join(version);
    if target.exists() {
        if bundled_mark(&target).is_none() {
            let _ = fs::remove_dir_all(&staging);
            return Err(io::Error::other("a version of that number is in place from elsewhere"));
        }
        fs::remove_dir_all(&target)?;
    }
    fs::create_dir_all(root.join(id))?;
    fs::rename(&staging, &target)?;
    set_current(root, id, version)
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

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A plugin in place for a test: `root/<id>/<version>/manifest.json`, and `current` naming it. Its folder.
    pub fn in_place(root: &Path, id: &str, version: &str, manifest: &str) -> PathBuf {
        let dir = root.join(id).join(version);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), manifest).unwrap();
        set_current(root, id, version).unwrap();
        dir
    }

    fn carried(bundle: &Path, id: &str, version: &str, worker: &str) {
        let dir = bundle.join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), format!(r#"{{"id": "{id}", "name": "X", "version": "{version}"}}"#)).unwrap();
        fs::write(dir.join("worker.py"), worker).unwrap();
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
        fs::create_dir_all(root.join(STAGING).join("x")).unwrap();
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
    fn the_plugins_meno_carries_are_put_in_place_and_never_over_another_s() {
        let (bundle, root) = (temp("bundle"), temp("root"));
        carried(&bundle, "alpha", "0.1.0", "print(1)");
        carried(&bundle, "beta", "0.2.0", "print(2)");
        let none = |_: &str| false;
        let said = seed(&bundle, &root, &none);
        assert_eq!(said, ["alpha 0.1.0: put in place from Meno", "beta 0.2.0: put in place from Meno"]);
        let a = dir(&root, "alpha").unwrap();
        assert_eq!(fs::read_to_string(a.join("worker.py")).unwrap(), "print(1)");
        assert!(a.join(FROM_BUNDLE).is_file());
        // (again, nothing changed: nothing done)
        assert!(seed(&bundle, &root, &none).is_empty());
        // (Meno carrying another version: put in place; the old one taken away after, as no job of it runs)
        carried(&bundle, "alpha", "0.1.1", "print(11)");
        assert_eq!(seed(&bundle, &root, &none), ["alpha 0.1.1: put in place from Meno"]);
        assert_eq!(current(&root, "alpha").as_deref(), Some("0.1.1"));
        assert_eq!(tidy(&root, &none), ["alpha 0.1.0: no longer in use, taken away"]);
        assert!(!root.join("alpha").join("0.1.0").exists());
        // (the same version changed - as between builds - put in place again)
        fs::write(bundle.join("alpha").join("worker.py"), "print(12)").unwrap();
        assert_eq!(seed(&bundle, &root, &none), ["alpha 0.1.1: put in place from Meno"]);
        assert_eq!(fs::read_to_string(dir(&root, "alpha").unwrap().join("worker.py")).unwrap(), "print(12)");
        // (one put in place otherwise - from a catalogue - is never replaced from Meno)
        let theirs = in_place(&root, "beta", "0.3.0", r#"{"id": "beta", "version": "0.3.0"}"#);
        assert!(seed(&bundle, &root, &none).is_empty());
        assert_eq!(dir(&root, "beta").unwrap(), theirs);
        // (nor while a job of a plugin runs: said, and left as it is; its old versions kept)
        carried(&bundle, "alpha", "0.1.2", "print(13)");
        let busy = |id: &str| id == "alpha" || id == "gamma";
        assert_eq!(seed(&bundle, &root, &busy), ["alpha: not put in place while a job of it runs"]);
        assert_eq!(current(&root, "alpha").as_deref(), Some("0.1.1"));
        // (one with nothing in place - its jobs run from before, of a Meno that carried it - put in place all the same)
        carried(&bundle, "gamma", "1.0.0", "print(3)");
        assert_eq!(seed(&bundle, &root, &busy), ["alpha: not put in place while a job of it runs", "gamma 1.0.0: put in place from Meno"]);
        let _ = (fs::remove_dir_all(&bundle), fs::remove_dir_all(&root));
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
        fs::create_dir_all(root.join(STAGING).join("x")).unwrap();
        let busy = |id: &str| id == "alpha";
        assert_eq!(tidy(&root, &busy), ["beta 0.1.0: no longer in use, taken away"]);
        assert!(root.join("alpha").join("0.9.0").exists());
        let none = |_: &str| false;
        assert_eq!(tidy(&root, &none), ["alpha 0.9.0: no longer in use, taken away", "alpha 1.1.0: no longer in use, taken away"]);
        assert!(dir(&root, "alpha").is_ok() && root.join("alpha").join("notes.txt").exists() && root.join(STAGING).join("x").exists());
        let _ = fs::remove_dir_all(&root);
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
