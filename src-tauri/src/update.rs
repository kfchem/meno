//! Keeping Meno up to date, by itself: a newer Meno is looked for on the
//! project's GitHub Releases, downloaded in the background, and installed
//! as Meno quits - or when the user asks to restart into it.
//!
//! It goes on the network only as Meno's network lets it (net.rs): as a
//! task with the "app-update" purpose - refused when Meno is offline, or
//! until the user has allowed it - whose requests go through Meno's proxy,
//! to the hosts its consent named alone, so that each connection is shown
//! as it is made and kept on the record.
//! The download is checked against the signing key in tauri.conf.json
//! before anything is installed. A development build, and a Meno Windows
//! started for Office, neither look nor install.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::net::Net;

/// The purpose Meno's network knows updating by.
pub const PURPOSE: &str = "app-update";

/// Where the updater is, as the page shows it ("update:state").
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    /// This Meno's version.
    pub current: String,
    /// "idle", "checking", "downloading", "ready" (installed as Meno quits),
    /// "current" (nothing newer), "failed", or "unavailable" (this Meno
    /// does not update itself).
    pub phase: &'static str,
    /// The newer version, once one is found.
    pub version: Option<String>,
    /// What its release says about it.
    pub notes: Option<String>,
    /// When GitHub was last asked (milliseconds since the epoch).
    pub checked: Option<u64>,
    /// Why the last look failed.
    pub error: Option<String>,
}

/// The updater's state, managed by the app.
pub struct Updates {
    state: Mutex<UpdateState>,
    /// A newer Meno, downloaded and checked, waiting to be installed.
    ready: Mutex<Option<(Update, Vec<u8>)>>,
    /// Whether a look is under way.
    busy: AtomicBool,
    /// Whether Meno starts again once the update is installed.
    restart: AtomicBool,
}

impl Updates {
    pub fn new(current: String) -> Self {
        let phase = if updates_itself() { "idle" } else { "unavailable" };
        Self {
            state: Mutex::new(UpdateState { current, phase, version: None, notes: None, checked: None, error: None }),
            ready: Mutex::new(None),
            busy: AtomicBool::new(false),
            restart: AtomicBool::new(false),
        }
    }
}

/// Whether this Meno updates itself: not a development build, and not one
/// Windows started for Office (it goes again as the document is done).
fn updates_itself() -> bool {
    #[cfg(windows)]
    if crate::ole::started_for_office() {
        return false;
    }
    !cfg!(debug_assertions)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Changes the state, and tells the page.
fn set(app: &AppHandle, change: impl FnOnce(&mut UpdateState)) -> UpdateState {
    let updates = app.state::<Updates>();
    let state = {
        let mut s = updates.state.lock().unwrap();
        change(&mut s);
        s.clone()
    };
    let _ = app.emit("update:state", state.clone());
    state
}

#[tauri::command]
pub fn update_state(app: AppHandle) -> UpdateState {
    app.state::<Updates>().state.lock().unwrap().clone()
}

/// Asks GitHub for a newer Meno, through Meno's network - to the hosts the
/// consent to keep Meno up to date named (`hosts`, lib/update.ts) alone -
/// and downloads it when there is one, to be installed as Meno quits.
#[tauri::command]
pub async fn update_check(app: AppHandle, hosts: Option<Vec<String>>) -> UpdateState {
    let updates = app.state::<Updates>();
    if !updates_itself() || updates.ready.lock().unwrap().is_some() || updates.busy.swap(true, Ordering::SeqCst) {
        return updates.state.lock().unwrap().clone();
    }
    let state = look(&app, hosts).await;
    app.state::<Updates>().busy.store(false, Ordering::SeqCst);
    state
}

async fn look(app: &AppHandle, hosts: Option<Vec<String>>) -> UpdateState {
    let failed = |app: &AppHandle, e: String| {
        set(app, |s| {
            s.phase = "failed";
            s.error = Some(e);
        })
    };
    // (refused here when Meno is offline, or updating is not allowed)
    let task = match app.state::<Net>().begin(PURPOSE, "Keeping Meno up to date", hosts) {
        Ok(task) => task,
        Err(e) => return failed(app, e),
    };
    set(app, |s| {
        s.phase = "checking";
        s.error = None;
    });
    let Some(proxy) = task.proxy_url().and_then(|p| tauri::Url::parse(&p).ok()) else {
        return failed(app, "Meno's network is not up".into());
    };
    let updater = match app.updater_builder().proxy(proxy).build() {
        Ok(updater) => updater,
        Err(e) => return failed(app, e.to_string()),
    };
    let found = updater.check().await;
    set(app, |s| s.checked = Some(now_ms()));
    let update = match found {
        Ok(Some(update)) => update,
        // (nothing newer - or no release published at all yet: the endpoint
        // answered, with nothing to offer)
        Ok(None) | Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
            task.finish(true);
            return set(app, |s| s.phase = "current");
        }
        Err(e) => {
            task.finish(false);
            return failed(app, e.to_string());
        }
    };
    set(app, |s| {
        s.phase = "downloading";
        s.version = Some(update.version.clone());
        s.notes = update.body.clone();
    });
    // (checked against the signing key as it is downloaded)
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            task.finish(true);
            *app.state::<Updates>().ready.lock().unwrap() = Some((update, bytes));
            set(app, |s| s.phase = "ready")
        }
        Err(e) => {
            task.finish(false);
            failed(app, e.to_string())
        }
    }
}

/// The user asks to restart into the update downloaded: it is installed as
/// Meno quits, and Meno started again after it. (The page then closes the
/// window, as a quit - so that unsaved work is asked about first.)
#[tauri::command]
pub fn update_restart_after_quit(app: AppHandle) {
    app.state::<Updates>().restart.store(true, Ordering::SeqCst);
}

/// As Meno quits: the update downloaded, if there is one, is installed -
/// quietly - and Meno started again only if the user asked for that.
pub fn install_on_exit(app: &AppHandle) {
    let updates = app.state::<Updates>();
    if !updates_itself() {
        return;
    }
    let Some((update, bytes)) = updates.ready.lock().unwrap().take() else { return };
    let restart = updates.restart.load(Ordering::SeqCst);
    // (on Windows the installer is started and this process ends here)
    if let Err(e) = update.restart_after_install(restart).install(bytes) {
        crate::logfile::logged!("the update could not be installed: {e}");
        return;
    }
    if restart {
        app.restart();
    }
}

/// What updating leaves behind, taken away (Windows). The updater writes
/// the installer into a folder of its own in the temporary directory -
/// "Meno-0.1.2-updater-sAjw4i", holding "Meno-0.1.2-installer.exe" - and
/// Meno ends at once to let it run, so nothing removes it: some 17 MB an
/// update. A Meno that updates itself clears those folders as it starts:
/// only folders named so, holding nothing but that installer, and only once
/// they are some minutes old.
#[cfg(windows)]
pub fn tidy_after_updates(app: &AppHandle) {
    if !updates_itself() {
        return;
    }
    let name = app.package_info().name.clone();
    std::thread::spawn(move || tidy_in(&std::env::temp_dir(), &name, LEFT_FOR));
}

/// How long an update's folder is left alone: its installer may still be
/// running, or about to be started by another Meno.
#[cfg(windows)]
const LEFT_FOR: std::time::Duration = std::time::Duration::from_secs(10 * 60);

/// Takes away, from `dir`, the folders updates of `app` left there that are
/// older than `older_than`. What cannot be removed (an installer still
/// running) stays for another time.
#[cfg(windows)]
fn tidy_in(dir: &std::path::Path, app: &str, older_than: std::time::Duration) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(version) = name.to_str().and_then(|n| left_by_an_update(n, app)) else { continue };
        let path = entry.path();
        // (a folder, not a link to one)
        let Ok(meta) = std::fs::symlink_metadata(&path) else { continue };
        let age = meta.modified().ok().map(|m| m.elapsed().unwrap_or_default());
        if !meta.is_dir() || !age.is_some_and(|age| age >= older_than) {
            continue;
        }
        let installers = [format!("{app}-{version}-installer.exe"), format!("{app}-{version}-installer.msi")];
        let Ok(inside) = std::fs::read_dir(&path) else { continue };
        let inside: Vec<_> = inside.flatten().collect();
        let only_the_installer = inside.iter().all(|f| {
            f.file_type().is_ok_and(|t| t.is_file()) && installers.iter().any(|i| f.file_name() == i.as_str())
        });
        if !only_the_installer {
            continue;
        }
        for f in &inside {
            let _ = std::fs::remove_file(f.path());
        }
        let _ = std::fs::remove_dir(&path);
    }
}

/// The version an update's folder was made for, when `name` is one:
/// "<app>-<version>-updater-<random letters and digits>".
#[cfg(windows)]
fn left_by_an_update<'a>(name: &'a str, app: &str) -> Option<&'a str> {
    let rest = name.strip_prefix(app)?.strip_prefix('-')?;
    let (version, random) = rest.rsplit_once("-updater-")?;
    let a_version = version.starts_with(|c: char| c.is_ascii_digit())
        && version.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'));
    let random = !random.is_empty() && random.chars().all(|c| c.is_ascii_alphanumeric());
    (a_version && random).then_some(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_development_build_does_not_update_itself() {
        // (tests are built with debug assertions, as a development build is)
        let updates = Updates::new("0.1.0".into());
        let state = updates.state.lock().unwrap();
        assert_eq!((state.phase, state.current.as_str()), ("unavailable", "0.1.0"));
        assert!(updates.ready.lock().unwrap().is_none());
    }

    #[cfg(windows)]
    #[test]
    fn an_update_folder_is_known_by_its_name() {
        assert_eq!(left_by_an_update("Meno-0.1.2-updater-sAjw4i", "Meno"), Some("0.1.2"));
        assert_eq!(left_by_an_update("Meno-1.0.0-beta.1-updater-AbC123", "Meno"), Some("1.0.0-beta.1"));
        for name in [
            "Meno-0.1.2-updater-",
            "Meno-updater-sAjw4i",
            "Meno-x-updater-sAjw4i",
            "Menos-0.1.2-updater-sAjw4i",
            "Meno-0.1.2-updater-sAj.w4",
            "Meno-0.1.2",
            "Meno",
        ] {
            assert_eq!(left_by_an_update(name, "Meno"), None, "{name}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn what_updates_left_is_taken_away_and_nothing_else() {
        use std::time::Duration;
        let dir = std::env::temp_dir().join(format!("meno-tidy-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let make = |folder: &str, files: &[&str]| {
            let path = dir.join(folder);
            std::fs::create_dir(&path).unwrap();
            for f in files {
                std::fs::write(path.join(f), b"MZ").unwrap();
            }
            path
        };
        let left = make("Meno-0.1.2-updater-sAjw4i", &["Meno-0.1.2-installer.exe"]);
        let emptied = make("Meno-0.1.3-updater-AbC123", &[]);
        let more = make("Meno-0.1.2-updater-5fQ9nM", &["Meno-0.1.2-installer.exe", "notes.txt"]);
        let another = make("Meno-0.1.2-updater-Zz9yX8", &["Meno-0.1.1-installer.exe"]);
        let other_app = make("Other-0.1.2-updater-sAjw4i", &["Other-0.1.2-installer.exe"]);
        let not_an_update = make("Meno-data", &[]);

        // (just made: left alone for now)
        tidy_in(&dir, "Meno", Duration::from_secs(3600));
        assert!(left.exists() && emptied.exists());

        tidy_in(&dir, "Meno", Duration::ZERO);
        assert!(!left.exists() && !emptied.exists());
        for kept in [&more, &another, &other_app, &not_an_update] {
            assert!(kept.exists(), "{}", kept.display());
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
