//! A chemist's document written where they chose - a workspace saved, a
//! file exported, a picture, a PDF made - whole, or not at all
//! (docs/FILE-IO.md, *Save and Export*). It is written beside where it
//! goes first, under a hidden name of its own, made to reach the disk, and
//! only then put in place, in one step: a save that fails part way - the
//! disk full, the drive taken away - leaves the file that was there as it
//! was, and nothing of its own behind; Meno stopped as it writes, the file
//! there is still as it was, its hidden copy perhaps left beside it.
//!
//! The page may write only where it could have written through the file
//! system plugin: where Open's or Save's dialog let it, a file dropped, or
//! one opened from outside Meno (opened.rs) - the plugin's own scope.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

/// How many links are followed to the file a document is written to, as a system follows them.
const MOST_LINKS: usize = 40;
/// How much of a file's name its hidden copy's name takes: a long name and the rest stay under the systems' 255.
const NAME_MOST: usize = 64;

/// A document's bytes, sent as they are, written to the file named by the
/// `path` header (its percent-encoded UTF-8) - whole, or not at all.
#[tauri::command]
pub async fn write_document(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("path")
        .and_then(|p| p.to_str().ok())
        .and_then(percent_decoded)
        .map(PathBuf::from)
        .ok_or("no file was named to write to")?;
    let bytes = bytes_of(request.body()).ok_or("a document is sent as its bytes")?;
    // (as the plugin takes a path: whole, and going up nowhere)
    if !path.is_absolute() || path.components().any(|c| c == Component::ParentDir) {
        return Err(format!("{} is not a whole path", path.display()));
    }
    let target = real_target(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !app.try_fs_scope().is_some_and(|scope| may_write(&path, &target, |p| scope.is_allowed(p))) {
        return Err(format!("Meno may not write to {}", path.display()));
    }
    tauri::async_runtime::spawn_blocking(move || write_whole(&target, &bytes).map_err(|e| format!("{}: {e}", path.display())))
        .await
        .map_err(|e| e.to_string())?
}

/// Whether the page may have `path` written - `target`, the file at the end
/// of its links - where `allowed` is the file system plugin's scope: where
/// the plugin would let the page write itself. The file named; or, where it
/// is a link, the file it points at, in its folder as it really is.
fn may_write(path: &Path, target: &Path, allowed: impl Fn(&Path) -> bool) -> bool {
    allowed(path) || (target != path && in_its_folder(target).is_ok_and(|t| allowed(&t)))
}

/// The bytes sent: as they are, or - where the window could send them only
/// as JSON, as the file system plugin also takes them - a list of numbers,
/// each a byte; none where they are neither.
fn bytes_of(body: &tauri::ipc::InvokeBody) -> Option<Vec<u8>> {
    match body {
        tauri::ipc::InvokeBody::Raw(bytes) => Some(bytes.clone()),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(list)) => list.iter().map(|v| v.as_u64().and_then(|b| u8::try_from(b).ok())).collect(),
        _ => None,
    }
}

/// `bytes` written to `path` - whole, or not at all (`replace_with`).
pub(crate) fn write_whole(path: &Path, bytes: &[u8]) -> io::Result<()> {
    replace_with(path, |file| file.write_all(bytes))
}

/// The file at `path` - or, where `path` is a link, the file it points at -
/// made what `write` writes, or left as it was: `write` writes to a hidden
/// file beside it, which reaches the disk and then takes its place in one
/// step, keeping its permissions. Where anything fails, the file is as it
/// was, the hidden one is gone, and why is said. A file that could not have
/// been written to - kept read-only, a folder - is not written over.
pub(crate) fn replace_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    let target = real_target(path)?;
    let (Some(dir), Some(name)) = (target.parent().filter(|d| !d.as_os_str().is_empty()), target.file_name()) else {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "it names no file in a folder"));
    };
    let before = match fs::metadata(&target) {
        Ok(m) => Some(m),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e),
    };
    if before.is_some() {
        // (opened as writing it in place would have opened it, and closed again: nothing changed)
        OpenOptions::new().write(true).open(&target)?;
    }
    let name: String = name.to_string_lossy().chars().take(NAME_MOST).collect();
    let part = dir.join(format!(".{name}.{}.part", uuid::Uuid::new_v4()));
    let placed = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&part)?;
        write(&mut file)?;
        #[cfg(unix)]
        if let Some(m) = &before {
            file.set_permissions(m.permissions())?;
        }
        file.sync_all()?;
        drop(file);
        fs::rename(&part, &target)
    })();
    if let Err(e) = placed {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    #[cfg(unix)]
    if let Err(e) = sync_dir(dir) {
        // (the file itself is on the disk; some file systems - a share, say - keep no folder to sync)
        crate::logfile::logged!("a saved file's folder could not be synced: {e}");
    }
    Ok(())
}

/// A folder's entries made to reach the disk: a file just put in place in it stays there.
#[cfg(unix)]
fn sync_dir(dir: &Path) -> io::Result<()> {
    File::open(dir)?.sync_all()
}

/// Where a document named `path` is written: `path`, or - where it is a
/// link - the file at the end of its links, there or not.
fn real_target(path: &Path) -> io::Result<PathBuf> {
    let mut at = path.to_path_buf();
    for _ in 0..MOST_LINKS {
        match fs::symlink_metadata(&at) {
            Ok(m) if m.file_type().is_symlink() => {
                let to = fs::read_link(&at)?;
                at = match at.parent() {
                    Some(dir) if to.is_relative() => dir.join(to),
                    _ => to,
                };
            }
            Ok(_) => return Ok(at),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(at),
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::other("it is a link that leads round in circles"))
}

/// `path` in its folder as it really is: no link, nor a step up, on the way to it.
fn in_its_folder(path: &Path) -> io::Result<PathBuf> {
    match (path.parent(), path.file_name()) {
        (Some(dir), Some(name)) => Ok(fs::canonicalize(dir)?.join(name)),
        _ => Err(io::Error::new(io::ErrorKind::InvalidInput, "it names no file in a folder")),
    }
}

/// A percent-encoded UTF-8 text (as `encodeURIComponent` gives it), as it was; none where it is not one.
fn percent_decoded(text: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(text.len());
    let mut rest = text.bytes();
    while let Some(b) = rest.next() {
        if b == b'%' {
            let hex = [rest.next()?, rest.next()?];
            bytes.push(u8::from_str_radix(std::str::from_utf8(&hex).ok()?, 16).ok()?);
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-savefile-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The names in `dir`, sorted: what a save left there.
    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        names
    }

    /// Writes `n` bytes of `bytes`, then fails as a full disk does.
    fn failing_after(bytes: &[u8], n: usize) -> impl FnOnce(&mut File) -> io::Result<()> + '_ {
        move |file| {
            file.write_all(&bytes[..n])?;
            Err(io::Error::other("no space left (as a test has it)"))
        }
    }

    /// How a document was written before: opened over the file there, emptied, then written - as tauri-plugin-fs's writeFile does.
    fn written_in_place(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
        let mut file = OpenOptions::new().write(true).create(true).truncate(true).open(path)?;
        write(&mut file)
    }

    /// What writes a file's bytes, handed to a way of writing it.
    type Writing<'a> = Box<dyn FnOnce(&mut File) -> io::Result<()> + 'a>;

    /// A save that fails after `n` bytes, by `how`: whether the file there was left byte for byte as it was, with nothing beside it, and the failure said.
    fn survives(how: fn(&Path, Writing<'_>) -> io::Result<()>, n: usize) -> bool {
        let dir = scratch();
        let path = dir.join("work.meno");
        let old = b"PK\x03\x04 the workspace saved before".repeat(100);
        fs::write(&path, &old).unwrap();
        let new = vec![7u8; 10_000];
        let failed = how(&path, Box::new(failing_after(&new, n))).is_err();
        let kept = fs::read(&path).unwrap() == old && names(&dir) == ["work.meno"];
        fs::remove_dir_all(&dir).unwrap();
        failed && kept
    }

    #[test]
    fn a_save_that_fails_part_way_leaves_the_file_as_it_was_and_nothing_beside_it() {
        for n in [0, 1, 4096, 9_999] {
            assert!(survives(|p, w| replace_with(p, w), n), "failed after {n} bytes");
        }
    }

    #[test]
    fn written_in_place_as_before_the_same_failure_loses_the_file() {
        // (the check above, of the way a document was written before: it fails it, after any number of bytes)
        for n in [0, 1, 4096, 9_999] {
            assert!(!survives(|p, w| written_in_place(p, w), n), "after {n} bytes");
        }
    }

    #[test]
    fn a_save_that_fails_where_there_was_no_file_leaves_none() {
        let dir = scratch();
        let path = dir.join("new.meno");
        let new = vec![1u8; 100];
        assert!(replace_with(&path, failing_after(&new, 50)).is_err());
        assert!(names(&dir).is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_save_writes_the_new_bytes_whole_over_the_old() {
        let dir = scratch();
        let path = dir.join("work.meno");
        fs::write(&path, vec![9u8; 50_000]).unwrap();
        let new: Vec<u8> = (0..20_000u32).map(|i| (i % 251) as u8).collect();
        write_whole(&path, &new).unwrap();
        assert_eq!(fs::read(&path).unwrap(), new);
        assert_eq!(names(&dir), ["work.meno"]);
        // (and a new file, where there was none)
        write_whole(&dir.join("other.sdf"), b"x\n$$$$\n").unwrap();
        assert_eq!(fs::read(dir.join("other.sdf")).unwrap(), b"x\n$$$$\n");
        assert_eq!(names(&dir), ["other.sdf", "work.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_save_keeps_the_files_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch();
        let path = dir.join("shared.meno");
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        write_whole(&path, b"new").unwrap();
        assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o7777, 0o640);
        assert_eq!(fs::read(&path).unwrap(), b"new");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o604)).unwrap();
        write_whole(&path, b"newer").unwrap();
        assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o7777, 0o604);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_file_kept_read_only_is_not_written_over() {
        use std::os::unix::fs::PermissionsExt;
        // (as root everything may be written: nothing to see)
        // SAFETY: geteuid takes nothing and cannot fail.
        if unsafe { libc::geteuid() } == 0 {
            return;
        }
        let dir = scratch();
        let path = dir.join("kept.meno");
        fs::write(&path, b"kept").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
        assert!(write_whole(&path, b"new").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"kept");
        assert_eq!(names(&dir), ["kept.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_folder_is_not_written_over() {
        let dir = scratch();
        let path = dir.join("folder.meno");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("inside"), b"inside").unwrap();
        assert!(write_whole(&path, b"new").is_err());
        assert_eq!(fs::read(path.join("inside")).unwrap(), b"inside");
        assert_eq!(names(&dir), ["folder.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_written_through_and_stays_a_link() {
        let dir = scratch();
        fs::create_dir(dir.join("real")).unwrap();
        let real = dir.join("real").join("work.meno");
        fs::write(&real, b"old").unwrap();
        // (one relative, one whole, one to a link)
        std::os::unix::fs::symlink("real/work.meno", dir.join("near.meno")).unwrap();
        std::os::unix::fs::symlink(&real, dir.join("whole.meno")).unwrap();
        std::os::unix::fs::symlink("near.meno", dir.join("twice.meno")).unwrap();
        for (i, link) in ["near.meno", "whole.meno", "twice.meno"].iter().enumerate() {
            let new = format!("new {i}");
            write_whole(&dir.join(link), new.as_bytes()).unwrap();
            assert!(fs::symlink_metadata(dir.join(link)).unwrap().file_type().is_symlink(), "{link}");
            assert_eq!(fs::read(&real).unwrap(), new.as_bytes(), "{link}");
        }
        assert_eq!(names(&dir), ["near.meno", "real", "twice.meno", "whole.meno"]);
        assert_eq!(names(&dir.join("real")), ["work.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_link_to_no_file_yet_makes_the_file_it_points_at() {
        let dir = scratch();
        std::os::unix::fs::symlink("made.meno", dir.join("link.meno")).unwrap();
        write_whole(&dir.join("link.meno"), b"made").unwrap();
        assert!(fs::symlink_metadata(dir.join("link.meno")).unwrap().file_type().is_symlink());
        assert_eq!(fs::read(dir.join("made.meno")).unwrap(), b"made");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_link_round_in_circles_is_refused() {
        let dir = scratch();
        std::os::unix::fs::symlink("b.meno", dir.join("a.meno")).unwrap();
        std::os::unix::fs::symlink("a.meno", dir.join("b.meno")).unwrap();
        assert!(write_whole(&dir.join("a.meno"), b"x").is_err());
        assert_eq!(names(&dir), ["a.meno", "b.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_save_into_a_folder_not_there_fails_and_makes_nothing() {
        let dir = scratch();
        let path = dir.join("gone").join("work.meno");
        assert!(write_whole(&path, b"x").is_err());
        assert!(!dir.join("gone").exists());
        assert!(names(&dir).is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_long_name_still_has_a_hidden_copy_the_system_takes() {
        let dir = scratch();
        let name = format!("{}.meno", "a".repeat(240));
        write_whole(&dir.join(&name), b"long").unwrap();
        assert_eq!(fs::read(dir.join(&name)).unwrap(), b"long");
        assert_eq!(names(&dir), [name]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_syncs_here() {
        let dir = scratch();
        sync_dir(&dir).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_bytes_come_as_they_are_or_as_a_list_of_numbers() {
        use tauri::ipc::InvokeBody;
        assert_eq!(bytes_of(&InvokeBody::Raw(vec![0, 7, 255])), Some(vec![0, 7, 255]));
        assert_eq!(bytes_of(&InvokeBody::Json(serde_json::json!([0, 7, 255]))), Some(vec![0, 7, 255]));
        assert_eq!(bytes_of(&InvokeBody::Json(serde_json::json!([0, 256]))), None);
        assert_eq!(bytes_of(&InvokeBody::Json(serde_json::json!([0, -1]))), None);
        assert_eq!(bytes_of(&InvokeBody::Json(serde_json::json!({ "path": "/x" }))), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_s_file_is_found_in_its_folder_as_it_really_is() {
        let dir = scratch();
        fs::create_dir(dir.join("real")).unwrap();
        std::os::unix::fs::symlink("real/../real/w.meno", dir.join("link.meno")).unwrap();
        let target = real_target(&dir.join("link.meno")).unwrap();
        assert_eq!(in_its_folder(&target).unwrap(), fs::canonicalize(&dir).unwrap().join("real").join("w.meno"));
        assert!(in_its_folder(&dir.join("gone").join("w.meno")).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn only_a_file_the_plugin_would_write_is_written() {
        let dir = fs::canonicalize(scratch()).unwrap();
        fs::create_dir(dir.join("real")).unwrap();
        let picked = dir.join("picked.meno");
        let real = dir.join("real").join("w.meno");
        let link = dir.join("link.meno");
        std::os::unix::fs::symlink("real/w.meno", &link).unwrap();
        let target = real_target(&link).unwrap();
        // (a file picked; one not)
        assert!(may_write(&picked, &picked, |p| p == picked));
        assert!(!may_write(&dir.join("other.meno"), &dir.join("other.meno"), |p| p == picked));
        // (a link: as the file it points at is allowed or not, the link's own name aside)
        assert!(may_write(&link, &target, |p| p == real));
        assert!(!may_write(&link, &target, |p| p == picked));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_path_comes_percent_encoded() {
        assert_eq!(percent_decoded("%2FUsers%2Fk%2Fr%C3%A9sultats%2F%CE%B1-pinene%20a.meno").as_deref(), Some("/Users/k/r\u{e9}sultats/\u{3b1}-pinene a.meno"));
        assert_eq!(percent_decoded("C%3A%5Cwork%5Cw.meno").as_deref(), Some("C:\\work\\w.meno"));
        assert_eq!(percent_decoded("plain").as_deref(), Some("plain"));
        assert_eq!(percent_decoded("%2"), None);
        assert_eq!(percent_decoded("%zz"), None);
        assert_eq!(percent_decoded("%FF"), None);
    }
}
