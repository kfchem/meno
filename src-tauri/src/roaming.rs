//! What Meno kept in the roaming application data folder before 0.1.13, on
//! Windows (docs/ARCHITECTURE.md, *Where Meno keeps what*): the Python
//! environments uv and pixi made, with what plugins downloaded into them,
//! the tools that made them, and jobs. Since #315 they are made in the local
//! one (lib.rs `local_data_dir`), and nothing uses the old ones any more;
//! left, they are room never given back - a plugin's environment with what
//! it downloaded can be most of a gigabyte - and a domain may copy them to
//! a server and back at each sign-in.
//!
//! They are taken away by name only - `uv`, `pixi`, `tools` and `jobs`,
//! never whatever else is in the folder - at each start while they are there
//! ([`tidy`]), and a plugin's own with it as it is removed
//! ([`remove_plugin_env`]). While a job there still waits or runs, all of
//! them are left, as its program may be using its environment; jobs kept
//! there - finished, their files still a step's - are left too, and the
//! log says so. What else was there - the settings, the log, the window's
//! place - moves into Meno's roaming folder at a start (folders.rs), and
//! the old folder goes once nothing is left in it. On a Mac and on Linux
//! the two folders are one, and there is nothing to do.

use std::fs;
use std::path::{Path, PathBuf};

/// The folders Meno made in the roaming folder that now live in the local one.
const MOVED: [&str; 3] = ["uv", "pixi", "tools"];
/// The jobs' folder there.
const JOBS: &str = "jobs";

/// The roaming application data folder a Meno before 0.1.14 kept its settings in (Windows): none elsewhere.
fn old_folder() -> Option<PathBuf> {
    crate::folders::old_roaming()
}

/// The folders in the roaming folder taken away, in the background, at a start: those Meno no longer uses.
pub fn tidy() {
    let Some(old) = old_folder().filter(|old| real_folder(old)) else { return };
    std::thread::spawn(move || {
        for said in tidy_in(&old) {
            crate::logfile::logged!("{said}");
        }
    });
}

/// Whether `path` is a folder itself, not a link to one.
fn real_folder(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_dir())
}

/// A folder taken away, said: what was done, or why not.
fn take_away(path: &Path) -> String {
    match fs::remove_dir_all(path) {
        Ok(()) => format!("removed {}, no longer used", path.display()),
        Err(e) => format!("could not remove {} ({e}): tried again at the next start", path.display()),
    }
}

/// Takes away, from the roaming folder `old`, the folders Meno made there
/// and no longer uses - by their names only - and says what it did, a line
/// each: nothing at all while a job there waits or runs; its jobs' folder
/// only where it holds no job.
pub fn tidy_in(old: &Path) -> Vec<String> {
    let jobs = old.join(JOBS);
    let mut said = Vec::new();
    let under_way = if real_folder(&jobs) { crate::jobs::under_way(&jobs) } else { 0 };
    if under_way > 0 {
        said.push(format!("{under_way} job(s) in {} still wait or run: its environments and jobs are left until they have ended", old.display()));
        return said;
    }
    for name in MOVED {
        let path = old.join(name);
        if real_folder(&path) {
            said.push(take_away(&path));
        }
    }
    if real_folder(&jobs) {
        let kept = jobs_kept(&jobs);
        if kept == 0 {
            said.push(take_away(&jobs));
        } else {
            said.push(format!("{kept} finished job(s) kept in {}: left there, with their files", jobs.display()));
        }
    }
    // (and the folder itself, once nothing is left in it: the rest moved at the start, folders.rs)
    if fs::read_dir(old).is_ok_and(|mut e| e.next().is_none()) && fs::remove_dir(old).is_ok() {
        said.push(format!("removed {}, no longer used", old.display()));
    }
    said
}

/// How many jobs a jobs' folder holds: each folder named as Meno names a job.
fn jobs_kept(jobs: &Path) -> usize {
    let Ok(entries) = fs::read_dir(jobs) else { return 0 };
    entries
        .flatten()
        .filter(|e| e.file_name().to_str().is_some_and(crate::jobs::job_id_ok) && real_folder(&e.path()))
        .count()
}

/// A plugin's environment's folder (`rel`: lib.rs `plugin_env_dir`) and its
/// record of being set up (`stamp`), as they were in the roaming folder,
/// taken away as the plugin is removed - unless a job there still waits or
/// runs, whose program may be using it. What could not be taken away is
/// said in the log, and goes with the rest at a later start ([`tidy`]).
pub fn remove_plugin_env(rel: &Path, stamp: &Path) {
    let Some(old) = old_folder().filter(|old| real_folder(old)) else { return };
    for said in remove_plugin_env_in(&old, rel, stamp) {
        crate::logfile::logged!("{said}");
    }
}

pub fn remove_plugin_env_in(old: &Path, rel: &Path, stamp: &Path) -> Vec<String> {
    let jobs = old.join(JOBS);
    if real_folder(&jobs) && crate::jobs::under_way(&jobs) > 0 {
        return vec![format!("{} left: a job in {} still waits or runs", old.join(rel).display(), old.display())];
    }
    let mut said = Vec::new();
    let dir = old.join(rel);
    if real_folder(&dir) {
        said.push(take_away(&dir));
    }
    let stamp = old.join(stamp);
    if stamp.is_file() {
        if let Err(e) = fs::remove_file(&stamp) {
            said.push(format!("could not remove {} ({e})", stamp.display()));
        }
    }
    said
}

#[cfg(test)]
mod tests {
    use super::*;

    // (a roaming folder as Meno 0.1.12 left it on Windows: its settings, its log, an environment with a plugin's files, tools, jobs)
    fn roaming() -> PathBuf {
        let old = std::env::temp_dir().join(format!("meno-roaming-{}", uuid::Uuid::new_v4()));
        for dir in ["uv/plugin-big/venv", "uv/plugin-big/files/app", "uv/stamps", "uv/python", "pixi/plugin-other", "tools/uv/0.8.0", "logs"] {
            fs::create_dir_all(old.join(dir)).unwrap();
        }
        fs::write(old.join("uv/plugin-big/files/app/app.exe"), b"x").unwrap();
        fs::write(old.join("uv/stamps/plugin-big.json"), b"{}").unwrap();
        fs::write(old.join("settings.json"), b"{}").unwrap();
        fs::write(old.join("logs/meno.log"), b"").unwrap();
        fs::write(old.join("window.json"), b"{}").unwrap();
        old
    }

    // (a job's folder, as Meno writes one: its spec, and its record in `state`)
    fn job(old: &Path, state: &str) -> PathBuf {
        let dir = old.join("jobs").join(uuid::Uuid::new_v4().hyphenated().to_string());
        fs::create_dir_all(dir.join("work")).unwrap();
        let spec = serde_json::json!({
            "plugin": "some", "name": "some", "program": "some", "args": [], "env": {}, "slots": 1,
            "created": crate::jobs::now_ms(),
        });
        fs::write(dir.join("job.json"), spec.to_string()).unwrap();
        fs::write(dir.join("state.json"), serde_json::json!({ "state": state, "created": crate::jobs::now_ms() }).to_string()).unwrap();
        dir
    }

    // (what is left in the folder, by name)
    fn left(old: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(old).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        names
    }

    #[test]
    fn takes_away_what_moved_and_leaves_the_rest() {
        let old = roaming();
        fs::create_dir_all(old.join("jobs")).unwrap();
        // (something of another's in the folder, named as none of Meno's)
        fs::create_dir_all(old.join("uv-mine")).unwrap();
        let said = tidy_in(&old);
        assert_eq!(left(&old), ["logs", "settings.json", "uv-mine", "window.json"]);
        assert_eq!(said.len(), 4, "{said:?}");
        assert!(said.iter().all(|s| s.starts_with("removed ")));
        // (again: nothing left to do)
        assert!(tidy_in(&old).is_empty());
        let _ = fs::remove_dir_all(old);
    }

    #[test]
    fn leaves_everything_while_a_job_there_waits() {
        let old = roaming();
        job(&old, "done");
        // (no record yet, just asked for: waiting, its runner starting)
        let waiting = job(&old, "waiting");
        fs::remove_file(waiting.join("state.json")).unwrap();
        let said = tidy_in(&old);
        assert_eq!(left(&old), ["jobs", "logs", "pixi", "settings.json", "tools", "uv", "window.json"]);
        assert_eq!(said.len(), 1);
        assert!(said[0].contains("still wait or run"), "{}", said[0]);
        assert!(remove_plugin_env_in(&old, Path::new("uv/plugin-big"), Path::new("uv/stamps/plugin-big.json"))[0].contains("left"));
        assert!(old.join("uv/plugin-big").exists());
        let _ = fs::remove_dir_all(old);
    }

    #[test]
    fn keeps_finished_jobs_and_says_so() {
        let old = roaming();
        job(&old, "done");
        job(&old, "failed");
        // (a job whose runner went without a word, the computer restarted: gone, finished)
        job(&old, "running");
        let said = tidy_in(&old);
        assert_eq!(left(&old), ["jobs", "logs", "settings.json", "window.json"]);
        assert!(said.last().unwrap().starts_with("3 finished job(s) kept in "), "{said:?}");
        assert_eq!(fs::read_dir(old.join("jobs")).unwrap().count(), 3);
        let _ = fs::remove_dir_all(old);
    }

    #[test]
    fn a_plugin_removed_takes_its_old_environment_too() {
        let old = roaming();
        let said = remove_plugin_env_in(&old, Path::new("uv/plugin-big"), Path::new("uv/stamps/plugin-big.json"));
        assert_eq!(said.len(), 1, "{said:?}");
        assert!(!old.join("uv/plugin-big").exists());
        assert!(!old.join("uv/stamps/plugin-big.json").exists());
        // (the others' left)
        assert!(old.join("pixi/plugin-other").exists() && old.join("uv/python").exists());
        // (none there: nothing to say)
        assert!(remove_plugin_env_in(&old, Path::new("pixi/plugin-none"), Path::new("pixi/stamps/plugin-none.json")).is_empty());
        let _ = fs::remove_dir_all(old);
    }

    #[test]
    fn the_folder_goes_once_nothing_is_left_in_it() {
        let old = roaming();
        // (its settings, log and window's place moved at the start: folders.rs)
        for name in ["settings.json", "window.json"] {
            fs::remove_file(old.join(name)).unwrap();
        }
        fs::remove_dir_all(old.join("logs")).unwrap();
        fs::create_dir_all(old.join("jobs")).unwrap();
        let said = tidy_in(&old);
        assert!(!old.exists(), "{said:?}");
        assert_eq!(said.last().unwrap(), &format!("removed {}, no longer used", old.display()));
    }

    #[cfg(unix)]
    #[test]
    fn follows_no_link() {
        let old = roaming();
        let elsewhere = std::env::temp_dir().join(format!("meno-elsewhere-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&elsewhere).unwrap();
        fs::write(elsewhere.join("keep.txt"), b"x").unwrap();
        fs::remove_dir_all(old.join("tools")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, old.join("tools")).unwrap();
        tidy_in(&old);
        assert!(elsewhere.join("keep.txt").exists());
        let _ = fs::remove_dir_all(old);
        let _ = fs::remove_dir_all(elsewhere);
    }
}
