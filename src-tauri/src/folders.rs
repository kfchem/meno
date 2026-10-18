//! Where Meno keeps what it keeps (docs/ARCHITECTURE.md, *Where Meno keeps
//! what*): folders named "Meno" in the system's folders for applications'
//! data, local data and caches - on Windows the local data and caches in
//! `Meno\data`, as `Meno` there is where Meno is installed, and the page
//! may write in its local data folder but never over Meno itself - as
//! tauri.conf.json's (and tauri.windows.conf.json's)
//! `appDirectoriesOverride` has them, so that Tauri's `app_*_dir`, the file
//! scopes and the webview's data folder all agree with what is here - and,
//! once, what a Meno before 0.1.14 kept in folders named by its old
//! identifier, moved into them ([`move_old`]).
//!
//! The move is done at a start, before anything else uses the folders, and
//! entry by entry: each renamed into the new folder (the same volume:
//! instant), or copied and then taken away where a rename cannot be done;
//! never over a file already there - each renamed whole, one there was
//! moved already, and what is in the old folder after the first move was
//! written by an earlier Meno started since, whose fresh settings must not
//! replace the real ones; links moved as links, never followed. It may stop
//! part way and is done again at the next start, from where it stopped.
//! Some things are not moved:
//!
//! - the webview's data (`EBWebView`, Windows): its caches, made again;
//! - the Python environments made (`uv/<name>/venv`, pixi's `.pixi` and its
//!   `activation.json`), which name the folder they were made in: they go,
//!   and each is set up again at its first use - from the caches, which
//!   move, so that little or nothing is downloaded, and without asking
//!   again, as what was allowed and the plugins' files move too;
//! - links left pointing nowhere in uv's Pythons;
//! - while a job of the old folder still waits or runs, the environments,
//!   the tools and the jobs: its program may be using them; they move at a
//!   start after it has ended;
//! - on Windows, the environments, tools and jobs a Meno before 0.1.13 left
//!   in the roaming folder: taken away instead (roaming.rs).
//!
//! The old folder goes once nothing is left in it.

use std::fs;
use std::path::{Path, PathBuf};

/// The name of Meno's folders.
pub const FOLDER: &str = "Meno";
/// The name a Meno before 0.1.14 gave them: its identifier then.
pub const OLD_FOLDER: &str = "com.kfchem.meno";
/// On Windows, the folder in Meno's install folder its local data and caches are in.
const LOCAL_IN: &str = "data";

/// The environments' makers' folders and the tools': held while an old job is under way.
const ENVS: [&str; 3] = ["uv", "pixi", "tools"];
/// The jobs' folder.
const JOBS: &str = "jobs";
/// The webview's data on Windows.
const WEBVIEW: &str = "EBWebView";
/// What a move under way is copied to first, beside where it goes.
const MOVING: &str = ".moving-";

/// The system's folder for applications' data, as Tauri finds it: on Windows the roaming one.
pub fn data_base() -> Option<PathBuf> {
    dirs::data_dir().filter(|p| p.is_absolute())
}

/// The system's folder for applications' local data: on Windows the local one; elsewhere the data folder.
pub fn local_data_base() -> Option<PathBuf> {
    dirs::data_local_dir().filter(|p| p.is_absolute())
}

/// The system's folder for caches: on Windows the local application data folder.
pub fn cache_base() -> Option<PathBuf> {
    dirs::cache_dir().filter(|p| p.is_absolute())
}

/// Meno's data folder (`app_data_dir`), where the settings and the log are.
pub fn data_dir() -> Option<PathBuf> {
    data_base().map(|b| b.join(FOLDER))
}

/// Meno's local data folder (`app_local_data_dir`): environments, tools,
/// jobs - and on Windows its caches (`app_cache_dir`) too.
pub fn local_data_dir() -> Option<PathBuf> {
    let dir = local_data_base()?.join(FOLDER);
    Some(if cfg!(windows) { dir.join(LOCAL_IN) } else { dir })
}

/// On Windows, the roaming folder a Meno before 0.1.14 kept its settings in: none elsewhere, where it is the local one.
pub fn old_roaming() -> Option<PathBuf> {
    let (data, local) = (data_base()?, local_data_base()?);
    (data != local).then(|| data.join(OLD_FOLDER))
}

/// One old folder moved into its new one.
#[derive(Debug, Clone, PartialEq)]
pub struct Moved {
    pub from: PathBuf,
    pub to: PathBuf,
    /// Entries left in the old folder, for another to take away.
    pub leave: &'static [&'static str],
    /// Where given, the only entries moved: the rest are the system's.
    pub only: Option<&'static [&'static str]>,
}

/// The old folders and where each goes, on this system.
pub fn moves() -> Vec<Moved> {
    let mut out = Vec::new();
    let (data, local, cache) = (data_base(), local_data_base(), cache_base());
    if let Some(d) = &data {
        // (on Windows the roaming folder: what roaming.rs takes away left there)
        let leave: &'static [&'static str] = if local.as_ref() != Some(d) { &["uv", "pixi", "tools", "jobs"] } else { &[] };
        out.push(Moved { from: d.join(OLD_FOLDER), to: d.join(FOLDER), leave, only: None });
    }
    if let (Some(l), Some(to)) = (local.filter(|l| data.as_ref() != Some(l)), local_data_dir()) {
        out.push(Moved { from: l.join(OLD_FOLDER), to, leave: &[], only: None });
    }
    // (on a Mac and on Linux a folder of its own; on Windows the local one, moved whole above)
    if let Some(c) = cache.filter(|c| ![&data, &local_data_base()].iter().any(|b| b.as_ref() == Some(c))) {
        out.push(Moved { from: c.join(OLD_FOLDER), to: c.join(FOLDER), leave: &[], only: Some(&["pdf", "ccd"]) });
    }
    out
}

/// Whether `said` - what `move_old` did - has anything moved from `from`.
pub fn moved_from(said: &[String], from: &Path) -> bool {
    let head = format!("moved from {} to ", from.display());
    said.iter().any(|s| s.starts_with(&head))
}

/// Each old folder moved into its new one, as far as it can be now: what was done, a line each.
pub fn move_old(moves: &[Moved]) -> Vec<String> {
    let mut said = Vec::new();
    for m in moves {
        if real_folder(&m.from) {
            move_folder(m, &mut said);
        }
    }
    said
}

/// Whether `path` is a folder itself, not a link to one.
fn real_folder(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_dir())
}

fn move_folder(m: &Moved, said: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(&m.from) else { return };
    let jobs = m.from.join(JOBS);
    let under_way = if real_folder(&jobs) { crate::jobs::under_way(&jobs) } else { 0 };
    if under_way > 0 {
        said.push(format!("{under_way} job(s) in {} still wait or run: its environments, tools and jobs are moved at a start after they have ended", m.from.display()));
    }
    if let Err(e) = fs::create_dir_all(&m.to) {
        said.push(format!("could not make {} ({e}): nothing moved there, tried again at the next start", m.to.display()));
        return;
    }
    clear_moving(&m.to);
    let mut makers_moved: Vec<&str> = Vec::new();
    // (what went, by name: said in the log, from each old folder, whether or not the folder goes too)
    let mut moved: Vec<String> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(text) = name.to_str() else { continue };
        if m.leave.contains(&text) || m.only.is_some_and(|only| !only.contains(&text)) {
            continue;
        }
        let from = entry.path();
        if text == WEBVIEW {
            take_away(&from, said, "the webview's data, made again");
            continue;
        }
        let held = ENVS.contains(&text) || text == JOBS;
        if held && under_way > 0 {
            continue;
        }
        let to = m.to.join(&name);
        if ENVS.contains(&text) && fs::symlink_metadata(&to).is_ok() {
            // (made again in the new folder while an old job held them: the new ones are in use)
            take_away(&from, said, "set up again since in the new folder");
            continue;
        }
        if move_entry(&from, &to, said) {
            moved.push(text.to_string());
            if text == "uv" || text == "pixi" {
                makers_moved.push(if text == "uv" { "uv" } else { "pixi" });
            }
        }
    }
    if !moved.is_empty() {
        moved.sort();
        said.push(format!("moved from {} to {}: {}", m.from.display(), m.to.display(), moved.join(", ")));
    }
    for maker in makers_moved {
        unbind(&m.to.join(maker), maker, said);
    }
    match fs::remove_dir(&m.from) {
        Ok(()) => said.push(format!("removed {}, emptied", m.from.display())),
        Err(_) if fs::read_dir(&m.from).is_ok_and(|mut e| e.next().is_some()) => {}
        Err(e) => said.push(format!("could not remove {} ({e})", m.from.display())),
    }
}

/// `from` moved to `to`: renamed, else copied and taken away; into a folder
/// already there, entry by entry, never over a file there (the old one
/// dropped). Whether it went.
fn move_entry(from: &Path, to: &Path, said: &mut Vec<String>) -> bool {
    let Ok(meta) = fs::symlink_metadata(from) else { return false };
    match fs::symlink_metadata(to) {
        Err(_) => {
            if renames() && fs::rename(from, to).is_ok() {
                return true;
            }
            // (another volume, or the system would not: copied beside, under a name of its own, then
            // put in place whole by a rename - so that what is there under its name is there whole; a
            // copy cut short is taken away as this is done again)
            let Some(parent) = to.parent() else { return false };
            let beside = parent.join(format!("{MOVING}{}", to.file_name().map(|n| n.to_string_lossy()).unwrap_or_default()));
            let _ = remove_any(&beside);
            let done = copy_all(from, &beside).and_then(|_| fs::rename(&beside, to));
            match done {
                Ok(()) => {
                    remove_all(from, &meta);
                    true
                }
                Err(e) => {
                    let _ = remove_any(&beside);
                    said.push(format!("could not move {} ({e}): tried again at the next start", from.display()));
                    false
                }
            }
        }
        Ok(there) if meta.is_dir() && there.is_dir() => {
            let Ok(entries) = fs::read_dir(from) else { return false };
            let mut all = true;
            for e in entries.flatten() {
                all &= move_entry(&e.path(), &to.join(e.file_name()), said);
            }
            if all {
                let _ = fs::remove_dir(from);
            }
            all
        }
        Ok(_) => {
            // (the new folder's kept, however new the old one: moved already, or the old one an earlier Meno's since)
            remove_all(from, &meta);
            said.push(format!("{} left out: {} is there already", from.display(), to.display()));
            true
        }
    }
}

/// Whether an entry is renamed into place where it can be: always, but in a test of the copy.
fn renames() -> bool {
    #[cfg(test)]
    return !tests::COPY_ONLY.with(|c| c.get());
    #[cfg(not(test))]
    true
}

/// A copy of `from` at `to`, links copied as links.
fn copy_all(from: &Path, to: &Path) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(from)?;
    if meta.file_type().is_symlink() {
        let target = fs::read_link(from)?;
        #[cfg(unix)]
        return std::os::unix::fs::symlink(target, to);
        #[cfg(windows)]
        return if fs::metadata(from).is_ok_and(|m| m.is_dir()) {
            std::os::windows::fs::symlink_dir(target, to)
        } else {
            std::os::windows::fs::symlink_file(target, to)
        };
    }
    if meta.is_dir() {
        fs::create_dir_all(to)?;
        for e in fs::read_dir(from)? {
            let e = e?;
            copy_all(&e.path(), &to.join(e.file_name()))?;
        }
        return Ok(());
    }
    fs::copy(from, to).map(drop)
}

/// A file, a link or a folder with all in it taken away, as `meta` says it is.
fn remove_all(path: &Path, meta: &fs::Metadata) {
    let _ = if meta.is_dir() { fs::remove_dir_all(path) } else { remove_link_or_file(path) };
}

fn remove_any(path: &Path) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.is_dir() {
        fs::remove_dir_all(path)
    } else {
        remove_link_or_file(path)
    }
}

/// A file or a link taken away: a link to a folder, on Windows, as a folder.
fn remove_link_or_file(path: &Path) -> std::io::Result<()> {
    fs::remove_file(path).or_else(|_| fs::remove_dir(path))
}

/// What a move cut short left beside where it was going: taken away before the move is done again.
fn clear_moving(to: &Path) {
    let Ok(entries) = fs::read_dir(to) else { return };
    for e in entries.flatten() {
        if e.file_name().to_str().is_some_and(|n| n.starts_with(MOVING)) {
            let _ = remove_any(&e.path());
        }
    }
}

fn take_away(path: &Path, said: &mut Vec<String>, why: &str) {
    match remove_any(path) {
        Ok(()) => said.push(format!("removed {} ({why})", path.display())),
        Err(e) => said.push(format!("could not remove {} ({e}): tried again at the next start", path.display())),
    }
}

/// In a maker's folder just moved (`uv`, `pixi`), what names the folder it
/// was made in taken away: each environment made, to be set up again at
/// its first use - its record of being set up and its plugin's files kept -
/// and the links uv's Pythons hold that now point nowhere.
fn unbind(root: &Path, maker: &str, said: &mut Vec<String>) {
    let (keeps, made): (&[&str], &[&str]) = if maker == "uv" { (&["cache", "python", "stamps"], &["venv"]) } else { (&["cache", "home", "stamps"], &[".pixi", "activation.json"]) };
    let envs: Vec<PathBuf> = fs::read_dir(root)
        .map(|es| es.flatten().filter(|e| e.file_name().to_str().is_some_and(|n| !keeps.contains(&n)) && real_folder(&e.path())).map(|e| e.path()).collect())
        .unwrap_or_default();
    for env in envs {
        for name in made {
            let path = env.join(name);
            if fs::symlink_metadata(&path).is_ok() {
                take_away(&path, said, "made where it was: set up again at its first use");
            }
        }
    }
    if let Ok(entries) = fs::read_dir(root.join("python")) {
        for e in entries.flatten() {
            let path = e.path();
            let link = fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink());
            if link && fs::metadata(&path).is_err() {
                take_away(&path, said, "a link to where it was");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    thread_local! {
        /// Set: every entry copied and then taken away, as from another volume.
        pub static COPY_ONLY: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-folders-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    /// The names in a folder, sorted; none where it is not there.
    fn names(dir: &Path) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(dir).map(|es| es.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default();
        out.sort();
        out
    }

    // (a data folder as Meno 0.1.13 left it on a Mac: its settings, its log, an environment of each maker with a plugin's files, uv's Python with a link to it, tools, a finished job)
    fn old_folder(base: &Path) -> PathBuf {
        let old = base.join(OLD_FOLDER);
        write(&old.join("settings.json"), r#"{"granted":["python-env:x"]}"#);
        write(&old.join("window.json"), "{}");
        write(&old.join("logs/meno.log"), "a line\n");
        write(&old.join("uv/plugin-x/venv/pyvenv.cfg"), "home = /old/uv/python/cpython-3.12.11/bin\n");
        write(&old.join("uv/plugin-x/files/app/app"), "x");
        write(&old.join("uv/stamps/plugin-x.json"), r#"{"lockSha":"s","py":"3.12","files":["f"]}"#);
        write(&old.join("uv/cache/archive-v0/w/a.py"), "");
        write(&old.join("uv/python/cpython-3.12.11/bin/python3"), "");
        write(&old.join("pixi/plugin-y/pixi.toml"), "");
        write(&old.join("pixi/plugin-y/activation.json"), "{}");
        write(&old.join("pixi/plugin-y/.pixi/envs/default/bin/python"), "");
        write(&old.join("pixi/cache/pkgs/p.conda"), "");
        write(&old.join("pixi/stamps/plugin-y.json"), "{}");
        write(&old.join("tools/uv/0.8.0/uv"), "");
        write(&old.join("jobs/0b6f5c1e-0000-4000-8000-000000000001/work/out.txt"), "done");
        #[cfg(unix)]
        std::os::unix::fs::symlink(old.join("uv/python/cpython-3.12.11"), old.join("uv/python/cpython-3.12")).unwrap();
        old
    }

    #[test]
    fn meno_s_folders_are_named_meno_in_the_system_s_own() {
        assert!(data_dir().is_some_and(|d| d.is_absolute() && d.ends_with(FOLDER)));
        // (on Windows in a folder of its own beside Meno itself)
        let local = if cfg!(windows) { Path::new(FOLDER).join(LOCAL_IN) } else { PathBuf::from(FOLDER) };
        assert!(local_data_dir().is_some_and(|d| d.is_absolute() && d.ends_with(&local)));
        // (and where Tauri has it, as this system's config says: tauri.windows.conf.json over tauri.conf.json on Windows)
        let read = |name: &str| -> serde_json::Value { serde_json::from_str(&fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join(name)).unwrap()).unwrap() };
        let over = |key: &str| {
            let win = cfg!(windows).then(|| read("tauri.windows.conf.json")["app"]["appDirectoriesOverride"][key].as_str().map(String::from)).flatten();
            win.or_else(|| read("tauri.conf.json")["app"]["appDirectoriesOverride"][key].as_str().map(String::from)).unwrap()
        };
        let under = |var: &str, key: &str| PathBuf::from(over(key).strip_prefix(var).unwrap().trim_start_matches('/'));
        assert_eq!(local_data_dir(), local_data_base().map(|b| b.join(under("$LOCALDATA", "localData"))));
        assert_eq!(data_dir(), data_base().map(|b| b.join(under("$DATA", "data"))));
        #[cfg(target_os = "macos")]
        {
            let home = PathBuf::from(std::env::var_os("HOME").unwrap());
            assert_eq!(data_dir(), Some(home.join("Library/Application Support/Meno")));
            assert_eq!(local_data_dir(), data_dir());
            assert_eq!(old_roaming(), None);
            let m = moves();
            assert_eq!(m.len(), 2);
            assert_eq!(m[0].from, home.join("Library/Application Support/com.kfchem.meno"));
            assert_eq!(m[1], Moved { from: home.join("Library/Caches/com.kfchem.meno"), to: home.join("Library/Caches/Meno"), leave: &[], only: Some(&["pdf", "ccd"]) });
        }
        #[cfg(windows)]
        {
            let local = PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap());
            assert_eq!(local_data_dir(), Some(local.join("Meno").join("data")));
            assert!(old_roaming().is_some_and(|r| r.ends_with(OLD_FOLDER)));
            let m = moves();
            assert_eq!(m.len(), 2);
            assert_eq!(m[0].leave, ["uv", "pixi", "tools", "jobs"]);
            assert_eq!(m[1].from, local.join(OLD_FOLDER));
            assert_eq!(m[1].to, local_data_dir().unwrap());
        }
    }

    #[test]
    fn the_tauri_config_keeps_meno_s_folders_where_this_finds_them() {
        let conf: serde_json::Value = serde_json::from_str(&fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json")).unwrap()).unwrap();
        assert_eq!(conf["identifier"], "dev.kfchem.meno");
        let o = &conf["app"]["appDirectoriesOverride"];
        assert_eq!(o["data"], "$DATA/Meno");
        assert_eq!(o["localData"], "$LOCALDATA/Meno");
        assert_eq!(o["config"], "$CONFIG/Meno");
        assert_eq!(o["cache"], "$CACHE/Meno");
        assert_eq!(o["log"], "$DATA/Meno/logs");
        // (on Windows the local data and caches beside Meno itself, in a folder of their own)
        let win: serde_json::Value = serde_json::from_str(&fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.windows.conf.json")).unwrap()).unwrap();
        let o = &win["app"]["appDirectoriesOverride"];
        assert_eq!(o["localData"], "$LOCALDATA/Meno/data");
        assert_eq!(o["cache"], "$LOCALDATA/Meno/data");
    }

    #[test]
    fn on_windows_the_page_may_write_nowhere_in_the_folder_meno_is_installed_in() {
        let read = |name: &str| fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join(name)).unwrap();
        let json = |name: &str| -> serde_json::Value { serde_json::from_str(&read(name)).unwrap() };
        // (installed for one user, as the installer installs it: the local folder's Meno - L standing for it, R for the roaming one)
        let nsi = read("windows/installer.nsi");
        assert!(nsi.contains(r#"StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}""#));
        // (and what its uninstaller takes away, asked to take Meno's data too: Meno's folders and the old ones, never the folder whole)
        for line in [r#"RmDir /r "$APPDATA\${PRODUCTNAME}""#, r#"RmDir /r "$LOCALAPPDATA\${PRODUCTNAME}\data""#, r#"RmDir "$LOCALAPPDATA\${PRODUCTNAME}""#, r#"RmDir /r "$APPDATA\com.kfchem.meno""#, r#"RmDir /r "$LOCALAPPDATA\com.kfchem.meno""#] {
            assert!(nsi.contains(line), "{line}");
        }
        assert!(!nsi.contains(r#"RmDir /r "$LOCALAPPDATA\${PRODUCTNAME}""#) && !nsi.contains(r#"RmDir /r "$INSTDIR""#));
        let installed = ["L/Meno/Meno.exe", "L/Meno/pdfium.dll", "L/Meno/uninstall.exe", "L/Meno/resources/plugins/rdkit/worker.py", "L/Meno/resources/plugins/rdkit/manifest.json"];
        // (Meno's folders as Windows has them: tauri.windows.conf.json over tauri.conf.json)
        let (conf, win) = (json("tauri.conf.json"), json("tauri.windows.conf.json"));
        let over = |key: &str| win["app"]["appDirectoriesOverride"][key].as_str().or(conf["app"]["appDirectoriesOverride"][key].as_str()).unwrap().to_string();
        let base = |p: String| p.replace("$LOCALDATA", "L").replace("$DATA", "R");
        let vars = [("$APPLOCALDATA", base(over("localData"))), ("$APPDATA", base(over("data"))), ("$RESOURCE", "L/Meno".to_string())];
        assert_eq!(vars[0].1, "L/Meno/data");
        let within = |scope: &str, path: &str| {
            let mut s = scope.to_string();
            for (v, to) in &vars {
                s = s.replace(v, to);
            }
            assert!(!s.contains('$'), "{scope}");
            match s.strip_suffix("/**/*") {
                Some(root) => path.starts_with(&format!("{root}/")),
                None => s == path,
            }
        };
        // (no file permission given unscoped, but the default one, which reads)
        for name in ["capabilities/main.json", "capabilities/default.json"] {
            let caps = json(name);
            let unscoped: Vec<&str> = caps["permissions"].as_array().unwrap().iter().filter_map(|p| p.as_str()).filter(|p| p.starts_with("fs:")).collect();
            assert!(unscoped.iter().all(|p| *p == "fs:default"), "{name}: {unscoped:?}");
        }
        let caps = json("capabilities/main.json");
        let mut writes = 0;
        for p in caps["permissions"].as_array().unwrap() {
            let Some(id) = p["identifier"].as_str() else { continue };
            // (only what reads: the resources, by design)
            if ["fs:allow-exists", "fs:allow-read-text-file", "fs:allow-read-file", "fs:allow-resource-read-recursive"].contains(&id) {
                continue;
            }
            writes += 1;
            for scope in p["allow"].as_array().into_iter().flatten().filter_map(|a| a["path"].as_str()) {
                for file in installed {
                    assert!(!within(scope, file), "{id} {scope} reaches {file}");
                }
            }
            // (and what is Meno's own reached)
            assert!(p["allow"].as_array().into_iter().flatten().filter_map(|a| a["path"].as_str()).any(|s| within(s, "L/Meno/data/uv/stamps/plugin-x.json")), "{id}");
        }
        assert_eq!(writes, 3);
    }

    #[test]
    fn an_old_folder_moves_whole_but_for_what_names_where_it_was() {
        let base = temp();
        let old = old_folder(&base);
        let new = base.join(FOLDER);
        let said = move_old(&[Moved { from: old.clone(), to: new.clone(), leave: &[], only: None }]);
        assert!(!old.exists(), "{said:?}");
        assert_eq!(names(&new), ["jobs", "logs", "pixi", "settings.json", "tools", "uv", "window.json"]);
        assert_eq!(fs::read_to_string(new.join("settings.json")).unwrap(), r#"{"granted":["python-env:x"]}"#);
        // (each environment made goes, to be set up again; its stamp, its plugin's files and the caches stay)
        assert_eq!(names(&new.join("uv/plugin-x")), ["files"]);
        assert!(new.join("uv/stamps/plugin-x.json").is_file());
        assert!(new.join("uv/cache/archive-v0/w/a.py").is_file());
        assert_eq!(names(&new.join("pixi/plugin-y")), ["pixi.toml"]);
        assert!(new.join("pixi/cache/pkgs/p.conda").is_file());
        assert!(new.join("tools/uv/0.8.0/uv").is_file());
        assert_eq!(fs::read_to_string(new.join("jobs/0b6f5c1e-0000-4000-8000-000000000001/work/out.txt")).unwrap(), "done");
        // (uv's Python kept, the link to where it was gone)
        assert_eq!(names(&new.join("uv/python")), ["cpython-3.12.11"]);
        assert!(said.iter().any(|s| s.starts_with("moved from ") && s.ends_with(": jobs, logs, pixi, settings.json, tools, uv, window.json")), "{said:?}");
        assert!(said.iter().any(|s| s.starts_with("removed ") && s.ends_with(", emptied")), "{said:?}");
        // (and done again, nothing to do)
        assert!(move_old(&[Moved { from: old, to: new, leave: &[], only: None }]).is_empty());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_move_cut_short_is_done_again_from_where_it_stopped_never_over_a_file_there() {
        let base = temp();
        let old = old_folder(&base);
        let new = base.join(FOLDER);
        // (stopped part way: the log and the window's place moved, a copy left beside)
        fs::create_dir_all(&new).unwrap();
        fs::rename(old.join("logs"), new.join("logs")).unwrap();
        write(&new.join(".moving-settings.json"), "half");
        write(&new.join("window.json"), r#"{"moved":true}"#);
        let m = Moved { from: old.clone(), to: new.clone(), leave: &[], only: None };
        move_old(std::slice::from_ref(&m));
        assert!(!old.exists());
        assert_eq!(names(&new), ["jobs", "logs", "pixi", "settings.json", "tools", "uv", "window.json"]);
        assert_eq!(fs::read_to_string(new.join("window.json")).unwrap(), r#"{"moved":true}"#);
        assert_eq!(fs::read_to_string(new.join("settings.json")).unwrap(), r#"{"granted":["python-env:x"]}"#);
        assert_eq!(fs::read_to_string(new.join("logs/meno.log")).unwrap(), "a line\n");
        // (then an earlier Meno started: its fresh settings, newer, and a job of its own - the settings left out, the job come across)
        std::thread::sleep(std::time::Duration::from_millis(20));
        write(&old.join("settings.json"), "{}");
        write(&old.join("jobs/0b6f5c1e-0000-4000-8000-000000000009/work/out.txt"), "later");
        let said = move_old(&[m]);
        assert!(!old.exists(), "{said:?}");
        assert_eq!(fs::read_to_string(new.join("settings.json")).unwrap(), r#"{"granted":["python-env:x"]}"#);
        assert!(new.join("jobs/0b6f5c1e-0000-4000-8000-000000000009/work/out.txt").is_file());
        assert!(said.iter().any(|s| s.contains("settings.json left out")), "{said:?}");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn where_it_cannot_be_renamed_it_is_copied_whole_and_a_copy_cut_short_goes() {
        COPY_ONLY.with(|c| c.set(true));
        let base = temp();
        let old = old_folder(&base);
        let new = base.join(FOLDER);
        // (cut short before: uv's copy half made beside, in Meno's folder and in a folder merged into)
        write(&new.join(".moving-uv/plugin-x/files/app/app"), "half");
        write(&new.join("jobs/.moving-0b6f5c1e-0000-4000-8000-000000000001/work/out.txt"), "half");
        let said = move_old(&[Moved { from: old.clone(), to: new.clone(), leave: &[], only: None }]);
        COPY_ONLY.with(|c| c.set(false));
        assert!(!old.exists(), "{said:?}");
        // (each there whole, under its own name; nothing left beside)
        assert_eq!(names(&new), ["jobs", "logs", "pixi", "settings.json", "tools", "uv", "window.json"]);
        assert_eq!(names(&new.join("jobs")), ["0b6f5c1e-0000-4000-8000-000000000001"]);
        assert_eq!(fs::read_to_string(new.join("jobs/0b6f5c1e-0000-4000-8000-000000000001/work/out.txt")).unwrap(), "done");
        assert_eq!(fs::read_to_string(new.join("uv/plugin-x/files/app/app")).unwrap(), "x");
        assert_eq!(names(&new.join("uv/plugin-x")), ["files"]);
        #[cfg(unix)]
        assert!(fs::symlink_metadata(new.join("uv/python/cpython-3.12")).is_err());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn what_another_takes_away_is_left_and_only_meno_s_caches_move() {
        let base = temp();
        // (the roaming folder, Windows: environments, tools and jobs left for roaming.rs)
        let old = old_folder(&base);
        let new = base.join(FOLDER);
        let said = move_old(&[Moved { from: old.clone(), to: new.clone(), leave: &["uv", "pixi", "tools", "jobs"], only: None }]);
        assert_eq!(names(&old), ["jobs", "pixi", "tools", "uv"]);
        // (said in the log, though the folder stays for what another takes away: the Windows pre-release check found no line for it)
        assert_eq!(said, [format!("moved from {} to {}: logs, settings.json, window.json", old.display(), new.display())]);
        assert!(moved_from(&said, &old) && !moved_from(&said, &new));
        assert_eq!(names(&new), ["logs", "settings.json", "window.json"]);
        // (a cache folder: Meno's own caches moved, the system's left)
        let caches = base.join("Caches");
        let oc = caches.join(OLD_FOLDER);
        write(&oc.join("pdf/a.bin"), "p");
        write(&oc.join("ccd/b.cif"), "c");
        write(&oc.join("WebKit/x"), "");
        move_old(&[Moved { from: oc.clone(), to: caches.join(FOLDER), leave: &[], only: Some(&["pdf", "ccd"]) }]);
        assert_eq!(names(&oc), ["WebKit"]);
        assert_eq!(names(&caches.join(FOLDER)), ["ccd", "pdf"]);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn the_webview_s_data_is_not_moved() {
        let base = temp();
        let old = base.join(OLD_FOLDER);
        write(&old.join("EBWebView/Default/Cache/x"), "");
        write(&old.join("pdf/a.bin"), "");
        let new = base.join(FOLDER);
        move_old(&[Moved { from: old.clone(), to: new.clone(), leave: &[], only: None }]);
        assert!(!old.exists());
        assert_eq!(names(&new), ["pdf"]);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn while_an_old_job_is_under_way_its_environments_tools_and_jobs_wait() {
        let base = temp();
        let old = old_folder(&base);
        let new = base.join(FOLDER);
        // (a job still running, as jobs.rs records one)
        let id = "0b6f5c1e-0000-4000-8000-000000000002";
        // (a job just asked for, its runner starting: waiting - as jobs.rs reads one with no record yet)
        let spec = serde_json::json!({ "plugin": "some", "name": "some", "program": "some", "args": [], "env": {}, "slots": 1, "created": crate::jobs::now_ms() });
        write(&old.join("jobs").join(id).join("job.json"), &spec.to_string());
        let m = Moved { from: old.clone(), to: new.clone(), leave: &[], only: None };
        let said = move_old(std::slice::from_ref(&m));
        assert!(said.iter().any(|s| s.contains("still wait or run")), "{said:?}");
        assert_eq!(names(&old), ["jobs", "pixi", "tools", "uv"]);
        assert_eq!(names(&new), ["logs", "settings.json", "window.json"]);
        // (uv's made again in the new folder meanwhile, then the job ended: the new one kept and left as it is, the old one gone; pixi's moved)
        write(&new.join("uv/plugin-x/venv/pyvenv.cfg"), "new");
        fs::remove_dir_all(old.join("jobs").join(id)).unwrap();
        move_old(&[m]);
        assert!(!old.exists());
        assert_eq!(fs::read_to_string(new.join("uv/plugin-x/venv/pyvenv.cfg")).unwrap(), "new");
        assert!(!new.join("uv/stamps").exists());
        assert_eq!(names(&new.join("pixi/plugin-y")), ["pixi.toml"]);
        assert!(new.join("jobs/0b6f5c1e-0000-4000-8000-000000000001").is_dir());
        let _ = fs::remove_dir_all(base);
    }
}
