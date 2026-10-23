//! A chemist's document written where they chose - a workspace saved, a
//! file exported, a picture, a PDF made - whole, or not at all
//! (docs/FILE-IO.md, *Save and Export*). It is written beside where it
//! goes first, under a hidden name of its own, made to reach the disk, and
//! only then put in place, in one step: a save that fails part way - the
//! disk full, the drive taken away - leaves the file that was there as it
//! was, and nothing of its own behind; Meno stopped as it writes, the file
//! there is still as it was, its hidden copy perhaps left beside it. What
//! the file had besides its bytes - its permissions, owner, extended
//! attributes (a Finder tag), access list - it keeps, as far as the system
//! lets it be kept.
//!
//! The page may write only where it could have written through the file
//! system plugin: where Open's or Save's dialog let it, a file dropped, or
//! one opened from outside Meno (opened.rs) - the plugin's own scope. Meno's
//! own files - its settings - are written the same way, each only in its
//! own folders (`write_app_file`).

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

/// How many links are followed to the file a document is written to, as a system follows them.
const MOST_LINKS: usize = 40;
/// How much of a file's name its hidden copy's name takes: a long name and the rest stay under the systems' 255.
const NAME_MOST: usize = 64;
/// How many copies of a file are kept beside it, at most, before a save that would keep one more is refused.
const MOST_KEPT: usize = 1000;

/// A document's bytes, sent as they are, written to the file named by the
/// `path` header (its percent-encoded UTF-8) - whole, or not at all. With
/// the `keep-old` header, the file there is first kept beside it
/// (`kept_beside`), and where that copy is is given back. A workspace's file
/// with its steps' job files to add (`appended`, its length in the bytes
/// sent): the rest of the bytes are the list of them, as JSON, each added
/// from its job's folder to the hidden file before it reaches the disk and
/// takes the old one's place (keptjobs.rs `append_job_files`) - so that a
/// job file changed or gone fails the save, and the file there is as it was.
#[tauri::command]
pub async fn write_document(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let path = request
        .headers()
        .get("path")
        .and_then(|p| p.to_str().ok())
        .and_then(percent_decoded)
        .map(PathBuf::from)
        .ok_or("no file was named to write to")?;
    let keep_old = request.headers().get("keep-old").is_some_and(|v| v == "1");
    let mut bytes = bytes_of(request.body()).ok_or("a document is sent as its bytes")?;
    let appended = match request.headers().get("appended") {
        None => Vec::new(),
        Some(n) => {
            let n = n.to_str().ok().and_then(|n| n.parse::<usize>().ok()).filter(|&n| n <= bytes.len()).ok_or("the job files to add are not said")?;
            let list: Vec<crate::keptjobs::Appended> = serde_json::from_slice(&bytes[n..]).map_err(|e| format!("the job files to add: {e}"))?;
            bytes.truncate(n);
            list
        }
    };
    let jobs_root = if appended.is_empty() { None } else { Some(crate::jobs::all_roots(&app)?) };
    // (a job file carried from the workspace's file it was opened from: one the page could have read)
    if let Some(from) = appended.iter().filter_map(|a| a.from.as_deref()).find(|f| !may_read(&app, f)) {
        return Err(format!("Meno may not read {}", from.display()));
    }
    let most = most_for(&path, !appended.is_empty());
    // (as the plugin takes a path: whole, and going up nowhere)
    if !path.is_absolute() || path.components().any(|c| c == Component::ParentDir) {
        return Err(format!("{} is not a whole path", path.display()));
    }
    let target = real_target(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !app.try_fs_scope().is_some_and(|scope| may_write(&path, &target, |p| scope.is_allowed(p))) {
        return Err(format!("Meno may not write to {}", path.display()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        replace_keeping(&target, keep_old, |file| document_written(file, &bytes, jobs_root.as_deref().map(|r| (r, &appended[..])), most))
        .map(|kept| kept.map(|k| k.to_string_lossy().into_owned()))
            .map_err(|e| format!("{}: {e}", path.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The most the document at `path` may come to, where it is held to one: a
/// workspace's file - whatever it holds - and anything written with job
/// files added (`with_jobs`), whatever it is called, never more than Meno
/// can open again (keptjobs.rs); anything else, none.
fn most_for(path: &Path, with_jobs: bool) -> Option<u64> {
    let workspace = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("meno"));
    (workspace || with_jobs).then_some(crate::keptjobs::MOST_WORKSPACE_FILE)
}

/// A document's bytes written to the hidden file `file` a save puts in place
/// (`replace_keeping`): with the job files to add (`jobs`: the jobs' folder,
/// and the files), each added from the disk; and, a workspace's file, no
/// more than `most` - else failing, before it takes the old one's place.
pub(crate) fn document_written(file: &mut File, bytes: &[u8], jobs: Option<(&[PathBuf], &[crate::keptjobs::Appended])>, most: Option<u64>) -> io::Result<()> {
    file.write_all(bytes)?;
    if let Some((root, appended)) = jobs {
        crate::keptjobs::append_job_files(&mut *file, root, appended).map_err(io::Error::other)?;
    }
    match most {
        Some(most) => crate::keptjobs::within_most(file, most),
        None => Ok(()),
    }
}

/// One of Meno's own files - its settings, its environments' notes - sent
/// as its bytes, written whole or not at all, as a document is: the file
/// named by the `rel` header (percent-encoded UTF-8), a path inside the
/// folder the `base` header names - `data`, Meno's data folder, or `local`,
/// its local one - and nowhere else (`app_file_at`).
#[tauri::command]
pub async fn write_app_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let rel = request
        .headers()
        .get("rel")
        .and_then(|p| p.to_str().ok())
        .and_then(percent_decoded)
        .ok_or("no file was named to write to")?;
    let base = match request.headers().get("base").and_then(|b| b.to_str().ok()) {
        Some("data") => app.path().app_data_dir(),
        Some("local") => app.path().app_local_data_dir(),
        _ => return Err("no folder of Meno's was named to write in".into()),
    }
    .map_err(|e| e.to_string())?;
    let bytes = bytes_of(request.body()).ok_or("a file is sent as its bytes")?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = app_file_at(&base, &rel)?;
        write_whole(&path, &bytes).map_err(|e| format!("{rel}: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Where Meno's own file `rel` is kept in its folder `base`, the folders on
/// the way made: refused where `rel` is not a path inside it - whole, empty,
/// stepping up (`..`), or leading out of it through a link.
fn app_file_at(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let path = base.join(crate::safe_relative(rel)?);
    fs::create_dir_all(base).map_err(|e| format!("{}: {e}", base.display()))?;
    let home = fs::canonicalize(base).map_err(|e| format!("{}: {e}", base.display()))?;
    let inside = |p: &Path| fs::canonicalize(p).is_ok_and(|p| p.starts_with(&home));
    // (the folder it goes in: each that is there already inside, before any is made)
    if let Some(dir) = path.parent() {
        let mut there = dir;
        while !there.exists() {
            there = there.parent().unwrap_or(base);
        }
        if !inside(there) {
            return Err(format!("{rel} is not in Meno's folder"));
        }
        fs::create_dir_all(dir).map_err(|e| format!("{rel}: {e}"))?;
    }
    let target = real_target(&path).and_then(|t| in_its_folder(&t)).map_err(|e| format!("{rel}: {e}"))?;
    if !target.starts_with(&home) {
        return Err(format!("{rel} is not in Meno's folder"));
    }
    Ok(path)
}

/// Whether the page may have the file at `path` read as Meno reads it for
/// the page: where the file system plugin's scope lets it - a file Open or
/// Save gave, or one opened from outside Meno.
pub(crate) fn may_read(app: &AppHandle, path: &Path) -> bool {
    path.is_absolute() && !path.components().any(|c| c == Component::ParentDir) && app.try_fs_scope().is_some_and(|scope| scope.is_allowed(path))
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
/// step, keeping what the file had besides its bytes (`keep_besides`). Where
/// anything fails, the file is as it was, the hidden one is gone, and why is
/// said. A file that could not have been written to - kept read-only, a
/// folder - is not written over.
pub(crate) fn replace_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    replace_keeping(path, false, write).map(|_| ())
}

/// As `replace_with`; and, `keep_old` and a file there, that file first kept
/// beside it as it is (`kept_beside`) - where it is is given back - or, where
/// it cannot be, not written over.
pub(crate) fn replace_keeping(path: &Path, keep_old: bool, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<Option<PathBuf>> {
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
        may_be_written(&target)?;
    }
    let short: String = name.to_string_lossy().chars().take(NAME_MOST).collect();
    sweep_parts(dir, &short, STALE_PART);
    let part = dir.join(format!(".{short}.{}.part", uuid::Uuid::new_v4()));
    let written = (|| {
        // (read as well: a workspace's job files are added to the zip it holds, which is read for where they go - keptjobs.rs)
        let mut file = OpenOptions::new().read(true).write(true).create_new(true).open(&part)?;
        write(&mut file)?;
        if let Some(m) = &before {
            keep_besides(&target, m, &file)?;
        }
        file.sync_all()
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    let kept = match before.is_some() && keep_old {
        false => None,
        true => match kept_beside(&target) {
            Ok(kept) => Some(kept),
            Err(e) => {
                let _ = fs::remove_file(&part);
                return Err(io::Error::new(e.kind(), format!("the file as it was could not be kept beside it, so it was not written over ({e})")));
            }
        },
    };
    if let Err(e) = put_in_place(&part, &target, dir, &short, before.is_some()) {
        let _ = fs::remove_file(&part);
        // (the file there as it was: the copy just kept of it is not wanted - and is kept where the file is not there)
        if let Some(k) = &kept {
            if fs::symlink_metadata(&target).is_ok() {
                let _ = fs::remove_file(k);
            }
        }
        return Err(e);
    }
    #[cfg(unix)]
    if let Err(e) = sync_dir(dir) {
        // (the file itself is on the disk; some file systems - a share, say - keep no folder to sync)
        crate::logfile::logged!("a saved file's folder could not be synced: {e}");
    }
    Ok(kept)
}

/// How old a hidden copy of a file left beside it must be to be taken away
/// as the file is saved again: one a save stopped part way left (Meno
/// stopped, the computer too) - never one a save still under way writes.
const STALE_PART: std::time::Duration = std::time::Duration::from_secs(6 * 60 * 60);

/// The hidden copies of the file `short` names left in `dir` by saves that
/// never ended - each `.<short>.<uuid>.part`, as `replace_keeping` names
/// them, older than `stale` - taken away: one can be as large as the file.
/// What cannot be is left, and logged.
fn sweep_parts(dir: &Path, short: &str, stale: std::time::Duration) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let prefix = format!(".{short}.");
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some(id) = name.strip_prefix(&prefix).and_then(|r| r.strip_suffix(".part")) else { continue };
        if uuid::Uuid::parse_str(id).is_err() {
            continue;
        }
        let old = e.metadata().ok().filter(|m| m.file_type().is_file()).and_then(|m| m.modified().ok()).and_then(|t| t.elapsed().ok()).is_some_and(|age| age >= stale);
        if old {
            if let Err(err) = fs::remove_file(e.path()) {
                crate::logfile::logged!("a saved file's old hidden copy could not be taken away: {err}");
            }
        }
    }
}

/// What the file at `target` had besides its bytes - `before` - given to
/// `file`, its new bytes, before it takes the file's place: a new file is
/// made, and would else have the folder's and the system's defaults. Its
/// permissions; where the system lets it, its owner and group (Unix); its
/// extended attributes - a Finder tag, where it came from - and its access
/// list (macOS, copyfile(3)). On Windows the system keeps them as it puts
/// the file in place (`put_in_place`). Only the permissions failing fails
/// the save: one of the rest that cannot be kept - another's file, a file
/// system that keeps none - is logged, and the new work saved, never lost
/// for it.
fn keep_besides(target: &Path, before: &fs::Metadata, file: &File) -> io::Result<()> {
    #[cfg(unix)]
    {
        // (the owner first: a change of owner may clear what the permissions then set)
        keep_owner(before, file);
        file.set_permissions(before.permissions())?;
    }
    #[cfg(target_os = "macos")]
    keep_attributes(target, file);
    let _ = (target, before, file);
    Ok(())
}

/// The owner and group of a file, as `before` has them, given to `file`:
/// only the same user's own file, or a system's administrator, may have its
/// owner given; a group the user is in may be given. Nothing to do where
/// they are already the file's; what cannot be is logged.
#[cfg(unix)]
fn keep_owner(before: &fs::Metadata, file: &File) {
    use std::os::unix::fs::{fchown, MetadataExt};
    let (uid, gid) = (before.uid(), before.gid());
    let now = match file.metadata() {
        Ok(m) if m.uid() == uid && m.gid() == gid => return,
        Ok(m) => m,
        Err(e) => return crate::logfile::logged!("a saved file's owner could not be kept: {e}"),
    };
    if fchown(file, Some(uid), Some(gid)).is_ok() {
        return;
    }
    // (another's file: its group, at least)
    let group = if now.gid() == gid { Ok(()) } else { fchown(file, None, Some(gid)) };
    match group {
        Ok(()) if now.uid() != uid => crate::logfile::logged!("a saved file's owner could not be kept: it was another user's"),
        Ok(()) => {}
        Err(e) => crate::logfile::logged!("a saved file's owner and group could not be kept: {e}"),
    }
}

/// The extended attributes and access list of the file at `target` given to
/// `file` - copyfile(3)'s COPYFILE_XATTR and COPYFILE_ACL, and nothing more:
/// COPYFILE_STAT would give it the old file's time of change as well. What
/// cannot be is logged.
#[cfg(target_os = "macos")]
fn keep_attributes(target: &Path, file: &File) {
    use std::os::fd::AsRawFd;
    let old = match File::open(target) {
        Ok(old) => old,
        Err(e) => return crate::logfile::logged!("a saved file's extended attributes could not be kept: {e}"),
    };
    // SAFETY: both are files open for the whole of the call; no state is given, as copyfile(3) allows.
    let done = unsafe { libc::fcopyfile(old.as_raw_fd(), file.as_raw_fd(), std::ptr::null_mut(), libc::COPYFILE_XATTR | libc::COPYFILE_ACL) };
    if done < 0 {
        crate::logfile::logged!("a saved file's extended attributes or access list could not be kept: {}", io::Error::last_os_error());
    }
}

/// The file at `target` kept beside it as it is, under a name of its own -
/// `<name>.bak`, else `<name>.1.bak`, `<name>.2.bak` and on: never over a
/// copy kept before, which may hold more. The same file under a second name
/// where the file system has them (a hard link: the file itself, everything
/// it had with it, which the save then puts another in place of), else a
/// copy of its bytes.
pub(crate) fn kept_beside(target: &Path) -> io::Result<PathBuf> {
    let (Some(dir), Some(name)) = (target.parent(), target.file_name()) else {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "it names no file in a folder"));
    };
    for n in 0..MOST_KEPT {
        let mut kept = OsString::from(name);
        kept.push(if n == 0 { ".bak".to_string() } else { format!(".{n}.bak") });
        let kept = dir.join(kept);
        let made = match fs::hard_link(target, &kept) {
            Err(e) if e.kind() != io::ErrorKind::AlreadyExists => copied_new(target, &kept),
            made => made,
        };
        match made {
            Ok(()) => return Ok(kept),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::other(format!("{MOST_KEPT} copies are kept beside it already")))
}

/// The bytes of the file at `from` copied to `to`, a file made for them -
/// never one there already - with its permissions, reaching the disk; none
/// of it left where it fails.
fn copied_new(from: &Path, to: &Path) -> io::Result<()> {
    let mut out = OpenOptions::new().write(true).create_new(true).open(to)?;
    let copied = (|| {
        io::copy(&mut File::open(from)?, &mut out)?;
        out.set_permissions(fs::metadata(from)?.permissions())?;
        out.sync_all()
    })();
    if copied.is_err() {
        let _ = fs::remove_file(to);
    }
    copied
}

/// The new file, `part`, put in place of `target` in one step - over the
/// file there (`existed`), or where there was none.
#[cfg(not(windows))]
fn put_in_place(part: &Path, target: &Path, _dir: &Path, _short: &str, _existed: bool) -> io::Result<()> {
    fs::rename(part, target)
}

/// The new file, `part`, put in place of `target` in one step (Windows):
/// over the file there by ReplaceFileW, which keeps what the file had
/// besides its bytes - when it was made, its access list, its other
/// streams, being kept compressed or encrypted - and not by a rename, which
/// would keep none of it; where there was none, by a rename. Each tried
/// again a moment later where the file is only held for a moment - by an
/// antivirus, or a cloud drive's sync (`tried_again`).
#[cfg(windows)]
fn put_in_place(part: &Path, target: &Path, dir: &Path, short: &str, existed: bool) -> io::Result<()> {
    if !existed {
        return tried_again(&mut (), |_| fs::rename(part, target).map_err(code_of), |_, wait| std::thread::sleep(wait)).map_err(|c| io::Error::from_raw_os_error(c as i32));
    }
    let backup = dir.join(format!(".{short}.{}.old", uuid::Uuid::new_v4()));
    match placed_over(&mut OnDisk { part, target, backup: &backup }) {
        Ok(()) => Ok(()),
        Err(NotPlaced::Failed(code)) => Err(io::Error::from_raw_os_error(code as i32)),
        Err(NotPlaced::LeftAsBackup(code)) => Err(io::Error::other(format!(
            "{}; the file as it was is now named {}, beside it",
            io::Error::from_raw_os_error(code as i32),
            backup.file_name().map(|n| n.to_string_lossy()).unwrap_or_default()
        ))),
    }
}

/// An error of a step on Windows, as the system numbers it (GetLastError).
#[cfg(windows)]
fn code_of(e: io::Error) -> u32 {
    e.raw_os_error().map_or(u32::MAX, |c| c as u32)
}

/// What a step of putting a file in place comes to: done, or the system's
/// error, by its number.
#[cfg(any(windows, test))]
type Step = Result<(), u32>;

/// The errors of Windows that a save meets, as the system numbers them
/// (winerror.h). The first three are of a file held a moment by another -
/// an antivirus looking into the new file, a cloud drive syncing the old -
/// and are tried again (`tried_again`); after each, ReplaceFileW leaves both
/// files as they were ("If any other error is returned ... the replaced and
/// replacement files will retain their original file names").
#[cfg(any(windows, test))]
mod win_error {
    /// ERROR_ACCESS_DENIED: as Windows says of a file open elsewhere without leave to delete it, as well as of one that may not be written - which a save has looked at before (`replace_keeping`).
    pub const ACCESS_DENIED: u32 = 5;
    /// ERROR_SHARING_VIOLATION.
    pub const SHARING_VIOLATION: u32 = 32;
    /// ERROR_LOCK_VIOLATION.
    pub const LOCK_VIOLATION: u32 = 33;
    /// ERROR_UNABLE_TO_REMOVE_REPLACED: "The replaced and replacement files retain their original file names."
    pub const UNABLE_TO_REMOVE_REPLACED: u32 = 1175;
    /// ERROR_UNABLE_TO_MOVE_REPLACEMENT: with a backup named, "the replaced and replacement files retain their original file names".
    pub const UNABLE_TO_MOVE_REPLACEMENT: u32 = 1176;
    /// ERROR_UNABLE_TO_MOVE_REPLACEMENT_2: "The file to be replaced still exists with a different name ... it will be the name of the" backup.
    pub const UNABLE_TO_MOVE_REPLACEMENT_2: u32 = 1177;
}

#[cfg(windows)]
const _: () = {
    use windows_sys::Win32::Foundation as f;
    assert!(win_error::ACCESS_DENIED == f::ERROR_ACCESS_DENIED);
    assert!(win_error::SHARING_VIOLATION == f::ERROR_SHARING_VIOLATION);
    assert!(win_error::LOCK_VIOLATION == f::ERROR_LOCK_VIOLATION);
    assert!(win_error::UNABLE_TO_REMOVE_REPLACED == f::ERROR_UNABLE_TO_REMOVE_REPLACED);
    assert!(win_error::UNABLE_TO_MOVE_REPLACEMENT == f::ERROR_UNABLE_TO_MOVE_REPLACEMENT);
    assert!(win_error::UNABLE_TO_MOVE_REPLACEMENT_2 == f::ERROR_UNABLE_TO_MOVE_REPLACEMENT_2);
};

/// How long each try waits before the next, where a file is held a moment:
/// five tries in all, over a second.
#[cfg(any(windows, test))]
const WAITS_MS: [u64; 4] = [100, 200, 300, 400];

/// `step` done; done again after each of `WAITS_MS` while it fails only as a
/// file held a moment by another does - what it came to in the end.
#[cfg(any(windows, test))]
fn tried_again<S>(state: &mut S, step: impl FnMut(&mut S) -> Step, wait: impl FnMut(&mut S, std::time::Duration)) -> Step {
    use win_error::*;
    tried_while(state, step, wait, |code| matches!(code, ACCESS_DENIED | SHARING_VIOLATION | LOCK_VIOLATION))
}

/// `step` done; done again after each of `WAITS_MS` while it fails as `held` says a file held a moment does.
#[cfg(any(windows, test))]
fn tried_while<S>(state: &mut S, mut step: impl FnMut(&mut S) -> Step, mut wait: impl FnMut(&mut S, std::time::Duration), held: impl Fn(u32) -> bool) -> Step {
    let mut done = step(state);
    for ms in WAITS_MS {
        match done {
            Err(code) if held(code) => {
                wait(state, std::time::Duration::from_millis(ms));
                done = step(state);
            }
            _ => break,
        }
    }
    done
}

/// Opening the file there to write it, to see it may be (`may_be_written`),
/// tried again while it is held a moment by another that lets no one else
/// open it - a spreadsheet program saving it, say, which lets it go within a
/// second: ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION. Not where it may
/// not be written (ERROR_ACCESS_DENIED: kept read-only), which no wait
/// changes.
#[cfg(any(windows, test))]
fn opened_while_held<S>(state: &mut S, step: impl FnMut(&mut S) -> Step, wait: impl FnMut(&mut S, std::time::Duration)) -> Step {
    use win_error::*;
    tried_while(state, step, wait, |code| matches!(code, SHARING_VIOLATION | LOCK_VIOLATION))
}

/// Whether the file at `target` may be written: opened as writing it in
/// place would open it, and closed again - nothing changed. A file kept
/// read-only, or a folder, may not.
#[cfg(not(windows))]
fn may_be_written(target: &Path) -> io::Result<()> {
    OpenOptions::new().write(true).open(target).map(|_| ())
}

/// Whether the file at `target` may be written (Windows): as elsewhere, and
/// tried again while it is held a moment by another (`opened_while_held`) -
/// as putting the new file in place is (`placed_over`). Still held, the
/// save fails, and the file is as it was.
#[cfg(windows)]
fn may_be_written(target: &Path) -> io::Result<()> {
    let mut last: Option<io::Error> = None;
    let done = opened_while_held(
        &mut last,
        |last| {
            OpenOptions::new().write(true).open(target).map(|_| ()).map_err(|e| {
                let code = e.raw_os_error().map_or(u32::MAX, |c| c as u32);
                *last = Some(e);
                code
            })
        },
        |_, wait| std::thread::sleep(wait),
    );
    done.map_err(|_| last.take().unwrap_or_else(|| io::Error::other("the file could not be opened")))
}

/// The steps of putting a new file in place over an old one on Windows,
/// each as the system does it: so that what is done about each answer
/// (`placed_over`) is tried on every system.
#[cfg(any(windows, test))]
trait Placing {
    /// The new file put in place of the old, the old kept under the backup's name (ReplaceFileW).
    fn replace(&mut self) -> Step;
    /// Whether there is a file where the old one was.
    fn target_there(&self) -> bool;
    /// Whether there is a file under the backup's name.
    fn backup_there(&self) -> bool;
    /// The backup named as the old file again - over nothing there.
    fn restore(&mut self) -> Step;
    /// The backup taken away.
    fn remove_backup(&mut self) -> Step;
    /// The new file taken away.
    fn remove_part(&mut self);
    fn wait(&mut self, wait: std::time::Duration);
}

/// Why a new file was not put in place over the old: the system's error;
/// and whether the old file is left under the backup's name, where it could
/// not be named as it was again.
#[cfg(any(windows, test))]
#[derive(Debug, PartialEq)]
enum NotPlaced {
    Failed(u32),
    LeftAsBackup(u32),
}

/// A new file put in place over an old one (`Placing`), the old one kept
/// under a backup's name all the while - so that it is never gone: ReplaceFileW
/// with no backup named, failing as ERROR_UNABLE_TO_MOVE_REPLACEMENT, leaves
/// "the replaced file no longer exists". Tried again while the file is held
/// a moment; then, put in place, the backup taken away. Failed, the old file
/// named as it was again where the system left it under the backup's name
/// (ERROR_UNABLE_TO_MOVE_REPLACEMENT_2), and the new one taken away.
#[cfg(any(windows, test))]
fn placed_over(sys: &mut impl Placing) -> Result<(), NotPlaced> {
    match tried_again(sys, |s| s.replace(), |s, w| s.wait(w)) {
        Ok(()) => {
            if let Err(code) = sys.remove_backup() {
                // (put in place; the old file, a hidden copy, left beside it)
                crate::logfile::logged!("a saved file's old copy could not be taken away: error {code}");
            }
            Ok(())
        }
        Err(code) => {
            let mut left = false;
            if !sys.target_there() && sys.backup_there() {
                left = tried_again(sys, |s| s.restore(), |s, w| s.wait(w)).is_err();
            }
            sys.remove_part();
            Err(if left { NotPlaced::LeftAsBackup(code) } else { NotPlaced::Failed(code) })
        }
    }
}

/// The steps of `Placing`, on the disk (Windows).
#[cfg(windows)]
struct OnDisk<'a> {
    part: &'a Path,
    target: &'a Path,
    backup: &'a Path,
}

#[cfg(windows)]
impl OnDisk<'_> {
    /// A path as Windows takes one: UTF-16, ended by a nought.
    fn wide(path: &Path) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }
}

#[cfg(windows)]
impl Placing for OnDisk<'_> {
    fn replace(&mut self) -> Step {
        use windows_sys::Win32::Storage::FileSystem::{ReplaceFileW, REPLACEFILE_IGNORE_ACL_ERRORS, REPLACEFILE_IGNORE_MERGE_ERRORS};
        let (target, part, backup) = (Self::wide(self.target), Self::wide(self.part), Self::wide(self.backup));
        // (what cannot be merged - an access list the user may not set - is not kept, and the file still saved, as a rename would have saved it:
        // "if you specify this flag and do not have WRITE_DAC access, the function succeeds but the ACLs are not preserved")
        let flags = REPLACEFILE_IGNORE_MERGE_ERRORS | REPLACEFILE_IGNORE_ACL_ERRORS;
        // SAFETY: each name is a UTF-16 text ended by a nought, alive over the call; the two reserved are null, as they must be.
        let done = unsafe { ReplaceFileW(target.as_ptr(), part.as_ptr(), backup.as_ptr(), flags, std::ptr::null(), std::ptr::null()) };
        // SAFETY: GetLastError takes nothing; it is read straight after the call that set it.
        if done != 0 { Ok(()) } else { Err(unsafe { windows_sys::Win32::Foundation::GetLastError() }) }
    }
    fn target_there(&self) -> bool {
        fs::symlink_metadata(self.target).is_ok()
    }
    fn backup_there(&self) -> bool {
        fs::symlink_metadata(self.backup).is_ok()
    }
    fn restore(&mut self) -> Step {
        use windows_sys::Win32::Storage::FileSystem::MoveFileExW;
        let (backup, target) = (Self::wide(self.backup), Self::wide(self.target));
        // SAFETY: as in `replace`; no flags: never over a file there.
        let done = unsafe { MoveFileExW(backup.as_ptr(), target.as_ptr(), 0) };
        // SAFETY: as in `replace`.
        if done != 0 { Ok(()) } else { Err(unsafe { windows_sys::Win32::Foundation::GetLastError() }) }
    }
    fn remove_backup(&mut self) -> Step {
        fs::remove_file(self.backup).map_err(code_of)
    }
    fn remove_part(&mut self) {
        let _ = fs::remove_file(self.part);
    }
    fn wait(&mut self, wait: std::time::Duration) {
        std::thread::sleep(wait);
    }
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
pub(crate) fn percent_decoded(text: &str) -> Option<String> {
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
    fn a_workspace_file_past_what_meno_opens_is_refused_and_the_one_there_left_as_it_was() {
        // (no job files at all: a workspace's attachments alone can come to it)
        let dir = scratch();
        let path = dir.join("work.meno");
        let old = b"PK\x03\x04 the workspace saved before".repeat(10);
        fs::write(&path, &old).unwrap();
        let new = vec![5u8; 4096];
        let err = replace_keeping(&path, false, |f| document_written(f, &new, None, Some(4095))).unwrap_err();
        assert!(err.to_string().contains("a workspace file Meno can open again holds at most"), "{err}");
        assert_eq!(fs::read(&path).unwrap(), old);
        assert_eq!(names(&dir), ["work.meno"]);
        // (at the most, or not a workspace's file: written)
        replace_keeping(&path, false, |f| document_written(f, &new, None, Some(4096))).unwrap();
        assert_eq!(fs::read(&path).unwrap(), new);
        replace_keeping(&dir.join("big.pdf"), false, |f| document_written(f, &new, None, None)).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_workspace_file_and_anything_written_with_job_files_is_held_to_the_cap_whatever_it_is_called() {
        let most = Some(crate::keptjobs::MOST_WORKSPACE_FILE);
        assert_eq!(most_for(Path::new("/w/work.meno"), false), most);
        assert_eq!(most_for(Path::new("/w/WORK.MENO"), false), most);
        assert_eq!(most_for(Path::new("/w/work.zip"), true), most);
        assert_eq!(most_for(Path::new("/w/work"), true), most);
        assert_eq!(most_for(Path::new("/w/paper.pdf"), false), None);
    }

    #[test]
    fn the_cap_is_half_what_was_seen_to_open_and_under_what_the_reader_reads() {
        // (2 GB opened on the Mac; the reader reads no ZIP64, so never 4 GB)
        assert_eq!(crate::keptjobs::MOST_WORKSPACE_FILE, 1 << 30);
        assert!(crate::keptjobs::MOST_WORKSPACE_FILE < u32::MAX as u64);
    }

    #[test]
    fn hidden_copies_a_stopped_save_left_are_taken_away_on_the_next_and_nothing_else() {
        let dir = scratch();
        let path = dir.join("work.meno");
        fs::write(&path, b"old").unwrap();
        let stale = format!(".work.meno.{}.part", uuid::Uuid::new_v4());
        let fresh = format!(".work.meno.{}.part", uuid::Uuid::new_v4());
        let other = format!(".other.meno.{}.part", uuid::Uuid::new_v4());
        for n in [&stale, &fresh, &other, &".work.meno.notauuid.part".to_string()] {
            fs::write(dir.join(n), b"left").unwrap();
        }
        let long_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 60 * 60);
        for n in [&stale, &other] {
            File::options().write(true).open(dir.join(n)).unwrap().set_modified(long_ago).unwrap();
        }
        write_whole(&path, b"new").unwrap();
        let mut want = vec![fresh.clone(), other.clone(), ".work.meno.notauuid.part".to_string(), "work.meno".to_string()];
        want.sort();
        assert_eq!(names(&dir), want);
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

    /// A program of the system run on `args`, and what it printed; none where it failed.
    #[cfg(target_os = "macos")]
    fn run(program: &str, args: &[&str]) -> Option<String> {
        let out = std::process::Command::new(program).args(args).output().ok()?;
        out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_save_keeps_the_files_finder_tag_other_attributes_and_access_list_and_is_new() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch();
        let path = dir.join("tagged.meno");
        let at = path.to_str().unwrap();
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        // (a Finder tag, as the Finder keeps one; an attribute of the user's own; an entry in its access list)
        let tag = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><array><string>Red\n6</string></array></plist>";
        run("xattr", &["-w", "com.apple.metadata:_kMDItemUserTags", tag, at]).unwrap();
        run("xattr", &["-w", "org.example.note", "kept by the chemist", at]).unwrap();
        run("chmod", &["+a", "user:nobody allow read", at]).unwrap();
        // (the entry as the file system keeps it, by the user's GUID - `-n`: no name looked up, which the directory service may fail to give)
        let entry = "FFFFEEEE-DDDD-CCCC-BBBB-AAAAFFFFFFFE allow read";
        let acl = run("ls", &["-len", at]).unwrap();
        assert!(acl.contains(entry), "{acl}");
        let long_ago = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000_000);
        File::options().write(true).open(&path).unwrap().set_modified(long_ago).unwrap();

        write_whole(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(run("xattr", &["-p", "com.apple.metadata:_kMDItemUserTags", at]).unwrap().trim_end(), tag);
        assert_eq!(run("xattr", &["-p", "org.example.note", at]).unwrap().trim_end(), "kept by the chemist");
        let after = run("ls", &["-len", at]).unwrap();
        assert!(after.contains(entry), "{after}");
        let m = fs::metadata(&path).unwrap();
        // (its permissions as they were; its time of change now, not the old file's)
        assert_eq!(m.permissions().mode() & 0o7777, 0o640);
        assert!(m.modified().unwrap() > long_ago + std::time::Duration::from_secs(60 * 60 * 24 * 365));
        assert_eq!(names(&dir), ["tagged.meno"]);
        run("chmod", &["-a", "user:nobody allow read", at]).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_save_keeps_the_files_group_where_the_user_is_in_it() {
        use std::os::unix::fs::MetadataExt;
        let dir = scratch();
        let path = dir.join("group.meno");
        fs::write(&path, b"old").unwrap();
        let made = fs::metadata(&path).unwrap().gid();
        // (a group the user is in, other than the one a new file here is given)
        let mut groups = vec![0 as libc::gid_t; 64];
        // SAFETY: the list has room for as many as it is said to.
        let n = unsafe { libc::getgroups(groups.len() as libc::c_int, groups.as_mut_ptr()) };
        let Some(&other) = groups[..n.max(0) as usize].iter().find(|&&g| g != made && std::os::unix::fs::chown(&path, None, Some(g)).is_ok()) else {
            fs::remove_dir_all(&dir).unwrap();
            return;
        };
        assert_eq!(fs::metadata(&path).unwrap().gid(), other);
        write_whole(&path, b"new").unwrap();
        let m = fs::metadata(&path).unwrap();
        assert_eq!((m.gid(), m.uid()), (other, fs::metadata(&dir).unwrap().uid()));
        assert_eq!(fs::read(&path).unwrap(), b"new");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_save_asked_to_keeps_the_file_as_it_was_beside_it_and_a_save_not_asked_keeps_none() {
        let dir = scratch();
        let path = dir.join("work.meno");
        let old = b"PK\x03\x04 the file as it was, a part of it damaged".repeat(50);
        fs::write(&path, &old).unwrap();
        // (not asked: none)
        assert_eq!(replace_keeping(&path, false, |f| f.write_all(b"new")).unwrap(), None);
        assert_eq!(names(&dir), ["work.meno"]);
        fs::write(&path, &old).unwrap();
        // (asked: the file as it was, byte for byte, beside it)
        let kept = replace_keeping(&path, true, |f| f.write_all(b"newer")).unwrap().unwrap();
        assert_eq!(kept, dir.join("work.meno.bak"));
        assert_eq!(fs::read(&kept).unwrap(), old);
        assert_eq!(fs::read(&path).unwrap(), b"newer");
        assert_eq!(names(&dir), ["work.meno", "work.meno.bak"]);
        // (asked again: never over the copy kept before - it may hold more)
        let again = replace_keeping(&path, true, |f| f.write_all(b"newest")).unwrap().unwrap();
        assert_eq!(again, dir.join("work.meno.1.bak"));
        assert_eq!(fs::read(&again).unwrap(), b"newer");
        assert_eq!(fs::read(&kept).unwrap(), old);
        let third = replace_keeping(&path, true, |f| f.write_all(b"last")).unwrap().unwrap();
        assert_eq!(third, dir.join("work.meno.2.bak"));
        assert_eq!(fs::read(&third).unwrap(), b"newest");
        assert_eq!(names(&dir), ["work.meno", "work.meno.1.bak", "work.meno.2.bak", "work.meno.bak"]);
        // (asked where there is no file yet: nothing to keep)
        assert_eq!(replace_keeping(&dir.join("new.meno"), true, |f| f.write_all(b"x")).unwrap(), None);
        assert!(!dir.join("new.meno.bak").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_save_asked_to_keep_the_old_file_that_fails_leaves_the_file_and_no_copy() {
        let dir = scratch();
        let path = dir.join("work.meno");
        fs::write(&path, b"old").unwrap();
        let new = vec![7u8; 1000];
        assert!(replace_keeping(&path, true, failing_after(&new, 500)).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"old");
        assert_eq!(names(&dir), ["work.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_copy_of_its_bytes_is_never_made_over_a_file_there() {
        let dir = scratch();
        fs::write(dir.join("a"), b"bytes").unwrap();
        copied_new(&dir.join("a"), &dir.join("b")).unwrap();
        assert_eq!(fs::read(dir.join("b")).unwrap(), b"bytes");
        fs::write(dir.join("c"), b"older").unwrap();
        assert_eq!(copied_new(&dir.join("a"), &dir.join("c")).unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(dir.join("c")).unwrap(), b"older");
        // (from nothing: nothing made)
        assert!(copied_new(&dir.join("gone"), &dir.join("d")).is_err());
        assert_eq!(names(&dir), ["a", "b", "c"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn meno_s_own_file_is_written_inside_its_folder_alone() {
        let dir = scratch();
        let base = dir.join("data");
        // (its folder, and the folders inside it, made as they are needed)
        let at = app_file_at(&base, "uv/stamps/plugin-x.json").unwrap();
        assert_eq!(at, base.join("uv").join("stamps").join("plugin-x.json"));
        assert!(base.join("uv").join("stamps").is_dir());
        write_whole(&app_file_at(&base, "settings.json").unwrap(), b"{}\n").unwrap();
        assert_eq!(fs::read(base.join("settings.json")).unwrap(), b"{}\n");
        let whole = dir.join("elsewhere.json");
        for bad in ["", "../elsewhere.json", "uv/../../elsewhere.json", "./settings.json", whole.to_str().unwrap()] {
            assert!(app_file_at(&base, bad).is_err(), "{bad}");
        }
        assert!(!whole.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn meno_s_own_file_is_never_written_where_a_link_leads_out_of_its_folder() {
        let dir = scratch();
        let base = dir.join("data");
        fs::create_dir_all(&base).unwrap();
        fs::create_dir(dir.join("out")).unwrap();
        std::os::unix::fs::symlink(dir.join("out"), base.join("linked")).unwrap();
        std::os::unix::fs::symlink(dir.join("out").join("s.json"), base.join("s.json")).unwrap();
        assert!(app_file_at(&base, "linked/settings.json").is_err());
        assert!(app_file_at(&base, "linked/deeper/settings.json").is_err());
        assert!(app_file_at(&base, "s.json").is_err());
        assert!(names(&dir.join("out")).is_empty());
        // (a link inside it, to inside it, is followed)
        fs::create_dir(base.join("real")).unwrap();
        std::os::unix::fs::symlink("real", base.join("near")).unwrap();
        assert!(app_file_at(&base, "near/settings.json").is_ok());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// The files a save on Windows meets, as `Placing` sees them: what each
    /// name holds, the system's answers to come, in turn, and the waits.
    #[derive(Default)]
    struct Windows {
        target: Option<&'static str>,
        part: Option<&'static str>,
        backup: Option<&'static str>,
        replies: std::collections::VecDeque<Step>,
        restores: std::collections::VecDeque<Step>,
        removing_fails: bool,
        waited: Vec<u64>,
    }

    impl Windows {
        fn answering(replies: &[Step]) -> Self {
            Windows { target: Some("old"), part: Some("new"), replies: replies.iter().copied().collect(), ..Default::default() }
        }
    }

    impl Placing for Windows {
        // (as ReplaceFileW is documented to leave the files, for each answer)
        fn replace(&mut self) -> Step {
            let reply = self.replies.pop_front().unwrap_or(Ok(()));
            match reply {
                Ok(()) => (self.backup, self.target, self.part) = (self.target, self.part, None),
                Err(win_error::UNABLE_TO_MOVE_REPLACEMENT_2) => (self.backup, self.target) = (self.target, None),
                Err(_) => {}
            }
            reply
        }
        fn target_there(&self) -> bool {
            self.target.is_some()
        }
        fn backup_there(&self) -> bool {
            self.backup.is_some()
        }
        fn restore(&mut self) -> Step {
            let reply = self.restores.pop_front().unwrap_or(Ok(()));
            if reply.is_ok() {
                assert!(self.target.is_none(), "never over a file there");
                (self.target, self.backup) = (self.backup, None);
            }
            reply
        }
        fn remove_backup(&mut self) -> Step {
            if self.removing_fails {
                return Err(win_error::SHARING_VIOLATION);
            }
            self.backup = None;
            Ok(())
        }
        fn remove_part(&mut self) {
            self.part = None;
        }
        fn wait(&mut self, wait: std::time::Duration) {
            self.waited.push(wait.as_millis() as u64);
        }
    }

    #[test]
    fn on_windows_a_save_put_in_place_leaves_the_new_file_alone() {
        let mut w = Windows::answering(&[Ok(())]);
        assert_eq!(placed_over(&mut w), Ok(()));
        assert_eq!((w.target, w.part, w.backup), (Some("new"), None, None));
        assert!(w.waited.is_empty());
        // (its old copy that will not go: left, and the save done)
        let mut w = Windows { removing_fails: true, ..Windows::answering(&[Ok(())]) };
        assert_eq!(placed_over(&mut w), Ok(()));
        assert_eq!((w.target, w.backup), (Some("new"), Some("old")));
    }

    #[test]
    fn on_windows_a_file_held_a_moment_is_tried_again_for_a_second() {
        use win_error::*;
        let mut w = Windows::answering(&[Err(SHARING_VIOLATION), Err(ACCESS_DENIED), Err(LOCK_VIOLATION), Ok(())]);
        assert_eq!(placed_over(&mut w), Ok(()));
        assert_eq!((w.target, w.part, w.backup), (Some("new"), None, None));
        assert_eq!(w.waited, [100, 200, 300]);
        // (held all the while: five tries over a second, then failed - the file as it was, and nothing beside it)
        let mut w = Windows::answering(&[Err(SHARING_VIOLATION); 6]);
        assert_eq!(placed_over(&mut w), Err(NotPlaced::Failed(SHARING_VIOLATION)));
        assert_eq!(w.waited, WAITS_MS);
        assert_eq!(w.waited.iter().sum::<u64>(), 1000);
        assert_eq!(w.replies.len(), 1);
        assert_eq!((w.target, w.part, w.backup), (Some("old"), None, None));
    }

    #[test]
    fn on_windows_a_file_held_a_moment_by_one_that_lets_no_one_open_it_is_tried_again_before_the_save() {
        use win_error::*;
        // (answers to opening it, in turn; the waits taken between)
        let open = |answers: &[Step]| {
            let mut left: std::collections::VecDeque<Step> = answers.iter().copied().collect();
            let mut waited = Vec::new();
            let done = opened_while_held(&mut waited, |_| left.pop_front().unwrap_or(Ok(())), |w, wait| w.push(wait.as_millis() as u64));
            (done, waited)
        };
        // (held, then let go within the second: opened)
        assert_eq!(open(&[Err(SHARING_VIOLATION), Err(LOCK_VIOLATION), Ok(())]), (Ok(()), vec![100, 200]));
        // (held all the while: five tries over a second, then failed)
        assert_eq!(open(&[Err(SHARING_VIOLATION); 6]), (Err(SHARING_VIOLATION), WAITS_MS.to_vec()));
        // (one that may not be written - kept read-only - or another failure: at once, no wait)
        for code in [ACCESS_DENIED, 2] {
            assert_eq!(open(&[Err(code), Ok(())]), (Err(code), vec![]), "{code}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn on_windows_a_save_over_a_file_held_a_moment_with_no_sharing_waits_for_it() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = scratch();
        let path = dir.join("held.meno");
        fs::write(&path, b"old").unwrap();
        // (opened by another with no sharing - as a spreadsheet program holds what it saves - let go after 0.4 s)
        let held = OpenOptions::new().read(true).write(true).share_mode(0).open(&path).unwrap();
        let letting_go = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(400));
            drop(held);
        });
        write_whole(&path, b"new").unwrap();
        letting_go.join().unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(names(&dir), ["held.meno"]);
        // (held for longer than the tries: the save fails, the file as it was and nothing beside it)
        let held = OpenOptions::new().read(true).write(true).share_mode(0).open(&path).unwrap();
        assert!(write_whole(&path, b"newer").is_err());
        drop(held);
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(names(&dir), ["held.meno"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn on_windows_a_failure_that_leaves_both_files_is_not_tried_again() {
        use win_error::*;
        // (ERROR_INVALID_PARAMETER, say: any other leaves them too)
        for code in [UNABLE_TO_REMOVE_REPLACED, UNABLE_TO_MOVE_REPLACEMENT, 87] {
            let mut w = Windows::answering(&[Err(code), Ok(())]);
            assert_eq!(placed_over(&mut w), Err(NotPlaced::Failed(code)), "{code}");
            assert_eq!((w.target, w.part, w.backup), (Some("old"), None, None), "{code}");
            assert!(w.waited.is_empty(), "{code}");
        }
    }

    #[test]
    fn on_windows_the_old_file_left_under_the_backup_s_name_is_named_as_it_was_again() {
        use win_error::*;
        let mut w = Windows::answering(&[Err(UNABLE_TO_MOVE_REPLACEMENT_2)]);
        assert_eq!(placed_over(&mut w), Err(NotPlaced::Failed(UNABLE_TO_MOVE_REPLACEMENT_2)));
        assert_eq!((w.target, w.part, w.backup), (Some("old"), None, None));
        // (held a moment as it is named again: tried again)
        let mut w = Windows { restores: [Err(SHARING_VIOLATION), Ok(())].into(), ..Windows::answering(&[Err(UNABLE_TO_MOVE_REPLACEMENT_2)]) };
        assert_eq!(placed_over(&mut w), Err(NotPlaced::Failed(UNABLE_TO_MOVE_REPLACEMENT_2)));
        assert_eq!((w.target, w.backup), (Some("old"), None));
        assert_eq!(w.waited, [100]);
        // (never named again: left where it is, and said - never taken away)
        let mut w = Windows { restores: [Err(2)].into(), ..Windows::answering(&[Err(UNABLE_TO_MOVE_REPLACEMENT_2)]) };
        assert_eq!(placed_over(&mut w), Err(NotPlaced::LeftAsBackup(UNABLE_TO_MOVE_REPLACEMENT_2)));
        assert_eq!((w.target, w.part, w.backup), (None, None, Some("old")));
    }
}
