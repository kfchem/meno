//! Files a plugin needs besides its environment, as its manifest lists
//! them (`downloads`; docs/PLUGINS.md, *The manifest*): a model's trained
//! weights, say - too large for Meno to carry, and not a package uv or
//! pixi installs. Each is fetched once, from where the
//! manifest says, checked against the SHA-256 it gives before it is kept,
//! and kept in the plugin's environment's folder - `files` beside its
//! `venv` - so that taking the plugin away takes them too.
//!
//! It goes on the network only as Meno's network lets it (net.rs): as a
//! task with the purpose the plugin's environment is set up under - so only
//! once the user has allowed that, having been told of these files and
//! their size, and where from - its requests through Meno's proxy, to the
//! hosts that consent named alone. A download cut short is
//! taken up where it stopped, where the server allows it.
//!
//! One may instead be a program the plugin runs, Meno's own copy of it
//! (`provides`: Blender, its official build for this system and processor;
//! docs/PLUGINS.md, *A program Meno fetches*) - fetched as the rest are, as
//! the plugin is set up. It is an archive, unpacked into the plugin's
//! `files` once its SHA-256 is checked - a disk image mounted read-only and
//! the app copied out of it as it is, signature and all; a zip or a tar.xz
//! opened by the system's own `tar` - and the archive then thrown away; a
//! stamp beside what it unpacked says it is whole. A job runs the program
//! from there (jobs.rs `plugin_program`).

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

use crate::net::Net;

/// The most a file may be: a model's weights, a few gigabytes at most.
const MOST_BYTES: u64 = 20_000_000_000;

/// A file a plugin downloads, as its manifest gives it: its name in the
/// plugin's `files` folder, where it is fetched from, its SHA-256 and its
/// size in bytes - and, for an archive, the system and processor it is for,
/// how it is unpacked, where the program is in it, and the name the plugin
/// runs it by (`provides`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Download {
    pub file: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
    /// The system it is for (`macos`, `windows`, `linux`); none, every one.
    pub system: Option<String>,
    /// The processor it is for (`aarch64`, `x86_64`); none, every one.
    pub arch: Option<String>,
    /// How the archive it is is opened; none, it is kept as it is.
    pub unpack: Option<Unpack>,
    /// The program in what it unpacks to: a path inside it, `*` for the one folder there is.
    pub program: Option<String>,
    /// The program it is, by the name the plugin's steps and roles run it by.
    pub provides: Option<String>,
    /// How large one compressed with gzip is unpacked, in bytes, as the manifest says: never unpacked past it.
    pub unpacked_bytes: Option<u64>,
}

/// How an archive a plugin fetches is opened.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Unpack {
    /// A disk image (macOS): mounted read-only, the app named first in `program` copied out.
    Dmg,
    /// A zip, opened by the system's `tar`.
    Zip,
    /// A tar compressed with xz.
    TarXz,
    /// One file compressed with gzip - data, never a program: a fragment database, say - unpacked by Meno itself,
    /// as the file it was, into its folder.
    Gz,
}

impl Unpack {
    fn of(name: &str) -> Option<Unpack> {
        match name {
            "dmg" => Some(Unpack::Dmg),
            "zip" => Some(Unpack::Zip),
            "tar.xz" => Some(Unpack::TarXz),
            "gz" => Some(Unpack::Gz),
            _ => None,
        }
    }
    /// What an archive of it is called at its end.
    fn extension(self) -> &'static str {
        match self {
            Unpack::Dmg => ".dmg",
            Unpack::Zip => ".zip",
            Unpack::TarXz => ".tar.xz",
            Unpack::Gz => ".gz",
        }
    }
}

/// Whether `program` is a path inside an unpacked archive: names, or `*`
/// for the one folder there is, never above it; at most a few deep.
fn program_ok(program: &str) -> bool {
    let parts: Vec<&str> = program.split('/').collect();
    (1..=8).contains(&parts.len())
        && program.len() <= 200
        && parts.iter().all(|p| *p == "*" || (!p.is_empty() && *p != "." && *p != ".." && !p.contains(['\\', ':', '*']) && p.bytes().all(|b| b.is_ascii_graphic() || b == b' ')))
}

/// Whether a download is for this computer: its system and processor, where it says one.
pub fn for_here(d: &Download) -> bool {
    d.system.as_deref().is_none_or(|s| s == crate::jobs::system()) && d.arch.as_deref().is_none_or(|a| a == std::env::consts::ARCH)
}

/// Whether a name can be a kept file's: a name, not a path - lower case
/// letters, digits, dots, hyphens and underscores, not starting with a dot.
/// The manifest's reader takes the same (src/lib/plugins/manifest.ts).
pub fn file_ok(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name.bytes().next().is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
        && !name.ends_with(".part")
}

/// Whether a URL is one a file may be fetched from: HTTPS, with a host, and
/// nothing in it that is not a URL's.
pub fn url_ok(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    url.len() <= 500
        && !host.is_empty()
        && !host.contains('@')
        && url.bytes().all(|b| b.is_ascii_graphic())
}

fn sha_ok(sha: &str) -> bool {
    sha.len() == 64 && sha.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The files a manifest lists, each as it must be; a list with any that is
/// not - or two of the same name - is refused whole: what a plugin needs is
/// all there or not at all.
pub fn downloads_of(manifest: &Value) -> Result<Vec<Download>, String> {
    let Some(list) = manifest.get("downloads") else {
        return Ok(Vec::new());
    };
    let list = list.as_array().ok_or("downloads is not a list")?;
    let mut out: Vec<Download> = Vec::new();
    for d in list {
        let text = |k: &str| d.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let file = text("file");
        let url = text("url");
        let sha256 = text("sha256");
        let bytes = d.get("bytes").and_then(Value::as_u64).unwrap_or(0);
        let given = |k: &str| d.get(k).map(|v| v.as_str().map(str::to_string).ok_or(()));
        let refused = || format!("a download the manifest lists is not one Meno takes: {d}");
        let system = given("system").transpose().map_err(|_| refused())?;
        let arch = given("arch").transpose().map_err(|_| refused())?;
        let unpack = match given("unpack").transpose().map_err(|_| refused())? {
            None => None,
            Some(u) => Some(Unpack::of(&u).ok_or_else(refused)?),
        };
        let program = given("program").transpose().map_err(|_| refused())?;
        let provides = given("provides").transpose().map_err(|_| refused())?;
        let unpacked_bytes = d.get("unpackedBytes").map(|v| v.as_u64().filter(|&n| n > 0).ok_or(())).transpose().map_err(|_| refused())?;
        if unpacked_bytes.is_some() != (unpack == Some(Unpack::Gz)) {
            return Err(refused());
        }
        if !file_ok(&file) || !url_ok(&url) || !sha_ok(&sha256) || bytes == 0 || bytes > MOST_BYTES {
            return Err(refused());
        }
        // (a program: an archive for one system, the program in it said)
        let system_ok = system.as_deref().is_none_or(|s| ["macos", "windows", "linux"].contains(&s));
        let arch_ok = arch.as_deref().is_none_or(|a| ["aarch64", "x86_64"].contains(&a));
        let archive_ok = unpack.is_none_or(|u| file.ends_with(u.extension()) && file.len() > u.extension().len());
        let program_said = program.as_deref().is_none_or(|p| {
            unpack.is_some_and(|u| u != Unpack::Gz) && program_ok(p) && (unpack != Some(Unpack::Dmg) || !p.starts_with('*'))
        });
        let copy_ok = provides.as_deref().is_none_or(|n| !n.is_empty() && n.len() <= 40 && n.bytes().all(|b| b.is_ascii_alphanumeric() || b"._+-".contains(&b)) && program.is_some() && system.is_some());
        if !system_ok || !arch_ok || !archive_ok || !program_said || !copy_ok {
            return Err(refused());
        }
        if out.iter().any(|o| o.file == file) {
            return Err(format!("{file} is listed twice"));
        }
        out.push(Download { file, url, sha256, bytes, system, arch, unpack, program, provides, unpacked_bytes });
    }
    Ok(out)
}

/// Where a plugin's files are kept, in the app data (`data`): `files` in
/// its environment's folder - uv's or pixi's - removed with it.
pub fn folder(data: &Path, id: &str, pixi: bool) -> PathBuf {
    let home = if pixi { data.join("pixi") } else { data.join("uv") };
    home.join(format!("plugin-{id}")).join("files")
}

/// How a file a plugin downloads stands in its folder.
#[derive(Debug, Clone, PartialEq)]
pub enum Held {
    /// There, as it was fetched: its size and SHA-256 the manifest's - an archive, unpacked whole.
    Whole,
    /// Not there - an archive, not unpacked whole. (One cut short is kept as `<file>.part`, never under its name.)
    Missing,
    /// There, but not its size, or its SHA-256 not the manifest's: changed, or damaged, since it was fetched.
    Changed,
    /// There, but it could not be read through - held by another program, not allowed, a share gone - and why: not
    /// known to be changed, so never fetched over, and read again the next time it is asked about.
    Unreadable(String),
}

/// What this launch found of each kept file's SHA-256, by its path: at the size and the time it was last changed
/// then, and whether it was the manifest's.
type Checked = std::collections::HashMap<PathBuf, (u64, Option<std::time::SystemTime>, String, bool)>;
static CHECKED: std::sync::OnceLock<std::sync::Mutex<Checked>> = std::sync::OnceLock::new();

/// How file `d` stands in `dir` (`Held`). One kept as it is is read through for its SHA-256 once a launch - it is
/// checked as it is fetched, and a model's weights are large - and again only where its size or the time it was last
/// changed is not what it was then. An archive is as its stamp says (`copy_of`): what it unpacked to is not read again.
pub fn held(dir: &Path, d: &Download) -> Held {
    if d.unpack.is_some() {
        return if copy_of(dir, d).is_some() { Held::Whole } else { Held::Missing };
    }
    let path = dir.join(&d.file);
    let meta = match std::fs::metadata(&path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Held::Missing,
        Err(e) => return Held::Unreadable(e.to_string()),
    };
    // (kept under its name only once it was all there and its hash the manifest's: another size is another file)
    if meta.len() != d.bytes {
        return Held::Changed;
    }
    let when = meta.modified().ok();
    let checked = CHECKED.get_or_init(Default::default);
    let known = checked.lock().ok().and_then(|c| c.get(&path).cloned());
    let ok = match known {
        Some((len, at, sha, ok)) if len == meta.len() && at == when && sha == d.sha256 => ok,
        _ => match hashed_so_far(&path) {
            Ok((h, _)) => {
                let ok = hex(h) == d.sha256;
                if let Ok(mut c) = checked.lock() {
                    c.insert(path, (meta.len(), when, d.sha256.clone(), ok));
                }
                ok
            }
            // (not read: nothing known of it - nothing kept, and read again the next time)
            Err(e) => return Held::Unreadable(e.to_string()),
        },
    };
    if ok { Held::Whole } else { Held::Changed }
}


/// The files a plugin needs as it is set up: those for this computer.
pub fn needed(downloads: &[Download]) -> Vec<Download> {
    downloads.iter().filter(|d| for_here(d)).cloned().collect()
}

/// What says an archive was unpacked whole: beside what it unpacked to, its SHA-256.
const STAMP: &str = ".meno-unpacked";

/// The folder an archive is unpacked to in `dir`: its name, without the archive's ending.
pub fn unpacked(dir: &Path, d: &Download) -> PathBuf {
    let ext = d.unpack.map(Unpack::extension).unwrap_or("");
    dir.join(d.file.strip_suffix(ext).unwrap_or(&d.file))
}

/// The program in `folder`, as `program` says where: `*` the one folder there is.
fn program_in(folder: &Path, program: &str) -> Option<PathBuf> {
    let mut at = folder.to_path_buf();
    for part in program.split('/') {
        if part == "*" {
            let mut dirs = std::fs::read_dir(&at).ok()?.flatten().filter(|e| e.path().is_dir() && !e.file_name().to_string_lossy().starts_with('.'));
            let one = dirs.next()?;
            if dirs.next().is_some() {
                return None;
            }
            at = one.path();
        } else {
            at = at.join(part);
        }
    }
    at.is_file().then_some(at)
}

/// The file one compressed with gzip unpacks to, in its folder: its name, without `.gz`.
fn gunzipped(folder: &Path, d: &Download) -> PathBuf {
    folder.join(d.file.strip_suffix(Unpack::Gz.extension()).unwrap_or(&d.file))
}

/// Meno's own copy of a program, where it was fetched and unpacked whole: the program in it - or, one file
/// compressed with gzip, that file.
pub fn copy_of(dir: &Path, d: &Download) -> Option<PathBuf> {
    let folder = unpacked(dir, d);
    let stamp = std::fs::read_to_string(folder.join(STAMP)).ok()?;
    if stamp.trim() != d.sha256 {
        return None;
    }
    if d.unpack == Some(Unpack::Gz) {
        let file = gunzipped(&folder, d);
        return file.is_file().then_some(file);
    }
    program_in(&folder, d.program.as_deref()?)
}

/// One file compressed with gzip unpacked, by Meno itself - no program on the system needed - into `to`.
fn gunzip(archive: &Path, to: &Path, most: u64) -> Result<(), String> {
    use std::io::Read as _;
    let from = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut out = std::fs::File::create(to).map_err(|e| e.to_string())?;
    // (never past what the manifest says it unpacks to: one byte more, and it is not what was asked to be set up)
    let wrote = std::io::copy(&mut flate2::read::GzDecoder::new(std::io::BufReader::new(from)).take(most + 1), &mut out).map_err(|e| e.to_string())?;
    if wrote > most {
        return Err(format!("it unpacks to more than the {most} bytes its manifest says"));
    }
    out.sync_all().map_err(|e| e.to_string())
}

/// Plugin `id`'s program `name`, where its manifest says Meno fetches it
/// (`provides`), in the app data `data`: the program itself, fetched for
/// this computer as the plugin was set up; why not, where it is not there.
/// None, where no download is it - a program of its environment's.
pub fn provided(data: &Path, manifest: &Value, id: &str, name: &str) -> Result<Option<PathBuf>, String> {
    let downloads = downloads_of(manifest)?;
    let mut its = downloads.iter().filter(|d| d.provides.as_deref() == Some(name)).peekable();
    if its.peek().is_none() {
        return Ok(None);
    }
    let plugin = manifest.get("name").and_then(Value::as_str).unwrap_or(id);
    let d = its.find(|d| for_here(d)).ok_or_else(|| format!("{plugin} is not for this computer"))?;
    let dir = folder(data, id, manifest.get("environment").and_then(Value::as_str) == Some("pixi"));
    copy_of(&dir, d).map(Some).ok_or_else(|| format!("{plugin} is not set up"))
}

/// A command run to its end, saying why where it did not end well.
fn run(program: &str, args: &[&std::ffi::OsStr]) -> Result<(), String> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    // (no console shown for it: Windows' tar is a console program)
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let said = String::from_utf8_lossy(&out.stderr);
    Err(format!("{program} {}", said.lines().last().unwrap_or("did not end well").trim()))
}

/// The system's `tar`: Windows' own, in its System32, where Windows is.
fn tar() -> String {
    if cfg!(windows) {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        format!(r"{root}\System32\tar.exe")
    } else {
        "/usr/bin/tar".into()
    }
}

/// A folder taken away whole - or not there at all. Where something holds a
/// file in it for a moment - on Windows, a virus checker looking into what
/// was just unpacked - tried again, a little later each time, for some
/// seconds in all.
fn removed(folder: &Path) -> std::io::Result<()> {
    let mut wait = std::time::Duration::from_millis(100);
    loop {
        match std::fs::remove_dir_all(folder) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) if wait > std::time::Duration::from_secs(2) => return Err(e),
            Err(_) => {
                std::thread::sleep(wait);
                wait *= 2;
            }
        }
    }
}

/// An archive fetched (`archive`, its hash checked) unpacked as its download
/// says, into the folder it goes to - what was there taken away first - and
/// stamped last: an unpacking cut short leaves no stamp, so it is no copy
/// Meno takes, and is unpacked again. (Not unpacked beside it and moved in:
/// on Windows a virus checker looking into what was just unpacked held the
/// move up.) The program in it, where it is there; why not.
pub fn unpack(archive: &Path, d: &Download, dir: &Path) -> Result<PathBuf, String> {
    let how = d.unpack.ok_or("not an archive")?;
    let program = if how == Unpack::Gz { "" } else { d.program.as_deref().ok_or("no program said")? };
    let folder = unpacked(dir, d);
    removed(&folder).map_err(|e| format!("{}: {e}", folder.display()))?;
    std::fs::create_dir_all(&folder).map_err(|e| format!("{}: {e}", folder.display()))?;
    let done = match how {
        Unpack::Zip => run(&tar(), &["-xf".as_ref(), archive.as_os_str(), "-C".as_ref(), folder.as_os_str()]),
        Unpack::TarXz => run(&tar(), &["-xJf".as_ref(), archive.as_os_str(), "-C".as_ref(), folder.as_os_str()]),
        Unpack::Dmg => unpack_dmg(archive, program, &folder, dir),
        Unpack::Gz => gunzip(archive, &gunzipped(&folder, d), d.unpacked_bytes.unwrap_or(0)),
    };
    if let Err(e) = done {
        let _ = removed(&folder);
        return Err(format!("{} could not be unpacked: {e}", d.file));
    }
    if how == Unpack::Gz {
        std::fs::write(folder.join(STAMP), &d.sha256).map_err(|e| format!("{}: {e}", folder.display()))?;
        return Ok(gunzipped(&folder, d));
    }
    let Some(found) = program_in(&folder, program) else {
        let _ = removed(&folder);
        return Err(format!("{} holds no {program}", d.file));
    };
    std::fs::write(folder.join(STAMP), &d.sha256).map_err(|e| format!("{}: {e}", folder.display()))?;
    Ok(found)
}

/// A disk image mounted read-only where nothing is shown of it, the item
/// `program` begins with copied out as it is - its signature kept - and the
/// image put away again (macOS: hdiutil and ditto, as the system has them).
fn unpack_dmg(image: &Path, program: &str, into: &Path, dir: &Path) -> Result<(), String> {
    let item = program.split('/').next().unwrap_or_default();
    let mount = dir.join(format!(".mount-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&mount).map_err(|e| format!("{}: {e}", mount.display()))?;
    let attached = run("/usr/bin/hdiutil", &["attach".as_ref(), "-nobrowse".as_ref(), "-readonly".as_ref(), "-noautoopen".as_ref(), "-mountpoint".as_ref(), mount.as_os_str(), image.as_os_str()]);
    let copied = attached.and_then(|_| run("/usr/bin/ditto", &[mount.join(item).as_os_str(), into.join(item).as_os_str()]));
    // (put away however it went: asked, then made to)
    if run("/usr/bin/hdiutil", &["detach".as_ref(), mount.as_os_str()]).is_err() {
        let _ = run("/usr/bin/hdiutil", &["detach".as_ref(), "-force".as_ref(), mount.as_os_str()]);
    }
    let _ = std::fs::remove_dir(&mount);
    copied
}

/// Where a plugin's files stand: the folder they are kept in, and those
/// still to be downloaded, by name, with their bytes all told.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FilesState {
    pub folder: String,
    pub missing: Vec<String>,
    pub bytes: u64,
    /// Of those missing, the ones there that are not as fetched: not their size, or their SHA-256 not the manifest's (`Held::Changed`).
    pub changed: Vec<String>,
    /// Those there that could not be read through, each with why ("model.pth: ..."): neither missing nor changed - not fetched over.
    pub unreadable: Vec<String>,
}

/// How far a plugin's files have come: bytes had, of all of those fetched.
#[derive(Serialize, Clone)]
struct Progress<'a> {
    plugin: &'a str,
    done: u64,
    total: u64,
}

fn manifest_of(app: &AppHandle, id: &str) -> Result<Value, String> {
    let path = app
        .path()
        .resolve(format!("resources/plugins/{id}/manifest.json"), BaseDirectory::Resource)
        .map_err(|e| format!("{id}'s manifest: {e}"))?;
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{id}'s manifest: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("{id}'s manifest: {e}"))
}

/// A plugin's files: where they stand; and, with `fetch`, those not kept
/// fetched - under the plugin's setting-up purpose, so refused unless the
/// user has allowed that, from the hosts its consent named (`hosts`,
/// lib/plugins/setUpSources.ts) alone - and kept, how far they have come
/// said as they come (`plugin-files:progress`); an archive unpacked, and
/// thrown away.
#[tauri::command]
pub async fn plugin_files(app: AppHandle, plugin: String, fetch: bool, hosts: Option<Vec<String>>) -> Result<FilesState, String> {
    if !crate::plugin_id_ok(&plugin) {
        return Err(format!("not a plugin's id: {plugin}"));
    }
    let manifest = manifest_of(&app, &plugin)?;
    let downloads = needed(&downloads_of(&manifest)?);
    let pixi = manifest.get("environment").and_then(Value::as_str) == Some("pixi");
    let data = crate::local_data_dir(&app)?;
    let dir = folder(&data, &plugin, pixi);
    // (each file's SHA-256 read through, where it is, off the async runtime: a model's weights take a while)
    let stand = {
        let (dir, downloads) = (dir.clone(), downloads.clone());
        tauri::async_runtime::spawn_blocking(move || downloads.iter().map(|d| held(&dir, d)).collect::<Vec<_>>())
            .await
            .map_err(|e| format!("checking {plugin}'s files: {e}"))?
    };
    let state = |missing: &[&Download]| FilesState {
        folder: dir.to_string_lossy().into_owned(),
        missing: missing.iter().map(|d| d.file.clone()).collect(),
        bytes: missing.iter().map(|d| d.bytes).sum(),
        changed: downloads.iter().zip(&stand).filter(|(d, h)| **h == Held::Changed && missing.iter().any(|m| m.file == d.file)).map(|(d, _)| d.file.clone()).collect(),
        unreadable: downloads
            .iter()
            .zip(&stand)
            .filter_map(|(d, h)| match h {
                Held::Unreadable(why) => Some(format!("{}: {why}", d.file)),
                _ => None,
            })
            .collect(),
    };
    let wanted: Vec<&Download> = downloads.iter().zip(&stand).filter(|(_, h)| matches!(h, Held::Missing | Held::Changed)).map(|(d, _)| d).collect();
    if !fetch || wanted.is_empty() {
        return Ok(state(&wanted));
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let name = manifest.get("name").and_then(Value::as_str).unwrap_or(&plugin).to_string();
    // (refused here when Meno is offline, or setting the plugin up was not allowed)
    let task = app.state::<Net>().begin(&format!("python-env:plugin-{plugin}"), &format!("Downloading what {name} needs"), hosts)?;
    let proxy = task.proxy_url().ok_or("Meno's network is not up")?;
    let client = client_builder()
        .user_agent(concat!("Meno/", env!("CARGO_PKG_VERSION")))
        .proxy(reqwest::Proxy::all(&proxy).map_err(|e| format!("proxy: {e}"))?)
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let total: u64 = wanted.iter().map(|d| d.bytes).sum();
    let mut before = 0;
    let mut said = Instant::now();
    for d in &wanted {
        let tell = |had: u64| {
            if said.elapsed() >= Duration::from_millis(250) || had == d.bytes {
                said = Instant::now();
                let _ = app.emit("plugin-files:progress", Progress { plugin: &plugin, done: before + had, total });
            }
        };
        let archive = dir.join(&d.file);
        // (an archive there whole - fetched, its unpacking cut short - is not fetched again)
        if d.unpack.is_none() || !whole(&archive, d) {
            // (stopped part of the way, taken up again of itself; failed after all, why kept with the task and in Meno's log)
            if let Err(e) = fetch_resuming(&client, d, &dir, tell, &RESUME_WAITS).await {
                let said = e.to_string();
                crate::logfile::logged!("Downloading what {name} needs: {said}");
                task.fail(&said);
                return Err(said);
            }
        }
        before += d.bytes;
        if d.unpack.is_some() {
            let _ = app.emit("plugin-files:progress", Progress { plugin: &plugin, done: before, total });
            let (got, dir_for) = ((*d).clone(), dir.clone());
            tauri::async_runtime::spawn_blocking(move || unpack(&dir_for.join(&got.file), &got, &dir_for))
                .await
                .map_err(|e| format!("unpacking: {e}"))??;
            let _ = std::fs::remove_file(&archive);
        }
    }
    task.finish(true);
    Ok(state(&[]))
}

/// Whether an archive fetched is there whole: its size, and its SHA-256, the manifest's.
fn whole(archive: &Path, d: &Download) -> bool {
    std::fs::metadata(archive).is_ok_and(|m| m.len() == d.bytes)
        && hashed_so_far(archive).is_ok_and(|(h, _)| hex(h) == d.sha256)
}

/// A SHA-256 as manifests write it: in lowercase hexadecimal.
fn hex(h: Sha256) -> String {
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// A client, the crypto it needs installed first (`rustls-no-provider`).
fn client_builder() -> reqwest::ClientBuilder {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
}

/// The SHA-256 of what a file holds so far, and how many bytes that is.
fn hashed_so_far(path: &Path) -> std::io::Result<(Sha256, u64)> {
    let mut hasher = Sha256::new();
    let mut f = std::fs::File::open(path)?;
    let mut buf = vec![0u8; 1 << 20];
    let mut n = 0u64;
    loop {
        let got = f.read(&mut buf)?;
        if got == 0 {
            return Ok((hasher, n));
        }
        hasher.update(&buf[..got]);
        n += got as u64;
    }
}

/// A size as the chemist reads it: in MB from a megabyte up, else in bytes.
fn sized(n: u64) -> String {
    if n >= 1_000_000 { format!("{:.1} MB", n as f64 / 1e6) } else { format!("{n} bytes") }
}

/// What is said of a download that stopped part of the way, `why`: how much came of how much, that it is kept, and
/// that adding the plugin again goes on from there.
fn stopped(d: &Download, had: u64, why: &str) -> Fetched {
    Fetched::Stopped(format!(
        "{} stopped after {} of {} ({why}). What came is kept: Add goes on from there.",
        d.file,
        sized(had),
        sized(d.bytes)
    ))
}

/// Why a file was not fetched: it stopped part of the way, what came kept to be taken up again (`fetch_resuming`); or
/// it failed otherwise - refused, not the file expected - and nothing is kept.
#[derive(Debug, PartialEq)]
pub enum Fetched {
    Stopped(String),
    Failed(String),
}

impl std::fmt::Display for Fetched {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Fetched::Stopped(s) | Fetched::Failed(s) => f.write_str(s),
        }
    }
}

/// How long a download that stopped part of the way waits before it is taken up again of itself, each time: four
/// times, each wait longer - the server's or the network's hiccup given time to pass.
pub const RESUME_WAITS: [Duration; 4] = [Duration::from_secs(2), Duration::from_secs(5), Duration::from_secs(15), Duration::from_secs(30)];

/// `fetch_one`, a download that stops part of the way taken up again from
/// where it stopped (a range asked for), after each of `waits` in turn -
/// each stop written to Meno's log, with how much came - and only then said
/// to have stopped, with how often it was taken up.
pub async fn fetch_resuming(client: &reqwest::Client, d: &Download, dir: &Path, mut tell: impl FnMut(u64), waits: &[Duration]) -> Result<(), Fetched> {
    let mut taken_up = 0;
    loop {
        match fetch_one(client, d, dir, &mut tell).await {
            Ok(()) => return Ok(()),
            Err(Fetched::Stopped(said)) if taken_up < waits.len() => {
                crate::logfile::logged!("{said} Taken up again in {} s.", waits[taken_up].as_secs());
                tokio::time::sleep(waits[taken_up]).await;
                taken_up += 1;
            }
            Err(Fetched::Stopped(said)) if taken_up > 0 => {
                return Err(Fetched::Stopped(said.replacen("). ", &format!("; taken up again {taken_up} times). "), 1)));
            }
            Err(e) => return Err(e),
        }
    }
}

/// One file fetched into `dir`: into `<file>.part` - taken up where an
/// earlier try left it, where the server sends the rest - then, all of it
/// there and its hash the manifest's, put in place; a file whose hash is
/// not is thrown away.
pub async fn fetch_one(client: &reqwest::Client, d: &Download, dir: &Path, mut tell: impl FnMut(u64)) -> Result<(), Fetched> {
    let part = dir.join(format!("{}.part", d.file));
    let (mut hasher, mut had) = match hashed_so_far(&part) {
        Ok((h, n)) if n > 0 && n < d.bytes => (h, n),
        _ => (Sha256::new(), 0),
    };
    let mut ask = client.get(&d.url);
    if had > 0 {
        ask = ask.header(reqwest::header::RANGE, format!("bytes={had}-"));
    }
    // (no answer at all, or one refused: nothing came this time - taken up again too, where anything came before)
    let mut response = ask.send().await.map_err(|e| if had > 0 { stopped(d, had, "the connection broke") } else { Fetched::Failed(format!("fetching {}: {e}", d.url)) })?;
    response = response.error_for_status().map_err(|e| Fetched::Failed(format!("fetching {}: {e}", d.url)))?;
    // (the server sends it all again: begun again)
    if had > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        hasher = Sha256::new();
        had = 0;
    }
    let mut out = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(had > 0)
        .truncate(had == 0)
        .open(&part)
        .map_err(|e| Fetched::Failed(format!("{}: {e}", part.display())))?;
    tell(had);
    // (the server gone quiet past the client's read timeout, or the connection broken, part of the way: what came is
    //  kept, and said so, with how to go on - never the client library's own words)
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(e) => {
                let _ = out.flush();
                let why = if e.is_timeout() { "the server stopped sending" } else { "the connection broke" };
                return Err(stopped(d, had, why));
            }
        };
        if had + chunk.len() as u64 > d.bytes {
            drop(out);
            let _ = std::fs::remove_file(&part);
            return Err(Fetched::Failed(format!("{} is larger than it should be", d.url)));
        }
        hasher.update(&chunk);
        out.write_all(&chunk).map_err(|e| Fetched::Failed(format!("{}: {e}", part.display())))?;
        had += chunk.len() as u64;
        tell(had);
    }
    out.flush().map_err(|e| Fetched::Failed(format!("{}: {e}", part.display())))?;
    drop(out);
    if had != d.bytes {
        // (kept, to be taken up again)
        return Err(stopped(d, had, "the server ended it early"));
    }
    let got = hex(hasher);
    if got != d.sha256 {
        let _ = std::fs::remove_file(&part);
        return Err(Fetched::Failed(format!("{} is not the file Meno expects: its SHA-256 is {got}", d.url)));
    }
    std::fs::rename(&part, dir.join(&d.file)).map_err(|e| Fetched::Failed(format!("{}: {e}", part.display())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// A folder of its own for a test, taken away when it is dropped.
    struct Scratch(PathBuf);
    impl Scratch {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("meno-plugfiles-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&dir).unwrap();
            Scratch(dir)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// The files not kept as they were fetched (`held`): as `plugin_files` finds them.
    fn missing<'a>(dir: &Path, downloads: &'a [Download]) -> Vec<&'a Download> {
        downloads.iter().filter(|d| matches!(held(dir, d), Held::Missing | Held::Changed)).collect()
    }

    fn sha(bytes: &[u8]) -> String {
        Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn takes_only_files_as_they_must_be() {
        let good = json!({"file": "model.pth", "url": "https://huggingface.co/x/y/resolve/abc/model.pth", "sha256": "a".repeat(64), "bytes": 10});
        let got = downloads_of(&json!({"downloads": [good]})).unwrap();
        assert_eq!(got, vec![Download { file: "model.pth".into(), url: "https://huggingface.co/x/y/resolve/abc/model.pth".into(), sha256: "a".repeat(64), bytes: 10, ..Default::default() }]);
        assert_eq!(downloads_of(&json!({"name": "x"})).unwrap(), vec![]);
        for bad in [
            json!({"file": "../model.pth", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": "Model.pth", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": ".hidden", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": "m.part", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": "m", "url": "http://h/m", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": "m", "url": "https://user@h/m", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": "m", "url": "https://h/a b", "sha256": "a".repeat(64), "bytes": 10}),
            json!({"file": "m", "url": "https://h/m", "sha256": "A".repeat(64), "bytes": 10}),
            json!({"file": "m", "url": "https://h/m", "sha256": "a".repeat(63), "bytes": 10}),
            json!({"file": "m", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 0}),
            json!({"file": "m", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 30_000_000_000u64}),
        ] {
            assert!(downloads_of(&json!({"downloads": [bad.clone()]})).is_err(), "{bad}");
        }
        let one = json!({"file": "m", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 1});
        assert!(downloads_of(&json!({"downloads": [one.clone(), one]})).is_err());
    }

    /// A program, as a manifest gives one: an archive for this computer.
    fn archive(file: &str, unpack: &str, program: &str) -> Value {
        json!({"file": file, "url": "https://download.example.org/x", "sha256": "a".repeat(64), "bytes": 10,
            "system": crate::jobs::system(), "arch": std::env::consts::ARCH, "unpack": unpack, "program": program, "provides": "blender"})
    }

    #[test]
    fn takes_a_program_for_a_system_its_archive_and_where_the_program_is_in_it() {
        let got = downloads_of(&json!({"downloads": [archive("blender-5.2.2-windows-x64.zip", "zip", "*/blender.exe")]})).unwrap();
        assert_eq!(got[0].unpack, Some(Unpack::Zip));
        assert_eq!((got[0].program.as_deref(), got[0].provides.as_deref()), (Some("*/blender.exe"), Some("blender")));
        let with = |k: &str, v: Value| {
            let mut a = archive("blender-5.2.2-macos-arm64.dmg", "dmg", "Blender.app/Contents/MacOS/Blender");
            a[k] = v;
            downloads_of(&json!({"downloads": [a]}))
        };
        assert!(with("unpack", json!("dmg")).is_ok());
        for (k, v) in [
            ("unpack", json!("rar")),
            ("unpack", json!("zip")),
            ("program", json!("../Blender")),
            ("program", json!("*/Blender")),
            ("program", json!("/Applications/Blender.app")),
            ("system", json!("amiga")),
            ("arch", json!("ppc")),
            ("provides", json!("../blender")),
            ("program", Value::Null),
        ] {
            assert!(with(k, v.clone()).is_err(), "{k}: {v}");
        }
        // (a program says what it is for, and where it is in its archive)
        let mut a = archive("b.zip", "zip", "*/b.exe");
        a.as_object_mut().unwrap().remove("program");
        assert!(downloads_of(&json!({"downloads": [a]})).is_err());
        let mut a = archive("b.zip", "zip", "*/b.exe");
        a.as_object_mut().unwrap().remove("system");
        assert!(downloads_of(&json!({"downloads": [a]})).is_err());
    }

    #[test]
    fn reads_blender_s_official_builds_as_meno_carries_them() {
        let text = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/plugins/blender/manifest.json")).unwrap();
        let all = downloads_of(&serde_json::from_str(&text).unwrap()).unwrap();
        assert_eq!(all.len(), 3);
        assert!(all.iter().all(|d| d.provides.as_deref() == Some("blender") && d.url.starts_with("https://download.blender.org/release/")));
        let mac = all.iter().find(|d| d.system.as_deref() == Some("macos")).unwrap();
        assert_eq!((mac.unpack, mac.program.as_deref()), (Some(Unpack::Dmg), Some("Blender.app/Contents/MacOS/Blender")));
        // (the one for this computer fetched as the plugin is set up, where there is one)
        assert!(needed(&all).len() <= 1);
        if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            assert_eq!(needed(&all)[0].file, "blender-5.2.2-macos-arm64.dmg");
        }
    }

    #[test]
    fn sets_a_plugin_up_with_what_is_for_this_computer_alone() {
        let elsewhere = if crate::jobs::system() == "windows" { "macos" } else { "windows" };
        let all = downloads_of(&json!({"downloads": [
            {"file": "model.pth", "url": "https://h/m", "sha256": "a".repeat(64), "bytes": 10},
            {"file": "other.pth", "url": "https://h/o", "sha256": "a".repeat(64), "bytes": 10, "system": elsewhere},
            archive("blender.zip", "zip", "*/blender.exe"),
        ]}))
        .unwrap();
        assert_eq!(needed(&all).iter().map(|d| d.file.as_str()).collect::<Vec<_>>(), ["model.pth", "blender.zip"]);
    }

    /// An archive's download, for the archive at `path`.
    fn copy(path: &Path, unpack: Unpack, program: &str) -> Download {
        let bytes = std::fs::read(path).unwrap();
        Download {
            file: path.file_name().unwrap().to_string_lossy().into_owned(),
            url: "https://h/x".into(),
            sha256: sha(&bytes),
            bytes: bytes.len() as u64,
            system: Some(crate::jobs::system().into()),
            arch: None,
            unpack: Some(unpack),
            program: Some(program.into()),
            provides: Some("blender".into()),
            unpacked_bytes: None,
        }
    }

    /// A folder holding a program in a folder of its own - as an archive holds Blender.
    fn tree(root: &Path, top: &str, program: &str) {
        let at = root.join(top).join(program);
        std::fs::create_dir_all(at.parent().unwrap()).unwrap();
        std::fs::write(&at, b"#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&at, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn unpacks_a_zip_finding_the_program_in_the_one_folder_there_is_and_stamps_it_whole() {
        let dir = Scratch::new();
        let src = Scratch::new();
        tree(src.path(), "blender-5.2.2-windows-x64", "blender.exe");
        let zip = dir.path().join("blender-5.2.2-windows-x64.zip");
        run(&tar(), &["-a".as_ref(), "-cf".as_ref(), zip.as_os_str(), "-C".as_ref(), src.path().as_os_str(), "blender-5.2.2-windows-x64".as_ref()]).unwrap();
        let d = copy(&zip, Unpack::Zip, "*/blender.exe");
        assert_eq!(copy_of(dir.path(), &d), None);
        let program = unpack(&zip, &d, dir.path()).unwrap();
        assert_eq!(program, dir.path().join("blender-5.2.2-windows-x64").join("blender-5.2.2-windows-x64").join("blender.exe"));
        assert_eq!(copy_of(dir.path(), &d), Some(program.clone()));
        // (a stamp that is not this archive's: not a copy Meno takes)
        std::fs::write(unpacked(dir.path(), &d).join(STAMP), "0".repeat(64)).unwrap();
        assert_eq!(copy_of(dir.path(), &d), None);
        // (unpacked again over one cut short - no stamp - and stamped)
        std::fs::remove_file(unpacked(dir.path(), &d).join(STAMP)).unwrap();
        std::fs::write(unpacked(dir.path(), &d).join("left.txt"), "cut short").unwrap();
        assert_eq!(unpack(&zip, &d, dir.path()).unwrap(), program);
        assert!(!unpacked(dir.path(), &d).join("left.txt").exists());
        assert_eq!(copy_of(dir.path(), &d), Some(program));
        // (one without the program said: refused, nothing left of it)
        let bad = Download { program: Some("*/nothing.exe".into()), ..d };
        assert!(unpack(&zip, &bad, dir.path()).unwrap_err().contains("holds no */nothing.exe"));
        assert!(!unpacked(dir.path(), &bad).exists());
    }

    #[test]
    fn unpacks_one_file_compressed_with_gzip_itself_and_stamps_it_whole() {
        use std::io::Write as _;
        let dir = Scratch::new();
        let gz = dir.path().join("fragments.db.gz");
        let body: Vec<u8> = (0..200_000u32).flat_map(|i| (i % 251).to_le_bytes()).collect();
        let mut enc = flate2::write::GzEncoder::new(std::fs::File::create(&gz).unwrap(), flate2::Compression::fast());
        enc.write_all(&body).unwrap();
        enc.finish().unwrap();
        let bytes = std::fs::read(&gz).unwrap();
        let manifest = json!({"downloads": [{"file": "fragments.db.gz", "url": "https://h/f", "sha256": sha(&bytes), "bytes": bytes.len(), "unpack": "gz", "unpackedBytes": body.len()}]});
        let d = downloads_of(&manifest).unwrap().remove(0);
        assert_eq!(d.unpack, Some(Unpack::Gz));
        assert_eq!(missing(dir.path(), std::slice::from_ref(&d)).len(), 1);
        let file = unpack(&gz, &d, dir.path()).unwrap();
        assert_eq!(file, dir.path().join("fragments.db").join("fragments.db"));
        assert_eq!(std::fs::read(&file).unwrap(), body);
        assert_eq!(copy_of(dir.path(), &d), Some(file.clone()));
        assert!(missing(dir.path(), std::slice::from_ref(&d)).is_empty());
        // (cut short - no stamp - still missing)
        std::fs::remove_file(unpacked(dir.path(), &d).join(STAMP)).unwrap();
        assert_eq!(copy_of(dir.path(), &d), None);
        // (unpacking to more than its manifest says: refused, nothing left of it)
        let short = Download { unpacked_bytes: Some(body.len() as u64 - 1), ..d.clone() };
        assert!(unpack(&gz, &short, dir.path()).unwrap_err().contains("more than the"));
        assert!(!unpacked(dir.path(), &short).exists());
        // (gz without its size unpacked, or a size on what is not gz: refused)
        let mut bare = manifest["downloads"][0].clone();
        bare.as_object_mut().unwrap().remove("unpackedBytes");
        assert!(downloads_of(&json!({"downloads": [bare]})).is_err());
        // (not gzip: refused, nothing left of it)
        std::fs::write(&gz, b"not gzip").unwrap();
        assert!(unpack(&gz, &d, dir.path()).unwrap_err().contains("could not be unpacked"));
        assert!(!unpacked(dir.path(), &d).exists());
        // (data, never a program: one said in it is refused)
        let mut bad = manifest["downloads"][0].clone();
        bad["program"] = json!("fragments.db");
        assert!(downloads_of(&json!({"downloads": [bad]})).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn unpacks_a_tar_xz() {
        let dir = Scratch::new();
        let src = Scratch::new();
        tree(src.path(), "blender-5.2.2-linux-x64", "blender");
        let archive = dir.path().join("blender-5.2.2-linux-x64.tar.xz");
        run(&tar(), &["-cJf".as_ref(), archive.as_os_str(), "-C".as_ref(), src.path().as_os_str(), "blender-5.2.2-linux-x64".as_ref()]).unwrap();
        let d = copy(&archive, Unpack::TarXz, "*/blender");
        let program = unpack(&archive, &d, dir.path()).unwrap();
        assert!(program.ends_with("blender-5.2.2-linux-x64/blender"));
        assert_eq!(copy_of(dir.path(), &d), Some(program));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn copies_the_app_out_of_a_disk_image_and_puts_the_image_away() {
        let dir = Scratch::new();
        let src = Scratch::new();
        tree(src.path(), "Blender.app", "Contents/MacOS/Blender");
        std::os::unix::fs::symlink("/Applications", src.path().join("Applications")).unwrap();
        let image = dir.path().join("blender-5.2.2-macos-arm64.dmg");
        run("/usr/bin/hdiutil", &["create".as_ref(), "-quiet".as_ref(), "-srcfolder".as_ref(), src.path().as_os_str(), "-format".as_ref(), "UDZO".as_ref(), image.as_os_str()]).unwrap();
        let d = copy(&image, Unpack::Dmg, "Blender.app/Contents/MacOS/Blender");
        let program = unpack(&image, &d, dir.path()).unwrap();
        assert_eq!(program, dir.path().join("blender-5.2.2-macos-arm64").join("Blender.app/Contents/MacOS/Blender"));
        // (the app alone, not the rest of the image; the image put away)
        let kept: Vec<String> = std::fs::read_dir(unpacked(dir.path(), &d)).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(kept.iter().filter(|n| !n.starts_with('.')).collect::<Vec<_>>(), ["Blender.app"]);
        assert!(!std::fs::read_dir(dir.path()).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with(".mount-")));
    }

    /// The real thing, where one is named (BLENDER_DMG: Blender's official
    /// disk image, as Blender's site gives it): the app copied out whole,
    /// its signature as Blender's makers made it.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn copies_blender_out_of_its_disk_image_its_signature_whole() {
        let Ok(image) = std::env::var("BLENDER_DMG") else { return };
        let dir = Scratch::new();
        let d = copy(Path::new(&image), Unpack::Dmg, "Blender.app/Contents/MacOS/Blender");
        let program = unpack(Path::new(&image), &d, dir.path()).unwrap();
        let app = program.ancestors().nth(3).unwrap().to_path_buf();
        run("/usr/bin/codesign", &["--verify".as_ref(), "--deep".as_ref(), "--strict".as_ref(), app.as_os_str()]).unwrap();
        let said = std::process::Command::new(&program).arg("--version").output().unwrap();
        assert!(String::from_utf8_lossy(&said.stdout).starts_with("Blender 5.2.2"));
    }

    #[cfg(unix)]
    #[test]
    fn takes_a_folder_away_once_what_held_it_lets_go() {
        use std::os::unix::fs::PermissionsExt;
        let dir = Scratch::new();
        let folder = dir.path().join("blender-5.2.2-macos-arm64");
        tree(&folder, "Blender.app", "Contents/MacOS/Blender");
        // (held for a moment: nothing in it can be taken away - as a virus checker holds a file on Windows)
        let held = folder.join("Blender.app");
        std::fs::set_permissions(&held, std::fs::Permissions::from_mode(0o555)).unwrap();
        let letting_go = {
            let held = held.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                std::fs::set_permissions(&held, std::fs::Permissions::from_mode(0o755)).unwrap();
            })
        };
        removed(&folder).unwrap();
        letting_go.join().unwrap();
        assert!(!folder.exists());
        // (and one not there at all: nothing to do)
        removed(&folder).unwrap();
    }

    #[test]
    fn says_a_kept_file_whose_hash_is_no_longer_the_manifests_is_changed() {
        let dir = Scratch::new();
        let body = b"trained weights".to_vec();
        let d = Download { file: "model.bin".into(), url: "https://h/model.bin".into(), sha256: sha(&body), bytes: body.len() as u64, ..Default::default() };
        let path = dir.path().join("model.bin");
        assert_eq!(held(dir.path(), &d), Held::Missing);
        std::fs::write(&path, &body).unwrap();
        assert_eq!(held(dir.path(), &d), Held::Whole);
        assert!(missing(dir.path(), std::slice::from_ref(&d)).is_empty());
        // (the same size, other bytes - changed, or damaged, since - and the time it was changed moved on: read again)
        let at = std::fs::metadata(&path).unwrap().modified().unwrap();
        std::fs::write(&path, b"trained weightz").unwrap();
        let f = std::fs::File::options().write(true).open(&path).unwrap();
        f.set_modified(at + std::time::Duration::from_secs(5)).unwrap();
        drop(f);
        assert_eq!(held(dir.path(), &d), Held::Changed);
        assert_eq!(missing(dir.path(), std::slice::from_ref(&d)).len(), 1);
        // (put right: whole again)
        std::fs::write(&path, &body).unwrap();
        let f = std::fs::File::options().write(true).open(&path).unwrap();
        f.set_modified(at + std::time::Duration::from_secs(10)).unwrap();
        drop(f);
        assert_eq!(held(dir.path(), &d), Held::Whole);
        // (another size: changed too - one cut short is kept as model.bin.part, never under its name)
        std::fs::write(&path, b"weights").unwrap();
        assert_eq!(held(dir.path(), &d), Held::Changed);
    }

    #[cfg(unix)]
    #[test]
    fn says_a_kept_file_it_could_not_read_is_unreadable_never_changed_and_reads_it_again_next_time() {
        use std::os::unix::fs::PermissionsExt;
        let dir = Scratch::new();
        let body = b"weights all there".to_vec();
        let d = Download { file: "held.bin".into(), url: "https://h/held.bin".into(), sha256: sha(&body), bytes: body.len() as u64, ..Default::default() };
        let path = dir.path().join("held.bin");
        std::fs::write(&path, &body).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();
        // (not readable: why said, and not among those fetched again)
        assert!(matches!(held(dir.path(), &d), Held::Unreadable(why) if !why.is_empty()));
        assert!(missing(dir.path(), std::slice::from_ref(&d)).is_empty());
        // (readable again, its size and time as they were: read through, not taken from before)
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(held(dir.path(), &d), Held::Whole);
    }

    #[test]
    fn reads_a_kept_file_through_once_a_launch_while_its_size_and_time_stay() {
        let dir = Scratch::new();
        let body = b"0123456789".to_vec();
        let d = Download { file: "w.bin".into(), url: "https://h/w.bin".into(), sha256: sha(&body), bytes: body.len() as u64, ..Default::default() };
        let path = dir.path().join("w.bin");
        std::fs::write(&path, &body).unwrap();
        let at = std::fs::metadata(&path).unwrap().modified().unwrap();
        assert_eq!(held(dir.path(), &d), Held::Whole);
        // (other bytes at the same size, its time put back: not read again this launch - the check is once a launch)
        std::fs::write(&path, b"9876543210").unwrap();
        let f = std::fs::File::options().write(true).open(&path).unwrap();
        f.set_modified(at).unwrap();
        drop(f);
        assert_eq!(held(dir.path(), &d), Held::Whole);
        // (its time moved on: read again)
        let f = std::fs::File::options().write(true).open(&path).unwrap();
        f.set_modified(at + std::time::Duration::from_secs(1)).unwrap();
        drop(f);
        assert_eq!(held(dir.path(), &d), Held::Changed);
    }

    #[test]
    fn finds_the_program_a_plugin_fetched_as_it_was_set_up() {
        let data = Scratch::new();
        let manifest = json!({"name": "Blender", "environment": "uv", "downloads": [archive("blender-x.tar.xz", "tar.xz", "*/blender")]});
        assert_eq!(provided(data.path(), &manifest, "blender", "blender").unwrap_err(), "Blender is not set up");
        let d = &downloads_of(&manifest).unwrap()[0];
        let dir = folder(data.path(), "blender", false);
        // (not unpacked whole: still to be fetched)
        assert_eq!(missing(&dir, std::slice::from_ref(d)).len(), 1);
        tree(&unpacked(&dir, d), "blender-x", "blender");
        std::fs::write(unpacked(&dir, d).join(STAMP), &d.sha256).unwrap();
        assert!(missing(&dir, std::slice::from_ref(d)).is_empty());
        assert_eq!(provided(data.path(), &manifest, "blender", "blender").unwrap(), Some(unpacked(&dir, d).join("blender-x").join("blender")));
        // (a program of its environment's: none here)
        assert_eq!(provided(data.path(), &manifest, "blender", "python").unwrap(), None);
        // (one for another computer alone)
        let elsewhere = if crate::jobs::system() == "windows" { "macos" } else { "windows" };
        let mut other = archive("blender-y.zip", "zip", "*/blender");
        other["system"] = json!(elsewhere);
        let manifest = json!({"name": "Blender", "downloads": [other]});
        assert_eq!(provided(data.path(), &manifest, "blender", "blender").unwrap_err(), "Blender is not for this computer");
    }

    #[test]
    fn keeps_a_plugins_files_in_its_environments_folder() {
        let data = Path::new("/data");
        assert_eq!(folder(data, "molscribe", false), Path::new("/data/uv/plugin-molscribe/files"));
        assert_eq!(folder(data, "x", true), Path::new("/data/pixi/plugin-x/files"));
    }

    #[test]
    fn a_file_not_its_size_is_fetched_again_but_asked_about_as_changed() {
        let dir = Scratch::new();
        let d = |file: &str, bytes| Download { file: file.into(), url: "https://h/m".into(), sha256: sha(b"12345"), bytes, ..Default::default() };
        std::fs::write(dir.path().join("whole"), b"12345").unwrap();
        std::fs::write(dir.path().join("short"), b"12").unwrap();
        let all = [d("whole", 5), d("short", 5), d("none", 5)];
        let left: Vec<&str> = missing(dir.path(), &all).iter().map(|d| d.file.as_str()).collect();
        assert_eq!(left, ["short", "none"]);
        // (one not its size is there, but not as fetched: changed, asked about before it is fetched over)
        assert_eq!(held(dir.path(), &all[1]), Held::Changed);
        assert_eq!(held(dir.path(), &all[2]), Held::Missing);
    }

    /// A server of one body, at `/f`, for as many requests as asked: the
    /// rest of it where a range is asked and `ranges` is on, else all of it.
    async fn serve(body: Vec<u8>, ranges: bool, requests: usize) -> (String, tokio::task::JoinHandle<Vec<String>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/f", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let mut asked = Vec::new();
            for _ in 0..requests {
                let (mut s, _) = listener.accept().await.unwrap();
                let mut head = Vec::new();
                let mut b = [0u8; 1];
                while !head.ends_with(b"\r\n\r\n") {
                    s.read_exact(&mut b).await.unwrap();
                    head.push(b[0]);
                }
                let head = String::from_utf8(head).unwrap();
                let from = head
                    .lines()
                    .find_map(|l| l.to_ascii_lowercase().strip_prefix("range: bytes=").map(|r| r.trim_end_matches('-').parse::<usize>().unwrap()));
                asked.push(from.map(|f| format!("from {f}")).unwrap_or_else(|| "all".into()));
                let (status, part) = match from {
                    Some(f) if ranges => ("206 Partial Content", &body[f..]),
                    _ => ("200 OK", &body[..]),
                };
                let reply = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", part.len());
                s.write_all(reply.as_bytes()).await.unwrap();
                s.write_all(part).await.unwrap();
            }
            asked
        });
        (url, handle)
    }

    fn download(url: &str, body: &[u8]) -> Download {
        // (the tests' server is plain HTTP on this computer: the download is made as the manifest's would be, but for that)
        Download { file: "model.bin".into(), url: url.into(), sha256: sha(body), bytes: body.len() as u64, ..Default::default() }
    }

    #[tokio::test]
    async fn fetches_a_file_and_keeps_it_once_its_hash_is_right() {
        let body: Vec<u8> = (0..100_000u32).map(|i| (i % 251) as u8).collect();
        let (url, server) = serve(body.clone(), true, 1).await;
        let dir = Scratch::new();
        let mut seen = Vec::new();
        fetch_one(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |n| seen.push(n)).await.unwrap();
        assert_eq!(std::fs::read(dir.path().join("model.bin")).unwrap(), body);
        assert!(!dir.path().join("model.bin.part").exists());
        assert_eq!(*seen.last().unwrap(), body.len() as u64);
        assert_eq!(server.await.unwrap(), ["all"]);
    }

    #[tokio::test]
    async fn takes_a_download_up_where_it_stopped_or_begins_again() {
        let body: Vec<u8> = (0..50_000u32).map(|i| (i % 241) as u8).collect();
        for ranges in [true, false] {
            let (url, server) = serve(body.clone(), ranges, 1).await;
            let dir = Scratch::new();
            std::fs::write(dir.path().join("model.bin.part"), &body[..20_000]).unwrap();
            fetch_one(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |_| {}).await.unwrap();
            assert_eq!(std::fs::read(dir.path().join("model.bin")).unwrap(), body, "ranges {ranges}");
            assert_eq!(server.await.unwrap(), ["from 20000"]);
        }
    }

    #[tokio::test]
    async fn throws_away_a_file_that_is_not_the_one_expected() {
        let body = b"not the weights".to_vec();
        let (url, _server) = serve(body.clone(), true, 1).await;
        let dir = Scratch::new();
        let mut d = download(&url, &body);
        d.sha256 = "0".repeat(64);
        let err = fetch_one(&client_builder().build().unwrap(), &d, dir.path(), |_| {}).await.unwrap_err();
        assert!(matches!(&err, Fetched::Failed(s) if s.contains("not the file Meno expects")), "{err}");
        assert!(!dir.path().join("model.bin").exists() && !dir.path().join("model.bin.part").exists());
    }

    #[tokio::test]
    async fn keeps_what_came_of_a_download_cut_short() {
        let body = b"0123456789".to_vec();
        let (url, _server) = serve(body[..4].to_vec(), true, 1).await;
        let dir = Scratch::new();
        let err = fetch_one(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |_| {}).await.unwrap_err();
        assert_eq!(err.to_string(), "model.bin stopped after 4 bytes of 10 bytes (the server ended it early). What came is kept: Add goes on from there.");
        assert_eq!(std::fs::read(dir.path().join("model.bin.part")).unwrap(), b"0123");
    }

    #[tokio::test]
    async fn says_a_download_the_server_stopped_sending_is_kept_to_go_on_with() {
        // (half of it sent, then nothing - past the client's read timeout: said in words, what came kept, and taken
        //  up from there by the next try)
        let body: Vec<u8> = (0..2_000_000u32).map(|i| (i % 239) as u8).collect();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/f", listener.local_addr().unwrap());
        let half = body[..1_200_000].to_vec();
        let size = body.len();
        let server = tokio::spawn(async move {
            let (mut s, _) = listener.accept().await.unwrap();
            let mut head = Vec::new();
            let mut b = [0u8; 1];
            while !head.ends_with(b"\r\n\r\n") {
                s.read_exact(&mut b).await.unwrap();
                head.push(b[0]);
            }
            s.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {size}\r\n\r\n").as_bytes()).await.unwrap();
            s.write_all(&half).await.unwrap();
            tokio::time::sleep(Duration::from_secs(3)).await;
        });
        let dir = Scratch::new();
        let client = client_builder().read_timeout(Duration::from_millis(500)).build().unwrap();
        let err = fetch_one(&client, &download(&url, &body), dir.path(), |_| {}).await.unwrap_err();
        assert_eq!(err.to_string(), "model.bin stopped after 1.2 MB of 2.0 MB (the server stopped sending). What came is kept: Add goes on from there.");
        assert_eq!(std::fs::read(dir.path().join("model.bin.part")).unwrap().len(), 1_200_000);
        server.abort();
        let (url, again) = serve(body.clone(), true, 1).await;
        fetch_one(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |_| {}).await.unwrap();
        assert_eq!(std::fs::read(dir.path().join("model.bin")).unwrap(), body);
        assert_eq!(again.await.unwrap(), ["from 1200000"]);
    }

    /// A server of one body, at `/f`, that says it sends all that was asked
    /// for - all of it, or the rest from a range - but closes the connection
    /// after `cuts[k]` bytes of the body on the k-th request (none: all), as
    /// a CDN that drops a long download does. What each request asked for, in turn.
    async fn serve_cut(body: Vec<u8>, cuts: Vec<Option<usize>>) -> (String, tokio::task::JoinHandle<Vec<String>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/f", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let mut asked = Vec::new();
            for cut in cuts {
                let (mut s, _) = listener.accept().await.unwrap();
                let mut head = Vec::new();
                let mut b = [0u8; 1];
                while !head.ends_with(b"\r\n\r\n") {
                    s.read_exact(&mut b).await.unwrap();
                    head.push(b[0]);
                }
                let head = String::from_utf8(head).unwrap();
                let from = head
                    .lines()
                    .find_map(|l| l.to_ascii_lowercase().strip_prefix("range: bytes=").map(|r| r.trim_end_matches('-').parse::<usize>().unwrap()))
                    .unwrap_or(0);
                asked.push(if from > 0 { format!("from {from}") } else { "all".into() });
                let status = if from > 0 { "206 Partial Content" } else { "200 OK" };
                let reply = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len() - from);
                s.write_all(reply.as_bytes()).await.unwrap();
                let to = cut.map_or(body.len(), |c| (from + c).min(body.len()));
                s.write_all(&body[from..to]).await.unwrap();
                // (closed there, short of what it said it would send)
                let _ = s.shutdown().await;
            }
            asked
        });
        (url, handle)
    }

    #[tokio::test]
    async fn takes_a_download_cut_short_up_again_of_itself_from_where_it_stopped() {
        let body: Vec<u8> = (0..300_000u32).map(|i| (i % 233) as u8).collect();
        // (cut after 100 000 bytes, then after 50 000 more; the third time it comes whole)
        let (url, server) = serve_cut(body.clone(), vec![Some(100_000), Some(50_000), None]).await;
        let dir = Scratch::new();
        let waits = [Duration::from_millis(10); 4];
        fetch_resuming(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |_| {}, &waits).await.unwrap();
        assert_eq!(std::fs::read(dir.path().join("model.bin")).unwrap(), body);
        assert!(!dir.path().join("model.bin.part").exists());
        assert_eq!(server.await.unwrap(), ["all", "from 100000", "from 150000"]);
    }

    #[tokio::test]
    async fn says_how_much_came_and_how_often_it_was_taken_up_where_it_never_comes_whole() {
        let body: Vec<u8> = (0..30_000u32).map(|i| (i % 227) as u8).collect();
        let (url, server) = serve_cut(body.clone(), vec![Some(5_000), Some(5_000), Some(5_000)]).await;
        let dir = Scratch::new();
        let waits = [Duration::from_millis(10); 2];
        let err = fetch_resuming(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |_| {}, &waits).await.unwrap_err();
        let said = err.to_string();
        assert!(said.starts_with("model.bin stopped after 15000 bytes of 30000 bytes ("), "{said}");
        assert!(said.ends_with("; taken up again 2 times). What came is kept: Add goes on from there."), "{said}");
        assert_eq!(std::fs::read(dir.path().join("model.bin.part")).unwrap(), body[..15_000]);
        assert_eq!(server.await.unwrap(), ["all", "from 5000", "from 10000"]);
    }

    #[tokio::test]
    async fn takes_up_no_download_that_failed_otherwise() {
        let body = b"not the weights".to_vec();
        let (url, server) = serve_cut(body.clone(), vec![None]).await;
        let dir = Scratch::new();
        let mut d = download(&url, &body);
        d.sha256 = "0".repeat(64);
        let err = fetch_resuming(&client_builder().build().unwrap(), &d, dir.path(), |_| {}, &[Duration::from_millis(10); 4]).await.unwrap_err();
        assert!(matches!(err, Fetched::Failed(_)), "{err}");
        assert_eq!(server.await.unwrap(), ["all"]);
    }
}
