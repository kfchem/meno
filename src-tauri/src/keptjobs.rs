//! A job's files kept in a workspace's file (docs/FILE-IO.md, *A step's
//! jobs*): what a step's jobs were given, what their programs wrote and
//! what they said, read from each job's folder (jobs.rs) as a workspace is
//! saved, each by its SHA-256, and written into the `.meno` from the disk -
//! never through the page, which a study's outputs, hundreds of megabytes,
//! would not pass through whole.
//!
//! - [`job_kept`] lists a job's files with their sizes, SHA-256s and what
//!   each is to the job (`Role`): the page decides what is kept and writes
//!   the list into the workspace;
//! - [`append_job_files`] adds them to a workspace's file as it is written,
//!   each deflated, and only if it is still what its SHA-256 says;
//! - [`job_write_back`] writes the files a workspace kept of a job back out,
//!   where its folder is not on this computer, for *Show files*.
//!
//! A job's `job.json` (its program's path and environment on this computer)
//! and `state.json` (Meno's record of it) are never kept. Nothing kept is
//! altered: a program's output can name this computer's user, folders and
//! host, and it is kept as the program wrote it - or, with the step's
//! *Don't keep raw outputs*, left out.

use crate::jobs;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::AppHandle;

/// What a job was given and what its plugin reads back, written beside it
/// as it is made: what a step's *Don't keep raw outputs* keeps.
const ROLES: &str = "kept.json";
/// The files of a job's folder kept besides those of its work folder: what its programs said.
const LOGS: [&str; 2] = ["log.txt", "after.txt"];
/// Where the files a workspace kept of a job are written back out, in Meno's local data folder.
const WRITTEN_BACK: &str = "jobs-kept";
/// How hard a job's files are deflated, kept: fast - they are written on every save.
const LEVEL: i64 = 1;
/// How much of a file is read at a time.
const CHUNK: usize = 1 << 20;

#[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
pub struct Roles {
    /// The files written for it, in its work folder.
    #[serde(default)]
    pub inputs: Vec<String>,
    /// The files its plugin reads back once it is done.
    #[serde(default)]
    pub reads: Vec<String>,
}

/// Writes what a job was given and what is read back of it, beside it.
pub fn write_roles(dir: &Path, inputs: Vec<String>, reads: Vec<String>) -> io::Result<()> {
    let text = serde_json::to_string(&Roles { inputs, reads }).map_err(io::Error::other)?;
    fs::write(dir.join(ROLES), text)
}

fn read_roles(dir: &Path) -> Option<Roles> {
    serde_json::from_str(&fs::read_to_string(dir.join(ROLES)).ok()?).ok()
}

/// What a file is to its job: given it, read back of it, what its programs said, or anything else it wrote.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Input,
    Read,
    Log,
    Raw,
}

/// A job's file, as a workspace keeps it: its name in the job's folder
/// (`work/...`, `log.txt`, `after.txt`), its size, its SHA-256, about how
/// much it comes to deflated, and what it is to the job.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct KeptJobFile {
    pub name: String,
    pub size: u64,
    pub sha256: String,
    pub deflated: u64,
    pub role: Role,
    /// Where the job never said what it was given and read back (made by a Meno before this): every file of its work folder is `raw`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub unsure: bool,
}

/// A file's SHA-256 and deflated size, by where it is, its size and when it was written: a job's files do not change once it is done, and are read once a session.
type Seen = HashMap<(PathBuf, u64, Option<SystemTime>), (String, u64)>;
static SEEN: Mutex<Option<Seen>> = Mutex::new(None);

/// Counts what is written to it.
struct Counted(u64);
impl Write for Counted {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        self.0 += b.len() as u64;
        Ok(b.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// A file's SHA-256, in hex, and how much it comes to deflated as it is kept.
fn digest(path: &Path) -> io::Result<(String, u64)> {
    let meta = fs::metadata(path)?;
    let key = (path.to_path_buf(), meta.len(), meta.modified().ok());
    if let Some(hit) = SEEN.lock().ok().and_then(|s| s.as_ref().and_then(|m| m.get(&key).cloned())) {
        return Ok(hit);
    }
    let mut file = File::open(path)?;
    let mut sha = Sha256::new();
    let mut deflate = flate2::write::DeflateEncoder::new(Counted(0), flate2::Compression::new(LEVEL as u32));
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        sha.update(&buf[..n]);
        deflate.write_all(&buf[..n])?;
    }
    let out = (hex(&sha.finalize()), deflate.finish()?.0);
    if let Ok(mut s) = SEEN.lock() {
        s.get_or_insert_with(HashMap::new).insert(key, out.clone());
    }
    Ok(out)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// A job's files a workspace may keep, from its folder `dir`: its work
/// folder's, then its logs - each with what it is to the job.
pub fn kept_files(dir: &Path) -> Vec<KeptJobFile> {
    let roles = read_roles(dir);
    let handed = jobs::handed_folders(dir);
    let mut names: Vec<(String, Role)> = jobs::work_files(dir)
        .into_iter()
        // (never a file a preset plugin handed it: that plugin's, not the job's)
        .filter(|rel| !handed.iter().any(|h| rel.starts_with(h.as_str())))
        .map(|rel| {
            let role = match &roles {
                Some(r) if r.inputs.contains(&rel) => Role::Input,
                Some(r) if r.reads.contains(&rel) => Role::Read,
                _ => Role::Raw,
            };
            (format!("work/{rel}"), role)
        })
        .collect();
    names.sort_by(|a, b| a.0.cmp(&b.0));
    names.extend(LOGS.iter().filter(|l| dir.join(l).is_file()).map(|l| (l.to_string(), Role::Log)));
    names
        .into_iter()
        .filter_map(|(name, role)| {
            let path = dir.join(&name);
            let size = fs::metadata(&path).ok()?.len();
            let (sha256, deflated) = digest(&path).ok()?;
            Some(KeptJobFile { unsure: roles.is_none() && role == Role::Raw, name, size, sha256, deflated, role })
        })
        .collect()
}

/// Whether `name` is one a job's kept file may have: in its work folder, or one of its logs.
pub fn kept_name(name: &str) -> bool {
    LOGS.contains(&name) || name.strip_prefix("work/").is_some_and(jobs::inside_name)
}

/// A job's files a workspace may keep, where its folder is on this computer; none where it is not.
#[tauri::command]
pub async fn job_kept(app: AppHandle, id: String) -> Result<Option<Vec<KeptJobFile>>, String> {
    if !jobs::job_id_ok(&id) {
        return Err(format!("no job {id}"));
    }
    // (in whichever jobs' folder holds it: the working folder chosen, or Meno's own)
    let Some(dir) = jobs::job_in(&jobs::all_roots(&app)?, &id) else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || Some(kept_files(&dir))).await.map_err(|e| e.to_string())
}

/// A job's file to be added to a workspace's file: by its SHA-256, from the
/// job `job`'s folder, where it is `name` - or, where its folder is not on
/// this computer, from the workspace's file it was opened from (`from`), which
/// keeps it as `files/<sha256>`.
#[derive(Deserialize, Clone, Debug)]
pub struct Appended {
    pub sha256: String,
    pub job: String,
    pub name: String,
    #[serde(default)]
    pub from: Option<PathBuf>,
}

/// The most a workspace's file may come to, saved: one Meno can open again.
/// Opening reads the whole file into the page, and its reader takes no ZIP64
/// (src/lib/binary/zip.ts) - so never 4 GB. On a Mac (32 GB, macOS 26) a
/// workspace file of 2 GB opened, the most tried (2026-10-22, #555): this is
/// half of it.
pub const MOST_WORKSPACE_FILE: u64 = 1 << 30;

/// A size as Meno says one of a workspace: megabytes, or gigabytes to a tenth from one up.
fn sized(n: u64) -> String {
    if n >= 1 << 30 { format!("{:.1} GB", n as f64 / (1u64 << 30) as f64) } else { format!("{} MB", n.div_ceil(1 << 20)) }
}

/// Fails, saying so, where the workspace's file `file`, as written, comes to
/// more than `most`: written, it would not open again. Before it takes the
/// place of the one there, which is then as it was.
pub fn within_most(file: &File, most: u64) -> io::Result<()> {
    let len = file.metadata()?.len();
    if len <= most {
        return Ok(());
    }
    Err(io::Error::other(format!(
        "it would come to {}, and a workspace file Meno can open again holds at most {}. Nothing was written: the file there is as it was. Don't keep raw outputs on its largest steps, or take files out of it, and save again",
        sized(len),
        sized(most)
    )))
}

/// The file `name` in the job's folder `dir`, opened to be read - only a
/// plain file inside it: never through a link, there or on the way to it,
/// whatever the page's list says.
fn open_inside(dir: &Path, name: &str) -> io::Result<File> {
    let path = dir.join(name);
    let not_plain = || io::Error::other("it is not a plain file in its job's folder");
    if !fs::symlink_metadata(&path)?.file_type().is_file() {
        return Err(not_plain());
    }
    if !fs::canonicalize(&path)?.starts_with(fs::canonicalize(dir)?) {
        return Err(not_plain());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options.open(&path)?;
    if !file.metadata()?.file_type().is_file() {
        return Err(not_plain());
    }
    Ok(file)
}

/// The workspace files job files are carried from, each opened once.
type Sources = HashMap<PathBuf, zip::ZipArchive<File>>;

/// Streams what `from` holds of `sha256` into `out`, checking it is that.
fn carried<W: Write>(sources: &mut Sources, from: &Path, sha256: &str, out: &mut W, buf: &mut [u8]) -> Result<(), String> {
    let what = || from.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if !sources.contains_key(from) {
        let archive = File::open(from).map_err(|e| e.to_string()).and_then(|f| zip::ZipArchive::new(f).map_err(|e| e.to_string()));
        sources.insert(from.to_path_buf(), archive.map_err(|e| format!("{} could not be read: {e}", what()))?);
    }
    let archive = sources.get_mut(from).expect("opened above");
    let mut entry = archive.by_name(&format!("files/{sha256}")).map_err(|_| format!("{} no longer holds a file it kept", what()))?;
    let mut sha = Sha256::new();
    loop {
        let n = entry.read(buf).map_err(|e| format!("{}: {e}", what()))?;
        if n == 0 {
            break;
        }
        sha.update(&buf[..n]);
        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    }
    if hex(&sha.finalize()) != sha256 {
        return Err(format!("{} no longer holds a file it kept as it was", what()));
    }
    Ok(())
}

/// Adds job files to the workspace file `zip` - a zip, as the page wrote it,
/// which lists them already (`files.json`) - each from its job's folder in
/// whichever of the jobs' folders `jobs_roots` holds it, as `files/<sha256>`, deflated; one it holds already, or
/// added already, once - or, carried (`from`), from the workspace file it
/// was opened from, read from it as it is written. Fails, saying which,
/// where a file is no longer there, is not a plain file in its job's
/// folder, or is no longer what its SHA-256 says: the file is then not to
/// be kept as it is (docs/FILE-IO.md, *Saving*).
pub fn append_job_files<F: Read + Write + Seek>(zip: F, jobs_roots: &[PathBuf], appended: &[Appended]) -> Result<F, String> {
    let archive = zip::ZipArchive::new(zip).map_err(|e| format!("the workspace's file as written: {e}"))?;
    let mut held: HashSet<String> = archive.file_names().map(str::to_string).collect();
    let mut out = zip::ZipWriter::new_append(archive.into_inner()).map_err(|e| format!("the workspace's file as written: {e}"))?;
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(LEVEL))
        .large_file(false);
    let mut buf = vec![0u8; CHUNK];
    let mut sources = Sources::new();
    for a in appended {
        let entry = format!("files/{}", a.sha256);
        if !held.insert(entry.clone()) {
            continue;
        }
        if !jobs::job_id_ok(&a.job) || !kept_name(&a.name) || a.sha256.len() != 64 || !a.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(format!("not a job's file: {} {}", a.job, a.name));
        }
        if let Some(from) = &a.from {
            out.start_file(entry.as_str(), options).map_err(|e| e.to_string())?;
            carried(&mut sources, from, &a.sha256, &mut out, &mut buf).map_err(|e| format!("{} could not be kept: {e}", a.name))?;
            continue;
        }
        let gone = |e: io::Error| format!("{} could not be kept: {e}", a.name);
        let dir = jobs::job_in(jobs_roots, &a.job).ok_or_else(|| gone(io::Error::from(io::ErrorKind::NotFound)))?;
        let mut file = open_inside(&dir, &a.name).map_err(gone)?;
        out.start_file(entry.as_str(), options).map_err(|e| e.to_string())?;
        let mut sha = Sha256::new();
        loop {
            let n = file.read(&mut buf).map_err(gone)?;
            if n == 0 {
                break;
            }
            sha.update(&buf[..n]);
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        }
        if hex(&sha.finalize()) != a.sha256 {
            return Err(format!("{} changed while the workspace was saved", a.name));
        }
    }
    out.finish().map_err(|e| e.to_string())
}

/// A file the page may read, as it is now: its size, and when it was last
/// written (milliseconds since 1970) - what a save looks at to know whether
/// the workspace's file it replaces is large already, and whether one it
/// was opened from is still as it was. None where it is not there, or not a
/// file the page could have read (`savefile::may_read`).
#[derive(Serialize, Debug, PartialEq)]
pub struct FileNow {
    pub size: u64,
    pub mtime: Option<u64>,
}

#[tauri::command]
pub fn file_now(app: AppHandle, path: PathBuf) -> Option<FileNow> {
    if !crate::savefile::may_read(&app, &path) {
        return None;
    }
    let m = fs::metadata(&path).ok().filter(|m| m.is_file())?;
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64);
    Some(FileNow { size: m.len(), mtime })
}

/// A job's file written back out (`job_write_back`): where its job's work
/// folder is, and whether it was - not where a file is there already that
/// is not it, which is left as it is (`differs`): never written over.
#[derive(Serialize, Debug, PartialEq)]
pub struct WrittenBack {
    pub work: String,
    pub differs: bool,
}

/// A job's file a workspace kept, written back out (`job_write_back`), by
/// its name in the job's folder and its SHA-256: what `write` writes. One
/// there already as it is, left; one there that is not it, left too, and
/// said. Written whole, or not at all; and only if it is what its SHA-256
/// says.
fn write_back(root: &Path, id: &str, name: &str, sha256: &str, write: impl FnOnce(&mut File, &mut Sha256) -> Result<(), String>) -> Result<WrittenBack, String> {
    if !jobs::job_id_ok(id) || !kept_name(name) || sha256.len() != 64 {
        return Err(format!("not a job's file: {id} {name}"));
    }
    let dir = root.join(id);
    let path = dir.join(name);
    let work = dir.join("work").to_string_lossy().into_owned();
    if fs::symlink_metadata(&path).is_ok() {
        let same = path.is_file() && digest(&path).is_ok_and(|(sha, _)| sha == sha256);
        return Ok(WrittenBack { work, differs: !same });
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{name}: {e}"))?;
    }
    // (written whole, or not at all: a file cut short is never taken for the one kept)
    let part = path.with_file_name(format!(".{}.part", uuid::Uuid::new_v4()));
    let written = (|| {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&part).map_err(|e| e.to_string())?;
        let mut sha = Sha256::new();
        write(&mut file, &mut sha)?;
        if hex(&sha.finalize()) != sha256 {
            return Err("it is not what the workspace's file says it is".to_string());
        }
        file.sync_all().map_err(|e| e.to_string())?;
        // (never over a file put there meanwhile)
        if fs::symlink_metadata(&path).is_ok() {
            return Err("a file is there already".to_string());
        }
        fs::rename(&part, &path).map_err(|e| e.to_string())
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&part);
        return Err(format!("{name}: {e}"));
    }
    Ok(WrittenBack { work, differs: false })
}

/// Writes a file a workspace kept of the job `id` back out, in Meno's local
/// data folder, where its own folder is not on this computer - its job,
/// name and SHA-256 as headers; read from the workspace file it was opened
/// from (`from`, a path, percent-encoded), or else sent as its bytes - and
/// says where its work folder is, and whether a file there that is not it
/// was left as it is.
#[tauri::command]
pub async fn job_write_back(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<WrittenBack, String> {
    let header = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
    let (Some(id), Some(name), Some(sha256)) = (header("job"), header("name"), header("sha256")) else {
        return Err("a job's file is sent with its job, its name and its SHA-256".into());
    };
    let root = crate::local_data_dir(&app)?.join(WRITTEN_BACK);
    match header("from").and_then(|f| crate::savefile::percent_decoded(&f)).map(PathBuf::from) {
        Some(from) => {
            if !crate::savefile::may_read(&app, &from) {
                return Err(format!("Meno may not read {}", from.display()));
            }
            tauri::async_runtime::spawn_blocking(move || {
                let mut sources = Sources::new();
                let mut buf = vec![0u8; CHUNK];
                write_back(&root, &id, &name, &sha256.clone(), |file, sha| {
                    let mut both = Hashed { file, sha };
                    carried(&mut sources, &from, &sha256, &mut both, &mut buf)
                })
            })
            .await
            .map_err(|e| e.to_string())?
        }
        None => {
            let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("a job's file is sent as its bytes".into()) };
            write_back(&root, &id, &name, &sha256, |file, sha| {
                sha.update(bytes);
                file.write_all(bytes).map_err(|e| e.to_string())
            })
        }
    }
}

/// Writes to a file what it is given, and hashes it.
struct Hashed<'a> {
    file: &'a mut File,
    sha: &'a mut Sha256,
}
impl Write for Hashed<'_> {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        let n = self.file.write(b)?;
        self.sha.update(&b[..n]);
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("meno-keptjobs-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    const ID: &str = "0b6f5c1e-0000-4000-8000-000000000001";

    fn job(root: &Path) -> PathBuf {
        let dir = root.join(ID);
        fs::create_dir_all(dir.join("work/sub")).unwrap();
        fs::write(dir.join("job.json"), "{\"program\": \"/Users/someone/bin/x\"}").unwrap();
        fs::write(dir.join("state.json"), "{}").unwrap();
        fs::write(dir.join("work/input.inp"), "! opt\n").unwrap();
        fs::write(dir.join("work/input.out"), "FINAL ENERGY -1.0\n".repeat(1000)).unwrap();
        fs::write(dir.join("work/sub/scratch.tmp"), [0u8, 1, 2, 3]).unwrap();
        fs::write(dir.join("log.txt"), "ran\n").unwrap();
        dir
    }

    #[test]
    fn lists_a_jobs_files_with_what_each_is_never_its_spec() {
        let root = temp("list");
        let dir = job(&root);
        write_roles(&dir, vec!["input.inp".into()], vec!["input.out".into()]).unwrap();
        let files = kept_files(&dir);
        let named: Vec<(&str, Role)> = files.iter().map(|f| (f.name.as_str(), f.role)).collect();
        assert_eq!(named, [("work/input.inp", Role::Input), ("work/input.out", Role::Read), ("work/sub/scratch.tmp", Role::Raw), ("log.txt", Role::Log)]);
        // (SHA-256 of "! opt\n", as sha256sum gives it)
        let inp = &files[0];
        assert_eq!(inp.size, 6);
        assert_eq!(inp.sha256, hex(&Sha256::digest(b"! opt\n")));
        // (a repeated line deflates to far less than it is)
        assert!(files[1].deflated < files[1].size / 10);
        assert!(files.iter().all(|f| !f.unsure));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_job_that_never_said_its_roles_has_every_work_file_raw_and_unsure() {
        let root = temp("unsure");
        let dir = job(&root);
        let files = kept_files(&dir);
        assert!(files.iter().filter(|f| f.name.starts_with("work/")).all(|f| f.role == Role::Raw && f.unsure));
        assert!(files.iter().any(|f| f.name == "log.txt" && f.role == Role::Log && !f.unsure));
        fs::remove_dir_all(root).unwrap();
    }

    fn base_zip(listed: &str) -> Vec<u8> {
        let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let stored = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        z.start_file("mimetype", stored).unwrap();
        z.write_all(b"application/vnd.kfchem.meno+zip").unwrap();
        z.start_file("workspace.json", stored).unwrap();
        z.write_all(b"{}").unwrap();
        z.start_file("files.json", stored).unwrap();
        z.write_all(listed.as_bytes()).unwrap();
        z.finish().unwrap().into_inner()
    }

    #[test]
    fn appends_each_file_once_deflated_after_what_the_page_wrote() {
        let root = temp("append");
        let dir = job(&root);
        let files = kept_files(&dir);
        let mut appended: Vec<Appended> = files.iter().map(|f| Appended { sha256: f.sha256.clone(), job: ID.into(), name: f.name.clone(), from: None }).collect();
        appended.push(appended[0].clone());
        let out = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), &appended).unwrap().into_inner();
        let mut z = zip::ZipArchive::new(Cursor::new(out)).unwrap();
        let names: Vec<String> = z.file_names().map(str::to_string).collect();
        assert_eq!(names.len(), 3 + files.len());
        // (the mimetype still first, stored: what tells a workspace's file)
        assert_eq!(z.by_index(0).unwrap().name(), "mimetype");
        for f in &files {
            let mut e = z.by_name(&format!("files/{}", f.sha256)).unwrap();
            assert_eq!(e.compression(), zip::CompressionMethod::Deflated);
            let mut bytes = Vec::new();
            e.read_to_end(&mut bytes).unwrap();
            assert_eq!(bytes, fs::read(dir.join(&f.name)).unwrap());
        }
        fs::remove_dir_all(root).unwrap();
    }

    // (a working folder chosen for jobs is the first jobs' folder; jobs made in Meno's own before are still kept)
    #[test]
    fn takes_a_jobs_files_from_whichever_jobs_folder_holds_it() {
        let chosen = temp("chosen");
        let own = temp("own");
        let dir = job(&own);
        let f = kept_files(&dir).into_iter().find(|f| f.name == "log.txt").unwrap();
        let one = Appended { sha256: f.sha256, job: ID.into(), name: f.name, from: None };
        let out = append_job_files(Cursor::new(base_zip("{}")), &[chosen.clone(), own.clone()], std::slice::from_ref(&one)).unwrap().into_inner();
        let mut z = zip::ZipArchive::new(Cursor::new(out)).unwrap();
        let mut bytes = Vec::new();
        z.by_name(&format!("files/{}", one.sha256)).unwrap().read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"ran\n");
        // (in neither: said, and nothing taken from elsewhere)
        let err = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&chosen), &[one]).unwrap_err();
        assert!(err.starts_with("log.txt could not be kept"), "{err}");
        fs::remove_dir_all(chosen).unwrap();
        fs::remove_dir_all(own).unwrap();
    }

    #[test]
    fn a_file_changed_since_it_was_listed_fails_the_save() {
        let root = temp("changed");
        let dir = job(&root);
        let f = kept_files(&dir).into_iter().find(|f| f.name == "work/input.inp").unwrap();
        fs::write(dir.join("work/input.inp"), "! changed\n").unwrap();
        let err = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), &[Appended { sha256: f.sha256, job: ID.into(), name: f.name, from: None }]).unwrap_err();
        assert_eq!(err, "work/input.inp changed while the workspace was saved");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_save_adds_them_to_its_hidden_file_before_it_takes_the_old_ones_place_or_leaves_the_old_one() {
        let root = temp("save");
        let dir = job(&root);
        let files = kept_files(&dir);
        let appended: Vec<Appended> = files.iter().map(|f| Appended { sha256: f.sha256.clone(), job: ID.into(), name: f.name.clone(), from: None }).collect();
        let path = root.join("work.meno");
        fs::write(&path, b"the workspace saved before").unwrap();
        let page = base_zip("{}");
        // (as write_document writes a workspace: what the page wrote, then the job files added, in the hidden file)
        let save = |appended: &[Appended]| crate::savefile::replace_keeping(&path, false, |f| crate::savefile::document_written(f, &page, Some((std::slice::from_ref(&root), appended)), Some(MOST_WORKSPACE_FILE)));
        save(&appended).unwrap();
        let mut z = zip::ZipArchive::new(File::open(&path).unwrap()).unwrap();
        assert_eq!(z.len(), 3 + files.len());
        let mut out = Vec::new();
        z.by_name(&format!("files/{}", files[0].sha256)).unwrap().read_to_end(&mut out).unwrap();
        assert_eq!(out, fs::read(dir.join(&files[0].name)).unwrap());
        // (one changed since it was listed: the save fails, and the file there is as it was, nothing beside it)
        let before = fs::read(&path).unwrap();
        fs::write(dir.join(&files[0].name), "changed").unwrap();
        assert!(save(&appended).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(!fs::read_dir(&root).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().ends_with(".part")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn appends_nothing_from_outside_a_jobs_folder_or_its_spec() {
        let root = temp("outside");
        job(&root);
        for name in ["job.json", "state.json", "work/../job.json", "../x", "/etc/passwd", "work/"] {
            let err = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), &[Appended { sha256: "0".repeat(64), job: ID.into(), name: name.into(), from: None }]).unwrap_err();
            assert!(err.starts_with("not a job's file"), "{name}: {err}");
        }
        let err = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), &[Appended { sha256: "0".repeat(64), job: "../x".into(), name: "log.txt".into(), from: None }]).unwrap_err();
        assert!(err.starts_with("not a job's file"));
        fs::remove_dir_all(root).unwrap();
    }

    /// `bytes` written back by `write_back`, sent as bytes are.
    fn back(root: &Path, id: &str, name: &str, bytes: &[u8]) -> Result<WrittenBack, String> {
        let sha256 = hex(&Sha256::digest(bytes));
        write_back(root, id, name, &sha256, |file, sha| {
            sha.update(bytes);
            file.write_all(bytes).map_err(|e| e.to_string())
        })
    }

    #[test]
    fn writes_a_kept_file_back_whole_inside_its_folder_only_and_never_over_another() {
        let root = temp("back");
        let work = back(&root, ID, "work/sub/a.out", b"kept").unwrap();
        assert_eq!(work, WrittenBack { work: root.join(ID).join("work").to_string_lossy().into_owned(), differs: false });
        assert_eq!(fs::read(root.join(ID).join("work/sub/a.out")).unwrap(), b"kept");
        assert!(back(&root, ID, "work/../../x", b"no").is_err());
        assert!(back(&root, ID, "job.json", b"no").is_err());
        assert!(back(&root, "x", "log.txt", b"no").is_err());
        // (there already as it is: left, nothing said; there, changed since: left as it is, and said)
        assert!(!back(&root, ID, "work/sub/a.out", b"kept").unwrap().differs);
        fs::write(root.join(ID).join("work/sub/a.out"), b"edited by the chemist").unwrap();
        assert!(back(&root, ID, "work/sub/a.out", b"kept").unwrap().differs);
        assert_eq!(fs::read(root.join(ID).join("work/sub/a.out")).unwrap(), b"edited by the chemist");
        // (not what its SHA-256 says: not written, and nothing left)
        let err = write_back(&root, ID, "work/b.out", &"0".repeat(64), |f, sha| {
            sha.update(b"x");
            f.write_all(b"x").map_err(|e| e.to_string())
        });
        assert!(err.is_err());
        assert!(!root.join(ID).join("work/b.out").exists());
        // (no part file left beside them)
        assert_eq!(fs::read_dir(root.join(ID).join("work/sub")).unwrap().count(), 1);
        assert_eq!(fs::read_dir(root.join(ID).join("work")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_link_in_a_jobs_folder_is_never_followed_whatever_the_list_says() {
        let root = temp("link");
        let dir = job(&root);
        let secret = root.join("secret.txt");
        fs::write(&secret, "not a job's").unwrap();
        std::os::unix::fs::symlink(&secret, dir.join("work/linked.out")).unwrap();
        std::os::unix::fs::symlink(&root, dir.join("work/up")).unwrap();
        // (never listed)
        assert!(kept_files(&dir).iter().all(|f| f.name != "work/linked.out" && !f.name.starts_with("work/up")));
        // (and, named by the page all the same, refused)
        let sha256 = hex(&Sha256::digest(b"not a job's"));
        for name in ["work/linked.out", "work/up/secret.txt"] {
            let err = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), &[Appended { sha256: sha256.clone(), job: ID.into(), name: name.into(), from: None }]).unwrap_err();
            assert!(err.contains("could not be kept"), "{name}: {err}");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn carries_a_kept_file_from_the_workspace_file_it_was_opened_from_streamed_and_checked() {
        let root = temp("carry");
        let out = b"SCF Done ".repeat(10_000);
        let sha256 = hex(&Sha256::digest(&out));
        // (the workspace's file it was opened from: the file kept deflated, as files/<sha256>)
        let mut z = zip::ZipWriter::new(Cursor::new(base_zip("{}")));
        z = zip::ZipWriter::new_append(z.finish().unwrap()).unwrap();
        z.start_file(format!("files/{sha256}"), zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(&out).unwrap();
        let from = root.join("opened.meno");
        fs::create_dir_all(&root).unwrap();
        fs::write(&from, z.finish().unwrap().into_inner()).unwrap();
        let one = Appended { sha256: sha256.clone(), job: ID.into(), name: "work/run.out".into(), from: Some(from.clone()) };
        let made = append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), std::slice::from_ref(&one)).unwrap().into_inner();
        let mut bytes = Vec::new();
        zip::ZipArchive::new(Cursor::new(made)).unwrap().by_name(&format!("files/{sha256}")).unwrap().read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, out);
        // (one it does not hold, or holds as something else: the save fails)
        let other = Appended { sha256: "a".repeat(64), ..one.clone() };
        assert!(append_job_files(Cursor::new(base_zip("{}")), std::slice::from_ref(&root), &[other]).unwrap_err().contains("no longer holds"));
        // (and written back out from it, for Show files)
        let mut sources = Sources::new();
        let mut buf = vec![0u8; CHUNK];
        let back = write_back(&root.join("kept"), ID, "work/run.out", &sha256, |file, sha| carried(&mut sources, &from, &sha256, &mut Hashed { file, sha }, &mut buf)).unwrap();
        assert!(!back.differs);
        assert_eq!(fs::read(root.join("kept").join(ID).join("work/run.out")).unwrap(), out);
        fs::remove_dir_all(root).unwrap();
    }
}
