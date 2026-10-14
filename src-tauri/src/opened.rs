//! Workspace files (.meno) opened from outside Meno - double-clicked, or
//! dropped on its icon (docs/FILE-IO.md, *Opening a workspace file from the
//! system*): on macOS the system tells the running Meno (`RunEvent::Opened`,
//! at its start as at any time after); on Windows each file comes as an
//! argument - to the Meno it starts, or, where Meno is running already, to
//! that one, the one started for it going again at once
//! (tauri-plugin-single-instance).
//!
//! Each is kept here until the page takes it (`opened_files`), so that one
//! opened as Meno starts - before the page is there to hear of it - is not
//! lost; the page is told there are some (`opened-files`) and takes them,
//! each in a tab, as Open opens a file - the page let read and write each,
//! as Open's dialog lets it a file picked there. Only workspace files: Meno
//! is the app for .meno alone.

use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// The workspace files opened from outside and not yet taken by the page.
#[derive(Default)]
pub struct Opened(Mutex<Vec<String>>);

/// Whether `path` is a workspace file's: `.meno`, in any case, a file there.
pub(crate) fn is_workspace(path: &Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case("meno")) && path.is_file()
}

/// The workspace files among a program's arguments: each a path to one - the
/// program's own path, and options, aside.
#[cfg(any(windows, test))]
pub fn workspaces_in<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_absolute() && is_workspace(p))
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// The workspace files among what the system asks Meno to open (macOS): each
/// a file's URL.
#[cfg(any(target_os = "macos", test))]
pub fn workspaces_of(urls: &[tauri::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|u| u.to_file_path().ok())
        .filter(|p| is_workspace(p))
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Workspace files to open: the page let read and write each - as Open's
/// dialog lets it a file picked there - kept, and the page told.
pub fn open(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    for p in &paths {
        if let Some(scope) = app.try_fs_scope() {
            let _ = scope.allow_file(p);
        }
        let _ = app.state::<tauri::scope::Scopes>().allow_file(p);
    }
    if let Ok(mut kept) = app.state::<Opened>().0.lock() {
        kept.extend(paths);
    }
    let _ = app.emit("opened-files", ());
}

/// Meno's window brought forward, as a file is opened in it from outside.
#[cfg(windows)]
pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The workspace files opened from outside that the page has not taken yet: taken.
#[tauri::command]
pub fn opened_files(state: tauri::State<'_, Opened>) -> Vec<String> {
    state.0.lock().map(|mut kept| std::mem::take(&mut *kept)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-opened-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn takes_only_workspace_files_among_a_program_s_arguments() {
        let dir = scratch();
        let file = |name: &str| {
            let p = dir.join(name);
            fs::write(&p, b"PK").unwrap();
            p.to_string_lossy().into_owned()
        };
        let (one, two, other) = (file("a.meno"), file("B.MENO"), file("c.mol"));
        let missing = dir.join("gone.meno").to_string_lossy().into_owned();
        let args = ["Meno.exe".into(), one.clone(), "-Embedding".into(), other, missing, "relative.meno".into(), two.clone()];
        assert_eq!(workspaces_in(args), vec![one, two]);
        // (the program's own path is never taken, even where it is one)
        assert_eq!(workspaces_in([file("Meno.meno")]), Vec::<String>::new());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn takes_only_workspace_files_the_system_asks_to_open() {
        let dir = scratch();
        let p = dir.join("w s.meno");
        fs::write(&p, b"PK").unwrap();
        let urls = [tauri::Url::from_file_path(&p).unwrap(), tauri::Url::parse("https://example.org/x.meno").unwrap(), tauri::Url::from_file_path(dir.join("x.sdf")).unwrap()];
        assert_eq!(workspaces_of(&urls), vec![p.to_string_lossy().into_owned()]);
        let _ = fs::remove_dir_all(dir);
    }
}
