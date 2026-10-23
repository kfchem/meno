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

/// The files not kept yet: those missing, or not the size they should be -
/// or, an archive, not unpacked whole.
pub fn missing<'a>(dir: &Path, downloads: &'a [Download]) -> Vec<&'a Download> {
    downloads
        .iter()
        .filter(|d| match d.unpack {
            Some(_) => copy_of(dir, d).is_none(),
            None => std::fs::metadata(dir.join(&d.file)).map(|m| m.len() != d.bytes).unwrap_or(true),
        })
        .collect()
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
    let state = |missing: &[&Download]| FilesState {
        folder: dir.to_string_lossy().into_owned(),
        missing: missing.iter().map(|d| d.file.clone()).collect(),
        bytes: missing.iter().map(|d| d.bytes).sum(),
    };
    let wanted = missing(&dir, &downloads);
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
            fetch_one(&client, d, &dir, tell).await?;
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
        && hashed_so_far(archive).is_ok_and(|(h, _)| h.finalize().iter().map(|b| format!("{b:02x}")).collect::<String>() == d.sha256)
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

/// One file fetched into `dir`: into `<file>.part` - taken up where an
/// earlier try left it, where the server sends the rest - then, all of it
/// there and its hash the manifest's, put in place; a file whose hash is
/// not is thrown away.
pub async fn fetch_one(client: &reqwest::Client, d: &Download, dir: &Path, mut tell: impl FnMut(u64)) -> Result<(), String> {
    let part = dir.join(format!("{}.part", d.file));
    let (mut hasher, mut had) = match hashed_so_far(&part) {
        Ok((h, n)) if n > 0 && n < d.bytes => (h, n),
        _ => (Sha256::new(), 0),
    };
    let mut ask = client.get(&d.url);
    if had > 0 {
        ask = ask.header(reqwest::header::RANGE, format!("bytes={had}-"));
    }
    let mut response = ask.send().await.map_err(|e| format!("fetching {}: {e}", d.url))?;
    response = response.error_for_status().map_err(|e| format!("fetching {}: {e}", d.url))?;
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
        .map_err(|e| format!("{}: {e}", part.display()))?;
    tell(had);
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("fetching {}: {e}", d.url))? {
        if had + chunk.len() as u64 > d.bytes {
            drop(out);
            let _ = std::fs::remove_file(&part);
            return Err(format!("{} is larger than it should be", d.url));
        }
        hasher.update(&chunk);
        out.write_all(&chunk).map_err(|e| format!("{}: {e}", part.display()))?;
        had += chunk.len() as u64;
        tell(had);
    }
    out.flush().map_err(|e| format!("{}: {e}", part.display()))?;
    drop(out);
    if had != d.bytes {
        // (kept, to be taken up again)
        return Err(format!("{} stopped after {had} of its {} bytes", d.url, d.bytes));
    }
    let got: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != d.sha256 {
        let _ = std::fs::remove_file(&part);
        return Err(format!("{} is not the file Meno expects: its SHA-256 is {got}", d.url));
    }
    std::fs::rename(&part, dir.join(&d.file)).map_err(|e| format!("{}: {e}", part.display()))
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
    fn a_file_not_its_size_is_still_missing() {
        let dir = Scratch::new();
        let d = |file: &str, bytes| Download { file: file.into(), url: "https://h/m".into(), sha256: "a".repeat(64), bytes, ..Default::default() };
        std::fs::write(dir.path().join("whole"), b"12345").unwrap();
        std::fs::write(dir.path().join("short"), b"12").unwrap();
        let all = [d("whole", 5), d("short", 5), d("none", 5)];
        let left: Vec<&str> = missing(dir.path(), &all).iter().map(|d| d.file.as_str()).collect();
        assert_eq!(left, ["short", "none"]);
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
        assert!(err.contains("not the file Meno expects"), "{err}");
        assert!(!dir.path().join("model.bin").exists() && !dir.path().join("model.bin.part").exists());
    }

    #[tokio::test]
    async fn keeps_what_came_of_a_download_cut_short() {
        let body = b"0123456789".to_vec();
        let (url, _server) = serve(body[..4].to_vec(), true, 1).await;
        let dir = Scratch::new();
        let err = fetch_one(&client_builder().build().unwrap(), &download(&url, &body), dir.path(), |_| {}).await.unwrap_err();
        assert!(err.contains("stopped after 4"), "{err}");
        assert_eq!(std::fs::read(dir.path().join("model.bin.part")).unwrap(), b"0123");
    }
}
