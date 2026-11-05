//! The plugins online (docs/PLUGINS.md, *Plugins online*): the catalogue of
//! the plugins Meno may get, fetched with its signature and checked against
//! Meno's own keys before anything of it is read; kept, so that it is there
//! offline; and a plugin's files got from it - fetched, checked against the
//! catalogue's fingerprint and size, unpacked apart from the plugins in use
//! (`.staging`), and only then taken into use as `<id>/<version>`, `current`
//! naming it. Nothing of a plugin runs here. The page reads the catalogue
//! again, strictly (lib/plugins/catalogue), and checks the staged manifest is
//! the plugin the catalogue offered before it asks for it to be taken in.
//!
//! What is in the plugins' folder (`<local data>/plugins`), and whose:
//! `<id>/<version>/` and `<id>/current` are read by core as the plugins in
//! use, and written here; `.staging/`, `catalogue.json`, its `.minisig` and
//! `catalogue-state.json` are this module's alone. A version no longer
//! `current` is taken away at launch, where no job of it waits or runs - never
//! here.

use crate::{net, tools};
use minisign_verify::{PublicKey, Signature};
use serde::Serialize;
use serde_json::Value;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager, State};

/// What the catalogue and the plugins' files are fetched under, asked once (lib/plugins/catalogue `CATALOGUE_PURPOSE`).
pub const PURPOSE: &str = "plugin-catalogue";

/// Where they are: the releases of the plugins' repository, and where those send their files.
pub const HOSTS: [&str; 3] = ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];

/// The catalogue, as the newest release of the plugins' repository has it; its signature beside it, `.minisig`.
const LIST_URL: &str = "https://github.com/kfchem/meno-plugins/releases/latest/download/catalogue.json";

/// The keys the catalogue is signed with (minisign, base64): the one in use, and the next, so that one is
/// changed for the other by a Meno that carries both first. Only the public key is here; the secret one that
/// signs the catalogue is kept by the maintainer, never in the repository.
const KEYS: &[&str] = &[
    // (key id 2F17AB3E9FB8307D)
    "RWR9MLifPqsXL86AyrBHekSl4CsDiTA8jJneU+l/xIP6jWeVrzIV0GBe",
];

/// The most the catalogue, its signature, a plugin's archive, its files unpacked, and their number may be.
const LIST_MOST: u64 = 4 * 1024 * 1024;
const SIGNATURE_MOST: u64 = 4096;
const ARCHIVE_MOST: u64 = 512 * 1024 * 1024;
const UNPACKED_MOST: u64 = 1024 * 1024 * 1024;
const FILES_MOST: usize = 10_000;

/// The form of catalogue this Meno reads.
const SCHEMA: u64 = 1;

/// The plugins' folder.
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    // (until core reads the plugins in use from it, its own copy of where it is: the same folder)
    app.path().app_local_data_dir().map(|d| d.join("plugins")).map_err(|e| format!("local app data dir: {e}"))
}

/// A version as the catalogue gives one: three whole numbers.
fn version_ok(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.len() <= 6 && p.bytes().all(|b| b.is_ascii_digit()))
}

/// A signature as it is kept: minisign's text, or - as some tools write it - that text in base64.
fn signature_of(sig: &[u8]) -> Result<Signature, String> {
    let text = std::str::from_utf8(sig).map_err(|_| "its signature is not text".to_string())?;
    let text = if text.trim_start().starts_with("untrusted comment:") {
        text.to_string()
    } else {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD.decode(text.trim()).map_err(|_| "its signature is not one Meno reads".to_string())?;
        String::from_utf8(bytes).map_err(|_| "its signature is not one Meno reads".to_string())?
    };
    Signature::decode(&text).map_err(|_| "its signature is not one Meno reads".to_string())
}

/// Whether a list is signed with one of `keys`. Only a signature of minisign's own form, made over the
/// list's hash, is taken: never the older form made over the list itself (`allow_legacy` false).
fn signed(list: &[u8], sig: &[u8], keys: &[&str]) -> Result<(), String> {
    let signature = signature_of(sig)?;
    let signed = keys
        .iter()
        .filter_map(|k| PublicKey::from_base64(k).ok())
        .any(|k| k.verify(list, &signature, false).is_ok());
    if signed {
        Ok(())
    } else if keys.is_empty() {
        Err("Meno has no key to check the list with yet".to_string())
    } else {
        Err("the list is not signed with Meno's key".to_string())
    }
}

/// The catalogue, checked: signed by one of `keys` - before anything of it is read - then of the form Meno
/// reads, and not older than one taken before (`floor`).
fn checked(list: &[u8], sig: &[u8], keys: &[&str], floor: Option<&Taken>) -> Result<(Value, String), String> {
    signed(list, sig, keys)?;
    form_of(list, floor)
}

/// Whether `s` is a time as a catalogue gives the one it was issued at: UTC, to the second, and nothing else -
/// `2026-11-05T13:04:09Z` - and a real one. Of this one form, its order as text is its order in time.
fn issued_ok(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 20 || !s.is_ascii() || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' || b[19] != b'Z' {
        return false;
    }
    let n = |r: std::ops::Range<usize>| {
        let t = &s[r];
        t.bytes().all(|c| c.is_ascii_digit()).then(|| t.parse::<u32>().ok()).flatten()
    };
    let (Some(y), Some(mo), Some(d), Some(h), Some(mi), Some(sec)) = (n(0..4), n(5..7), n(8..10), n(11..13), n(14..16), n(17..19)) else {
        return false;
    };
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = match mo {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&d) && h < 24 && mi < 60 && sec < 60
}

/// What a list fetched is held to: when the one taken before was issued, and its fingerprint.
#[derive(Debug, Clone, PartialEq)]
struct Taken {
    issued: String,
    sha256: String,
}

/// A signed list read: of the form Meno reads - no serial, and when it was issued, as Meno takes that - and,
/// where Meno has taken one before (`floor`), issued no earlier; issued at the same second only where it is
/// that list, byte for byte.
fn form_of(list: &[u8], floor: Option<&Taken>) -> Result<(Value, String), String> {
    let value: Value = serde_json::from_slice(list).map_err(|_| "the list is not one Meno reads".to_string())?;
    if value.get("schema").and_then(Value::as_u64) != Some(SCHEMA) {
        return Err("the list is of a form this Meno does not read: a newer Meno may".to_string());
    }
    if value.get("serial").is_some() {
        return Err("the list carries a serial, which this Meno does not read".to_string());
    }
    let issued = value.get("issued").and_then(Value::as_str).filter(|i| issued_ok(i)).ok_or("the list does not say when it was issued as Meno takes it")?.to_string();
    if let Some(taken) = floor {
        if issued < taken.issued {
            return Err(format!("the list is older than one Meno has taken (issued {issued}, before {})", taken.issued));
        }
        if issued == taken.issued && tools::check(list, &taken.sha256).is_err() {
            return Err(format!("the list was issued at the same second as one Meno has taken ({issued}) but is not that one"));
        }
    }
    Ok((value, issued))
}

/// The catalogue as kept, and what Meno knows of it: when it was issued, its fingerprint, and when it was fetched.
#[derive(serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeptState {
    issued: String,
    sha256: String,
    fetched_at: String,
}

/// The SHA-256 of `bytes`, in hex.
fn fingerprint(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// Writes a file whole, or not at all: beside it first, then put in its place.
fn put(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4().simple()));
    std::fs::write(&tmp, bytes).map_err(|e| format!("writing {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("putting {} in place: {e}", path.display())
    })
}

/// The catalogue kept from before, checked again as it is read - never trusted for having been kept: it must
/// be the very list its state was written for.
fn kept(root: &Path, keys: &[&str]) -> Option<(Value, KeptState)> {
    let list = std::fs::read(root.join("catalogue.json")).ok()?;
    let sig = std::fs::read(root.join("catalogue.json.minisig")).ok()?;
    let state: KeptState = serde_json::from_slice(&std::fs::read(root.join("catalogue-state.json")).ok()?).ok()?;
    let (value, issued) = checked(&list, &sig, keys, None).ok()?;
    (issued == state.issued && fingerprint(&list) == state.sha256).then_some((value, state))
}

/// Keeps a catalogue checked: the list and its signature, then what Meno knows of it - when it was issued
/// and its fingerprint, what a later one is held to.
fn keep(root: &Path, list: &[u8], sig: &[u8], issued: &str, fetched_at: &str) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| format!("making {}: {e}", root.display()))?;
    put(&root.join("catalogue.json"), list)?;
    put(&root.join("catalogue.json.minisig"), sig)?;
    let state = KeptState { issued: issued.to_string(), sha256: fingerprint(list), fetched_at: fetched_at.to_string() };
    put(&root.join("catalogue-state.json"), &serde_json::to_vec(&state).map_err(|e| e.to_string())?)
}

/// What a fetched catalogue is held to: the one kept's, signed or not - a catalogue kept whose signature no
/// longer checks does not lower it.
fn floor(root: &Path) -> Option<Taken> {
    let state: KeptState = serde_json::from_slice(&std::fs::read(root.join("catalogue-state.json")).ok()?).ok()?;
    Some(Taken { issued: state.issued, sha256: state.sha256 })
}

/// What the page is given: the catalogue checked, when it was fetched, and - where it is the one kept from
/// before, though a newer one was asked for - why.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Got {
    catalogue: Value,
    fetched_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    kept: Option<String>,
}

/// Now, as a date and time a page reads (ISO 8601, UTC).
fn now_iso() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    crate::logfile::utc(secs).replacen(' ', "T", 1)
}

/// The catalogue and its signature, fetched under its purpose, to its hosts alone.
async fn fetch_list(net: &net::Net) -> Fetched {
    let task = net.begin(PURPOSE, "The plugins online", Some(hosts()))?;
    let proxy = task.proxy_url().ok_or("the network is not ready")?;
    let got = async {
        let list = tools::download(LIST_URL, &proxy, LIST_MOST).await?;
        let sig = tools::download(&format!("{LIST_URL}.minisig"), &proxy, SIGNATURE_MOST).await?;
        Ok::<_, String>((list, sig))
    }
    .await;
    match &got {
        Ok(_) => task.finish(true),
        Err(e) => task.fail(e),
    }
    got
}

/// The catalogue (lib/plugins/online `listOnline`): fetched (`fetch`) - and kept, where it checks - else the
/// one kept from before; and, where one was asked for and could not be had, the one kept, saying why. None,
/// where none is kept and none was fetched.
#[tauri::command]
pub async fn catalogue_get(app: AppHandle, net: State<'_, net::Net>, fetch: bool) -> Result<Option<Got>, String> {
    let root = root(&app)?;
    let fetched = if fetch { Some(fetch_list(&net).await) } else { None };
    got(&root, KEYS, fetched, &now_iso())
}

/// A list and its signature as fetched, or why not.
type Fetched = Result<(Vec<u8>, Vec<u8>), String>;

/// What `catalogue_get` gives, from what was fetched, if anything: a list fetched taken - checked, held to
/// when the one kept was issued, then kept - else the one kept, saying why a newer one was not had.
fn got(root: &Path, keys: &[&str], fetched: Option<Fetched>, now: &str) -> Result<Option<Got>, String> {
    let mut why = None;
    if let Some(fetched) = fetched {
        match fetched.and_then(|(list, sig)| take_fetched(root, &list, &sig, keys, now)) {
            Ok(got) => return Ok(Some(got)),
            Err(e) => why = Some(e),
        }
    }
    match (kept(root, keys), why) {
        (Some((catalogue, state)), why) => Ok(Some(Got { catalogue, fetched_at: state.fetched_at, kept: why })),
        (None, Some(why)) => Err(why),
        (None, None) => Ok(None),
    }
}

/// A list fetched, taken: signed, of the form Meno reads, and not older than the one kept - else refused,
/// and nothing written - then kept.
fn take_fetched(root: &Path, list: &[u8], sig: &[u8], keys: &[&str], now: &str) -> Result<Got, String> {
    let (catalogue, issued) = checked(list, sig, keys, floor(root).as_ref())?;
    keep(root, list, sig, &issued, now)?;
    Ok(Got { catalogue, fetched_at: now.to_string(), kept: None })
}

/// A plugin's entry in a catalogue, by its id and version.
fn entry_of<'a>(catalogue: &'a Value, id: &str, version: &str) -> Option<&'a Value> {
    catalogue
        .get("plugins")?
        .as_array()?
        .iter()
        .find(|e| e.get("id").and_then(Value::as_str) == Some(id) && e.get("version").and_then(Value::as_str) == Some(version))
}

/// What an entry says of its files: where they are - on https, at the catalogue's hosts, nowhere else - their
/// fingerprint and size, and the fingerprint of the manifest among them.
#[derive(Debug)]
struct Source {
    id: String,
    version: String,
    url: String,
    sha256: String,
    bytes: u64,
    manifest_sha256: String,
}

fn hex64(v: Option<&Value>) -> Option<String> {
    v.and_then(Value::as_str).filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))).map(str::to_string)
}

fn source_of(entry: &Value) -> Result<Source, String> {
    let s = entry.get("source").ok_or("its entry says nothing of its files")?;
    let url = s.get("url").and_then(Value::as_str).ok_or("its entry gives no place for its files")?;
    let parsed = reqwest::Url::parse(url).map_err(|_| "its files' place is not one Meno takes")?;
    let host_ok = parsed.host_str().is_some_and(|h| HOSTS.contains(&h));
    if parsed.scheme() != "https" || !host_ok || parsed.port().is_some() || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("its files' place is not one Meno takes".to_string());
    }
    let sha256 = hex64(s.get("sha256")).ok_or("its files' fingerprint is not one Meno takes")?;
    // (no more than its entry says, and never more than Meno's own most)
    let bytes = s.get("bytes").and_then(Value::as_u64).filter(|b| *b > 0 && *b <= ARCHIVE_MOST).ok_or("its files' size is not one Meno takes")?;
    let manifest_sha256 = hex64(entry.get("manifestSha256")).ok_or("its manifest's fingerprint is not one Meno takes")?;
    let id = entry.get("id").and_then(Value::as_str).filter(|i| crate::plugin_id_ok(i)).ok_or("its entry gives no id Meno takes")?;
    let version = entry.get("version").and_then(Value::as_str).filter(|v| version_ok(v)).ok_or("its entry gives no version Meno takes")?;
    Ok(Source { id: id.to_string(), version: version.to_string(), url: url.to_string(), sha256, bytes, manifest_sha256 })
}

/// A plugin's files, unpacked into `dir`: regular files and folders alone, each where the archive puts it
/// within `dir`. A link, a path that is absolute or goes up, too many files or too much refuses the whole of
/// it, and what was unpacked is taken away again.
fn unpack_into(archive: &[u8], dir: &Path) -> Result<(), String> {
    let done = unpack_all(archive, dir);
    if done.is_err() {
        let _ = std::fs::remove_dir_all(dir);
    }
    done
}

fn unpack_all(archive: &[u8], dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("making {}: {e}", dir.display()))?;
    let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(Cursor::new(archive)));
    let (mut files, mut total) = (0usize, 0u64);
    for entry in tar.entries().map_err(|e| format!("its archive: {e}"))? {
        let mut entry = entry.map_err(|e| format!("its archive: {e}"))?;
        let path = entry.path().map_err(|e| format!("its archive: {e}"))?.into_owned();
        // (each part of its path a name: none that goes up, starts at the top, or names a drive)
        let mut rel = PathBuf::new();
        for part in path.components() {
            match part {
                // (a name, and no more: a colon - a drive, or another stream of a file on Windows - or a backslash
                //  refused; on Windows a backslash parts a path, so there it never comes here, and `..\x` goes up)
                Component::Normal(p) if !p.to_string_lossy().contains([':', '\\']) => rel.push(p),
                Component::CurDir => {}
                _ => return Err(format!("its archive holds a path Meno does not take: {}", path.display())),
            }
        }
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            if !rel.as_os_str().is_empty() {
                std::fs::create_dir_all(dir.join(&rel)).map_err(|e| format!("unpacking {}: {e}", rel.display()))?;
            }
            continue;
        }
        if !kind.is_file() || rel.as_os_str().is_empty() {
            return Err(format!("its archive holds what is not a file or a folder: {}", path.display()));
        }
        files += 1;
        total += entry.header().size().map_err(|e| format!("its archive: {e}"))?;
        if files > FILES_MOST || total > UNPACKED_MOST {
            return Err("its archive holds more than Meno takes a plugin to".to_string());
        }
        let out = dir.join(&rel);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("unpacking {}: {e}", rel.display()))?;
        }
        let mut body = Vec::new();
        (&mut entry).take(UNPACKED_MOST + 1).read_to_end(&mut body).map_err(|e| format!("its archive: {e}"))?;
        // (a file once: one of the same name again refuses it)
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&out).map_err(|e| format!("unpacking {}: {e}", rel.display()))?;
        std::io::Write::write_all(&mut file, &body).map_err(|e| format!("unpacking {}: {e}", rel.display()))?;
    }
    Ok(())
}

/// What `plugin_stage` gives: the stage's name, and its manifest's text, for the page to read as any
/// plugin's.
#[derive(Debug, Serialize)]
pub struct Staged {
    stage: String,
    manifest: String,
}

/// A plugin's files, staged from their archive as fetched: of the size and fingerprint the catalogue gave,
/// unpacked into `.staging/<stage>`, and its manifest the one the catalogue gave the fingerprint of; else
/// none of it kept.
fn stage_from(archive: &[u8], source: &Source, root: &Path) -> Result<Staged, String> {
    if archive.len() as u64 != source.bytes {
        return Err(format!("its files are not of the size the list gave ({} bytes, not {})", archive.len(), source.bytes));
    }
    tools::check(archive, &source.sha256).map_err(|_| "its files are not the ones the list gave the fingerprint of".to_string())?;
    let stage = uuid::Uuid::new_v4().simple().to_string();
    let dir = root.join(".staging").join(&stage);
    // (the entry it is staged for, beside it before anything of it is unpacked - so that a stage being made
    //  is never taken for one left by a Meno stopped mid-way - and what its manifest must say when it is
    //  taken into use)
    std::fs::create_dir_all(root.join(".staging")).map_err(|e| format!("making the stage: {e}"))?;
    put(&for_of(&dir), format!("{}\n{}", source.id, source.version).as_bytes())?;
    if let Err(e) = unpack_into(archive, &dir) {
        throw_away(&dir);
        return Err(e);
    }
    let manifest = std::fs::read(dir.join("manifest.json")).ok();
    let fits = manifest.as_deref().is_some_and(|m| tools::check(m, &source.manifest_sha256).is_ok());
    let text = manifest.and_then(|m| String::from_utf8(m).ok());
    match (fits, text) {
        (true, Some(manifest)) => Ok(Staged { stage, manifest }),
        _ => {
            throw_away(&dir);
            Err("its manifest is not the one the list gave the fingerprint of".to_string())
        }
    }
}

/// Where a stage's entry - the id and version it was staged for - is kept: beside its folder.
fn for_of(dir: &Path) -> PathBuf {
    dir.with_extension("for")
}

/// A stage thrown away, and its entry with it.
fn throw_away(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
    let _ = std::fs::remove_file(for_of(dir));
}

/// How long a stage may lie before it is taken for one left by a Meno stopped mid-way.
const STAGE_STALE: std::time::Duration = std::time::Duration::from_secs(24 * 3600);

/// Stages left by a Meno stopped mid-way - no plugin, never read as one - taken away as a plugin is next
/// got: each whose entry beside it was written a day or more before `now`, or that has none.
fn clear_stale(root: &Path, now: std::time::SystemTime) {
    let Ok(stages) = std::fs::read_dir(root.join(".staging")) else { return };
    for stage in stages.flatten() {
        let path = stage.path();
        if path.extension().is_some_and(|e| e == "for") || stage_dir(root, &stage.file_name().to_string_lossy()).is_err() {
            continue;
        }
        let written = std::fs::metadata(for_of(&path)).and_then(|m| m.modified()).ok();
        if written.is_none_or(|t| now.duration_since(t).is_ok_and(|age| age >= STAGE_STALE)) {
            throw_away(&path);
        }
    }
}

/// The hosts a task of the plugins online is kept to.
fn hosts() -> Vec<String> {
    HOSTS.iter().map(|h| h.to_string()).collect()
}

/// A plugin's entry and what it says of its files, found in the catalogue kept - checked again as it is
/// read - never as the page says it.
fn entry_for(root: &Path, keys: &[&str], id: &str, version: &str) -> Result<Source, String> {
    if !crate::plugin_id_ok(id) || !version_ok(version) {
        return Err("not a plugin's id and version".to_string());
    }
    let (catalogue, _) = kept(root, keys).ok_or("there is no list of the plugins online here")?;
    let entry = entry_of(&catalogue, id, version).ok_or_else(|| format!("the list holds no {id} {version}"))?;
    source_of(entry)
}

/// The most of a plugin's archive that is fetched: its entry's size - itself never more than Meno's own most.
fn archive_most(source: &Source) -> u64 {
    source.bytes
}

/// A plugin's files got (lib/plugins/online `getPlugin`): its entry found in the catalogue kept - checked
/// again, never as the page says it - its archive fetched under the catalogue's purpose, and staged.
#[tauri::command]
pub async fn plugin_stage(app: AppHandle, net: State<'_, net::Net>, id: String, version: String) -> Result<Staged, String> {
    let root = root(&app)?;
    let source = entry_for(&root, KEYS, &id, &version)?;
    clear_stale(&root, std::time::SystemTime::now());
    let task = net.begin(PURPOSE, &format!("Getting the plugin {id} {version}"), Some(hosts()))?;
    let proxy = task.proxy_url().ok_or("the network is not ready")?;
    let archive = match tools::download(&source.url, &proxy, archive_most(&source)).await {
        Ok(a) => {
            task.finish(true);
            a
        }
        Err(e) => {
            task.fail(&e);
            return Err(e);
        }
    };
    stage_from(&archive, &source, &root)
}

/// A stage's name, as `plugin_stage` gives one, and its folder.
fn stage_dir(root: &Path, stage: &str) -> Result<PathBuf, String> {
    if stage.len() != 32 || !stage.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
        return Err("not a stage".to_string());
    }
    Ok(root.join(".staging").join(stage))
}

/// Puts `<id>/current` in place: the version in use, written whole.
fn set_current(root: &Path, id: &str, version: &str) -> Result<(), String> {
    // (until core reads the plugins in use, its own copy of the rule it reads them by)
    put(&root.join(id).join("current"), version.as_bytes())
}

/// A stage taken into use: its folder made `<id>/<version>` - by its manifest's id and version, which must
/// be those of the entry it was staged for - and `current` naming it. A version once in place is never
/// changed: where it is there already, the stage is thrown away and `current` names that one.
fn commit_stage(root: &Path, stage: &str) -> Result<(), String> {
    let dir = stage_dir(root, stage)?;
    let manifest: Value = serde_json::from_slice(&std::fs::read(dir.join("manifest.json")).map_err(|_| "no such stage")?).map_err(|_| "its manifest is not one Meno reads")?;
    let id = manifest.get("id").and_then(Value::as_str).filter(|i| crate::plugin_id_ok(i)).ok_or("its manifest gives no id Meno takes")?;
    let version = manifest.get("version").and_then(Value::as_str).filter(|v| version_ok(v)).ok_or("its manifest gives no version Meno takes")?;
    let staged_for = std::fs::read_to_string(for_of(&dir)).map_err(|_| "no such stage")?;
    if staged_for != format!("{id}\n{version}") {
        throw_away(&dir);
        return Err("its manifest is not the plugin it was got as".to_string());
    }
    let target = root.join(id).join(version);
    if target.exists() {
        throw_away(&dir);
    } else {
        let placed = std::fs::create_dir_all(root.join(id)).and_then(|_| std::fs::rename(&dir, &target));
        // (not put in place: the stage thrown away, never left with no entry beside it)
        if let Err(e) = placed {
            throw_away(&dir);
            return Err(format!("putting {id} {version} in place: {e}"));
        }
        let _ = std::fs::remove_file(for_of(&dir));
    }
    set_current(root, id, version)
}

#[tauri::command]
pub fn plugin_commit(app: AppHandle, stage: String) -> Result<(), String> {
    commit_stage(&root(&app)?, &stage)
}

/// A stage thrown away: none of it used.
#[tauri::command]
pub fn plugin_discard(app: AppHandle, stage: String) -> Result<(), String> {
    throw_away(&stage_dir(&root(&app)?, &stage)?);
    Ok(())
}

/// A plugin's files taken away: `current` first - so that a folder left half taken is no plugin in use - then
/// its folder (`remove_dir`). Asked only once its jobs are stopped: the page asks the person first, as it
/// does before a plugin is removed (lib/calc/workers `removePlugin`). While Meno still carries plugins, one
/// it carries is put back as it next starts.
fn remove_files(root: &Path, id: &str, remove_dir: impl Fn(&Path) -> std::io::Result<()>) -> Result<(), String> {
    if !crate::plugin_id_ok(id) {
        return Err("not a plugin's id".to_string());
    }
    let dir = root.join(id);
    let current = dir.join("current");
    if current.exists() {
        std::fs::remove_file(&current).map_err(|e| format!("taking {id} out of use: {e}"))?;
    }
    if dir.exists() {
        remove_dir(&dir).map_err(|e| format!("removing {id}'s files: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_files_remove(app: AppHandle, id: String) -> Result<(), String> {
    remove_files(&root(&app)?, &id, |d| std::fs::remove_dir_all(d))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Three key pairs made for these tests alone, their secret keys not kept: the list signed with the first
    // (issued 2026-11-03, and one of 11-02, and another issued at the same second as the first), and with the
    // second (issued 11-04); the third, no key of Meno's.
    const KEY_A: &str = "RWSs/jS3j5RbI4onMUi8LIJIdFYySkSf8LvHJ/GjO3I7aCC3nHeGRbyg";
    const KEY_B: &str = "RWTQ7SrJNzUVkBa6/essR0FBoRqIxc/TXBT0aOV96ubAdl4JQ68b2IgT";
    const EARLIER: &[u8] = include_bytes!("../fixtures/catalogue/earlier.json");
    const EARLIER_A: &[u8] = include_bytes!("../fixtures/catalogue/earlier.a.minisig");
    const LIST: &[u8] = include_bytes!("../fixtures/catalogue/list.json");
    const LIST_A: &[u8] = include_bytes!("../fixtures/catalogue/list.a.minisig");
    const SAME_TIME: &[u8] = include_bytes!("../fixtures/catalogue/same-time.json");
    const SAME_TIME_A: &[u8] = include_bytes!("../fixtures/catalogue/same-time.a.minisig");
    const LATER: &[u8] = include_bytes!("../fixtures/catalogue/later.json");
    const LATER_B: &[u8] = include_bytes!("../fixtures/catalogue/later.b.minisig");
    const LATER_C: &[u8] = include_bytes!("../fixtures/catalogue/later.c.minisig");

    fn scratch(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("meno-catalogue-{name}-{}", uuid::Uuid::new_v4().simple()))
    }

    #[test]
    fn a_list_is_read_only_signed_with_meno_s_key() {
        let (value, issued) = checked(LIST, LIST_A, &[KEY_A], None).unwrap();
        assert_eq!(issued, "2026-11-03T00:00:00Z");
        assert_eq!(value["plugins"][0]["id"], "sketch");
        // (signed with no key of Meno's, or with none given at all)
        assert_eq!(checked(LATER, LATER_C, &[KEY_A, KEY_B], None).unwrap_err(), "the list is not signed with Meno's key");
        assert_eq!(checked(LIST, LIST_A, &[], None).unwrap_err(), "Meno has no key to check the list with yet");
        // (a list changed after it was signed - one byte - or another list's signature)
        let mut changed = LIST.to_vec();
        let at = changed.iter().position(|b| *b == b'3').unwrap();
        changed[at] = b'9';
        assert!(checked(&changed, LIST_A, &[KEY_A], None).is_err());
        assert!(checked(EARLIER, LIST_A, &[KEY_A], None).is_err());
        assert!(checked(LIST, b"not a signature", &[KEY_A], None).is_err());
    }

    #[test]
    fn meno_carries_its_key_and_takes_no_list_signed_with_another() {
        use base64::Engine;
        // (each key one minisign reads, an Ed25519 key - its id as minisign prints it, and the one in use first)
        for k in KEYS {
            assert!(PublicKey::from_base64(k).is_ok(), "{k}");
        }
        let ids: Vec<String> = KEYS
            .iter()
            .map(|k| {
                let raw = base64::engine::general_purpose::STANDARD.decode(k).unwrap();
                assert_eq!((raw.len(), &raw[..2]), (42, &b"Ed"[..]));
                format!("{:016X}", u64::from_le_bytes(raw[2..10].try_into().unwrap()))
            })
            .collect();
        assert_eq!(ids[0], "2F17AB3E9FB8307D");
        // (a list signed with a key made for the tests alone - its secret one not kept - is refused, whichever)
        assert_eq!(checked(LIST, LIST_A, KEYS, None).unwrap_err(), "the list is not signed with Meno's key");
        assert_eq!(checked(LATER, LATER_C, KEYS, None).unwrap_err(), "the list is not signed with Meno's key");
    }

    #[test]
    fn the_next_key_signs_once_meno_carries_it() {
        assert!(checked(LATER, LATER_B, &[KEY_A], None).is_err());
        assert_eq!(checked(LATER, LATER_B, &[KEY_A, KEY_B], None).unwrap().1, "2026-11-04T00:00:00Z");
    }

    #[test]
    fn a_signature_is_read_as_minisign_writes_it_or_in_base64() {
        use base64::Engine;
        // (the signatures here are as `tauri signer` writes them: minisign's text in base64 - and that text itself, too)
        let text = base64::engine::general_purpose::STANDARD.decode(LIST_A.trim_ascii()).unwrap();
        assert_eq!(checked(LIST, &text, &[KEY_A], None).unwrap().1, "2026-11-03T00:00:00Z");
        assert_eq!(checked(LIST, LIST_A, &[KEY_A], None).unwrap().1, "2026-11-03T00:00:00Z");
    }

    #[test]
    fn a_list_issued_before_the_one_taken_is_refused_and_one_issued_the_same_second_unless_it_is_that_list() {
        let taken = Taken { issued: "2026-11-03T00:00:00Z".to_string(), sha256: fingerprint(LIST) };
        // (later: taken; the very list again: taken)
        assert!(checked(LATER, LATER_B, &[KEY_B], Some(&taken)).is_ok());
        assert!(checked(LIST, LIST_A, &[KEY_A], Some(&taken)).is_ok());
        // (earlier: refused; the same second, another list: refused)
        assert_eq!(checked(EARLIER, EARLIER_A, &[KEY_A], Some(&taken)).unwrap_err(), "the list is older than one Meno has taken (issued 2026-11-02T00:00:00Z, before 2026-11-03T00:00:00Z)");
        assert_eq!(checked(SAME_TIME, SAME_TIME_A, &[KEY_A], Some(&taken)).unwrap_err(), "the list was issued at the same second as one Meno has taken (2026-11-03T00:00:00Z) but is not that one");
    }

    #[test]
    fn a_list_kept_is_checked_again_as_it_is_read_and_holds_later_ones_to_when_it_was_issued() {
        let root = scratch("kept");
        keep(&root, LIST, LIST_A, "2026-11-03T00:00:00Z", "2026-11-05T00:00:00Z").unwrap();
        let (value, state) = kept(&root, &[KEY_A]).unwrap();
        assert_eq!((value["issued"].as_str(), state.fetched_at.as_str()), (Some("2026-11-03T00:00:00Z"), "2026-11-05T00:00:00Z"));
        assert_eq!(floor(&root), Some(Taken { issued: "2026-11-03T00:00:00Z".to_string(), sha256: fingerprint(LIST) }));
        // (one changed where it is kept - another list, signed, of the same second: not read)
        std::fs::write(root.join("catalogue.json"), SAME_TIME).unwrap();
        std::fs::write(root.join("catalogue.json.minisig"), SAME_TIME_A).unwrap();
        assert!(kept(&root, &[KEY_A]).is_none());
        // (and the floor stays: a list signed but older is refused still)
        assert!(checked(EARLIER, EARLIER_A, &[KEY_A], floor(&root).as_ref()).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    /// An archive of `files` (path, bytes) - and, where asked, a link.
    fn archive(files: &[(&str, &[u8])], link: Option<(&str, &str)>) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let gz = flate2::write::GzEncoder::new(&mut out, flate2::Compression::default());
            let mut tar = tar::Builder::new(gz);
            for (path, body) in files {
                let mut h = tar::Header::new_gnu();
                h.set_size(body.len() as u64);
                h.set_mode(0o644);
                h.set_entry_type(tar::EntryType::Regular);
                // (the path set as written, never checked by the builder: an archive Meno did not make)
                let name = path.as_bytes();
                h.as_old_mut().name[..name.len()].copy_from_slice(name);
                h.set_cksum();
                tar.append(&h, *body).unwrap();
            }
            if let Some((path, to)) = link {
                let mut h = tar::Header::new_gnu();
                h.set_entry_type(tar::EntryType::Symlink);
                h.set_size(0);
                tar.append_link(&mut h, path, to).unwrap();
            }
            tar.into_inner().unwrap().finish().unwrap();
        }
        out
    }

    fn sha(bytes: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
    }

    const MANIFEST: &[u8] = br#"{"id":"sketch","version":"0.3.0","name":"Sketch interface"}"#;

    fn source(archive: &[u8]) -> Source {
        Source { id: "sketch".into(), version: "0.3.0".into(), url: String::new(), sha256: sha(archive), bytes: archive.len() as u64, manifest_sha256: sha(MANIFEST) }
    }

    #[test]
    fn a_plugin_s_files_are_staged_whole_and_taken_into_use_by_their_manifest() {
        let root = scratch("stage");
        let a = archive(&[("manifest.json", MANIFEST), ("./worker.py", b"print()"), ("data/x.txt", b"x")], None);
        let staged = stage_from(&a, &source(&a), &root).unwrap();
        assert_eq!(staged.manifest.as_bytes(), MANIFEST);
        let dir = root.join(".staging").join(&staged.stage);
        assert_eq!(std::fs::read(dir.join("data/x.txt")).unwrap(), b"x");
        commit_stage(&root, &staged.stage).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("sketch/current")).unwrap(), "0.3.0");
        assert_eq!(std::fs::read(root.join("sketch/0.3.0/worker.py")).unwrap(), b"print()");
        assert!(!dir.exists());
        // (the same version again: the one in place kept as it is, the stage thrown away)
        let again = stage_from(&a, &source(&a), &root).unwrap();
        commit_stage(&root, &again.stage).unwrap();
        assert!(!root.join(".staging").join(&again.stage).exists());
        // (taken away: current first, then its folder)
        remove_files(&root, "sketch", |d| std::fs::remove_dir_all(d)).unwrap();
        assert!(!root.join("sketch").exists());
        assert!(remove_files(&root, "../up", |d| std::fs::remove_dir_all(d)).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn files_not_the_ones_the_list_gave_are_never_unpacked() {
        let root = scratch("refused");
        let a = archive(&[("manifest.json", MANIFEST)], None);
        let mut short = source(&a);
        short.bytes -= 1;
        assert!(stage_from(&a, &short, &root).unwrap_err().contains("size"));
        let mut other = source(&a);
        other.sha256 = sha(b"other");
        assert!(stage_from(&a, &other, &root).unwrap_err().contains("fingerprint"));
        // (its manifest another than the list said: the stage taken away again)
        let mut manifest = source(&a);
        manifest.manifest_sha256 = sha(b"{}");
        assert!(stage_from(&a, &manifest, &root).unwrap_err().contains("manifest"));
        let none = archive(&[("worker.py", b"print()")], None);
        assert!(stage_from(&none, &source(&none), &root).unwrap_err().contains("manifest"));
        assert_eq!(std::fs::read_dir(root.join(".staging")).map(|d| d.count()).unwrap_or(0), 0);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_archive_with_a_link_or_a_path_out_of_its_folder_is_refused_whole() {
        for (a, what) in [
            (archive(&[("manifest.json", MANIFEST)], Some(("worker.py", "/etc/passwd"))), "a link"),
            (archive(&[("manifest.json", MANIFEST), ("../up.txt", b"x")], None), "a path that goes up"),
            (archive(&[("manifest.json", MANIFEST), ("/abs.txt", b"x")], None), "an absolute path"),
            (archive(&[("manifest.json", MANIFEST), ("manifest.json", b"{}")], None), "a file twice"),
            (archive(&[("manifest.json", MANIFEST), ("a:b.txt", b"x")], None), "a colon: a drive, or another stream of a file"),
        ]
        .into_iter()
        .chain(odd_paths())
        {
            let dir = scratch("unpack");
            assert!(unpack_into(&a, &dir).is_err(), "{what}");
            assert!(!dir.exists(), "{what}: what was unpacked taken away");
            assert!(!dir.parent().unwrap().join("up.txt").exists());
        }
    }

    /// Names whose backslash is read as each system reads it: on Windows a separator - so one that goes up
    /// is refused by its part that goes up - elsewhere part of a name, refused for it.
    fn odd_paths() -> Vec<(Vec<u8>, &'static str)> {
        if cfg!(windows) {
            vec![(archive(&[("manifest.json", MANIFEST), ("..\\up.txt", b"x")], None), "a path that goes up, by a backslash")]
        } else {
            vec![(archive(&[("manifest.json", MANIFEST), ("a\\b.txt", b"x")], None), "a backslash in a name")]
        }
    }

    #[test]
    fn a_stage_left_a_day_or_more_or_with_no_entry_is_taken_away_as_a_plugin_is_next_got() {
        let root = scratch("stale");
        let now = std::time::SystemTime::now();
        let fresh = staged(&root, "{}", "sketch\n0.3.0");
        let old = staged(&root, "{}", "sketch\n0.3.0");
        let old_dir = root.join(".staging").join(&old);
        std::fs::OpenOptions::new().write(true).open(for_of(&old_dir)).unwrap().set_modified(now - STAGE_STALE).unwrap();
        let bare = staged(&root, "{}", "");
        std::fs::remove_file(for_of(&root.join(".staging").join(&bare))).unwrap();
        // (one being made: its entry written, nothing of it unpacked yet - kept)
        let making = staged(&root, "{}", "sketch\n0.3.0");
        std::fs::remove_file(root.join(".staging").join(&making).join("manifest.json")).unwrap();
        clear_stale(&root, now);
        assert!(root.join(".staging").join(&fresh).exists());
        assert!(root.join(".staging").join(&making).exists() && for_of(&root.join(".staging").join(&making)).exists());
        assert!(!old_dir.exists() && !for_of(&old_dir).exists());
        assert!(!root.join(".staging").join(&bare).exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_stage_or_id_is_only_one_meno_gives() {
        let root = scratch("names");
        for stage in ["../x", "", "ABCDEF0123456789ABCDEF0123456789", "0123456789abcdef0123456789abcde"] {
            assert!(stage_dir(&root, stage).is_err(), "{stage}");
        }
        assert!(stage_dir(&root, "0123456789abcdef0123456789abcdef").is_ok());
        for v in ["1.2", "1.2.3.4", "1.x.3", "", "1..3", "1.2.3-rc"] {
            assert!(!version_ok(v), "{v}");
        }
        assert!(version_ok("0.12.0"));
    }

    #[test]
    fn an_entry_s_files_are_taken_only_from_the_catalogue_s_hosts_on_https() {
        let entry = |url: &str| serde_json::json!({ "id": "sketch", "version": "0.3.0", "source": { "url": url, "sha256": "a".repeat(64), "bytes": 10 }, "manifestSha256": "b".repeat(64) });
        assert!(source_of(&entry("https://github.com/x/y/releases/download/z/a.tar.gz")).is_ok());
        assert!(source_of(&entry("https://release-assets.githubusercontent.com/a")).is_ok());
        // (letters made small, as the address reads them: the same host)
        assert!(source_of(&entry("https://GITHUB.com/a")).is_ok());
        for url in [
            "http://github.com/a",
            "https://example.org/a",
            "https://github.com:8443/a",
            "https://u:p@github.com/a",
            "file:///a",
            "nonsense",
            // (a host only like one of them, or one of them with a dot at its end)
            "https://evilgithub.com/a",
            "https://github.com.evil.net/a",
            "https://objects.githubusercontent.com.evil.net/a",
            "https://github.com./a",
            "https://api.github.com/a",
        ] {
            assert!(source_of(&entry(url)).is_err(), "{url}");
        }
        let big = serde_json::json!({ "id": "sketch", "version": "0.3.0", "source": { "url": "https://github.com/a", "sha256": "a".repeat(64), "bytes": ARCHIVE_MOST + 1 }, "manifestSha256": "b".repeat(64) });
        assert!(source_of(&big).is_err());
        let catalogue = serde_json::json!({ "plugins": [{ "id": "sketch", "version": "0.3.0" }] });
        assert!(entry_of(&catalogue, "sketch", "0.3.0").is_some());
        assert!(entry_of(&catalogue, "sketch", "0.4.0").is_none());
    }

    #[test]
    fn the_time_fetched_is_written_as_a_date() {
        let t = now_iso();
        assert_eq!(t.len(), 20);
        assert!(t.starts_with("20") && t.ends_with('Z'));
    }

    #[test]
    fn a_list_is_read_only_of_the_form_meno_reads_saying_when_it_was_issued_as_meno_takes_it_and_with_no_serial() {
        let list = |schema: u64, issued: &str| format!(r#"{{"schema":{schema},"issued":"{issued}","plugins":[]}}"#).into_bytes();
        assert_eq!(form_of(&list(1, "2026-11-05T13:04:09Z"), None).unwrap().1, "2026-11-05T13:04:09Z");
        // (leap years as the calendar has them: every fourth, not every hundredth, every four hundredth; each month's own last day)
        for real in ["2028-02-29T23:59:59Z", "2000-02-29T00:00:00Z", "2026-12-31T00:00:00Z", "2026-04-30T00:00:00Z", "0001-01-01T00:00:00Z"] {
            assert_eq!(form_of(&list(1, real), None).unwrap().1, real);
        }
        assert_eq!(form_of(&list(2, "2026-11-05T13:04:09Z"), None).unwrap_err(), "the list is of a form this Meno does not read: a newer Meno may");
        // (to the second, in UTC, as `Z`, and a real time: nothing else)
        for odd in ["2026-11-05T13:04:09.5Z", "2026-11-05T13:04Z", "2026-11-05T13:04:09+00:00", "2026-11-05T13:04:09", "2026-11-05 13:04:09Z", "2026-11-05", "2026-13-05T13:04:09Z", "2026-02-29T00:00:00Z", "2026-11-31T00:00:00Z", "2026-11-05T24:00:00Z", "2026-11-05T13:60:00Z", "2026-11-05T13:04:60Z", "+026-11-05T13:04:09Z", "2026-11-05t13:04:09z", "1900-02-29T00:00:00Z", "2026-11-00T00:00:00Z", "2026-00-05T00:00:00Z", "2026-04-31T00:00:00Z", "2026-11-05T13:04:éZ"] {
            assert_eq!(form_of(&list(1, odd), None).unwrap_err(), "the list does not say when it was issued as Meno takes it", "{odd}");
        }
        assert_eq!(form_of(br#"{"schema":1,"plugins":[]}"#, None).unwrap_err(), "the list does not say when it was issued as Meno takes it");
        assert_eq!(form_of(br#"{"schema":1,"issued":20261105,"plugins":[]}"#, None).unwrap_err(), "the list does not say when it was issued as Meno takes it");
        // (one that still carries a serial: refused, never read as the other)
        assert_eq!(form_of(br#"{"schema":1,"issued":"2026-11-05T13:04:09Z","serial":3,"plugins":[]}"#, None).unwrap_err(), "the list carries a serial, which this Meno does not read");
        assert!(form_of(b"not json", None).is_err());
    }

    #[test]
    fn a_list_kept_is_not_read_where_it_is_not_the_one_its_state_was_written_for() {
        let root = scratch("state");
        keep(&root, LIST, LIST_A, "2026-11-03T00:00:00Z", "2026-11-05T00:00:00Z").unwrap();
        assert!(kept(&root, &[KEY_A]).is_some());
        let state = |issued: &str, sha256: &str| format!(r#"{{"issued":"{issued}","sha256":"{sha256}","fetchedAt":"2026-11-05T00:00:00Z"}}"#);
        std::fs::write(root.join("catalogue-state.json"), state("2026-11-04T00:00:00Z", &fingerprint(LIST))).unwrap();
        assert!(kept(&root, &[KEY_A]).is_none());
        std::fs::write(root.join("catalogue-state.json"), state("2026-11-03T00:00:00Z", &"0".repeat(64))).unwrap();
        assert!(kept(&root, &[KEY_A]).is_none());
        // (a state as an earlier Meno wrote it, with a serial: not read)
        std::fs::write(root.join("catalogue-state.json"), br#"{"serial":3,"fetchedAt":"2026-11-05T00:00:00Z"}"#).unwrap();
        assert!(kept(&root, &[KEY_A]).is_none() && floor(&root).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_list_fetched_older_than_the_one_kept_is_refused_and_nothing_written() {
        let root = scratch("replay");
        let now = "2026-11-06T00:00:00Z";
        take_fetched(&root, LIST, LIST_A, &[KEY_A], "2026-11-05T00:00:00Z").unwrap();
        let before: Vec<Vec<u8>> = ["catalogue.json", "catalogue.json.minisig", "catalogue-state.json"].iter().map(|f| std::fs::read(root.join(f)).unwrap()).collect();
        assert!(take_fetched(&root, EARLIER, EARLIER_A, &[KEY_A], now).unwrap_err().contains("older"));
        assert!(take_fetched(&root, SAME_TIME, SAME_TIME_A, &[KEY_A], now).unwrap_err().contains("same second"));
        let after: Vec<Vec<u8>> = ["catalogue.json", "catalogue.json.minisig", "catalogue-state.json"].iter().map(|f| std::fs::read(root.join(f)).unwrap()).collect();
        assert_eq!(before, after);
        // (as the command gives it: the one kept, saying why the newer one was not taken)
        let given = got(&root, &[KEY_A], Some(Ok((EARLIER.to_vec(), EARLIER_A.to_vec()))), now).unwrap().unwrap();
        assert_eq!(given.catalogue["issued"], "2026-11-03T00:00:00Z");
        assert!(given.kept.unwrap().contains("older"));
        // (a newer one, signed with the next key Meno carries: taken, and kept)
        // (the very list again, fetched once more: taken)
        assert!(got(&root, &[KEY_A], Some(Ok((LIST.to_vec(), LIST_A.to_vec()))), now).unwrap().unwrap().kept.is_none());
        let given = got(&root, &[KEY_A, KEY_B], Some(Ok((LATER.to_vec(), LATER_B.to_vec()))), now).unwrap().unwrap();
        assert_eq!((given.catalogue["issued"].as_str(), given.kept), (Some("2026-11-04T00:00:00Z"), None));
        assert_eq!(floor(&root).map(|t| t.issued), Some("2026-11-04T00:00:00Z".to_string()));
        // (not fetched: the one kept, no word of why; fetching failed: the one kept, and why)
        assert!(got(&root, &[KEY_A, KEY_B], None, now).unwrap().unwrap().kept.is_none());
        assert_eq!(got(&root, &[KEY_A, KEY_B], Some(Err("offline".into())), now).unwrap().unwrap().kept.as_deref(), Some("offline"));
        let _ = std::fs::remove_dir_all(&root);
        // (none kept: none given - or, a fetch failed, why)
        let empty = scratch("empty");
        assert!(got(&empty, &[KEY_A], None, now).unwrap().is_none());
        assert_eq!(got(&empty, &[KEY_A], Some(Err("offline".into())), now).unwrap_err(), "offline");
    }

    #[test]
    fn a_plugin_s_entry_is_found_in_the_list_kept_never_as_the_page_says_it() {
        let root = scratch("entry");
        assert_eq!(entry_for(&root, &[KEY_A], "sketch", "0.3.0").unwrap_err(), "there is no list of the plugins online here");
        keep(&root, LIST, LIST_A, "2026-11-03T00:00:00Z", "2026-11-05T00:00:00Z").unwrap();
        let source = entry_for(&root, &[KEY_A], "sketch", "0.3.0").unwrap();
        assert_eq!((source.id.as_str(), source.version.as_str(), source.bytes), ("sketch", "0.3.0", 10));
        assert!(entry_for(&root, &[KEY_A], "sketch", "0.4.0").unwrap_err().contains("holds no"));
        assert!(entry_for(&root, &[KEY_A], "../sketch", "0.3.0").is_err());
        // (the list kept, its signature no longer Meno's: none)
        assert!(entry_for(&root, &[KEY_B], "sketch", "0.3.0").is_err());
        // (fetched no further than its entry's size, under the catalogue's hosts alone)
        assert_eq!(archive_most(&source), source.bytes);
        assert_eq!(hosts(), HOSTS.to_vec());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_entry_s_fingerprints_and_size_are_only_as_meno_takes_them() {
        let entry = |sha: &str, bytes: u64, manifest: &str| serde_json::json!({ "id": "sketch", "version": "0.3.0", "source": { "url": "https://github.com/a", "sha256": sha, "bytes": bytes }, "manifestSha256": manifest });
        let (a, b) = ("a".repeat(64), "b".repeat(64));
        assert!(source_of(&entry(&a, 10, &b)).is_ok());
        assert!(source_of(&entry(&"a".repeat(63), 10, &b)).is_err());
        assert!(source_of(&entry(&"a".repeat(65), 10, &b)).is_err());
        assert!(source_of(&entry(&a, 0, &b)).is_err());
        assert!(source_of(&entry(&a, 10, &"b".repeat(63))).is_err());
        assert!(source_of(&entry(&"A".repeat(64), 10, &b)).is_err());
    }

    #[test]
    fn an_archive_of_more_files_or_more_bytes_than_meno_takes_is_refused_whole() {
        let many: Vec<(String, Vec<u8>)> = (0..=FILES_MOST).map(|i| (format!("f{i}"), Vec::new())).collect();
        let refs: Vec<(&str, &[u8])> = many.iter().map(|(p, b)| (p.as_str(), b.as_slice())).collect();
        let dir = scratch("many");
        assert!(unpack_into(&archive(&refs, None), &dir).unwrap_err().contains("more than"));
        assert!(!dir.exists());
        // (a file whose header says it is more than Meno takes - nothing of it read)
        let mut header = tar::Header::new_gnu();
        header.set_path("big.bin").unwrap();
        header.set_size(UNPACKED_MOST + 1);
        header.set_entry_type(tar::EntryType::Regular);
        header.set_cksum();
        let mut raw = header.as_bytes().to_vec();
        raw.extend_from_slice(&[0u8; 1024]);
        let mut big = Vec::new();
        {
            let mut gz = flate2::write::GzEncoder::new(&mut big, flate2::Compression::default());
            std::io::Write::write_all(&mut gz, &raw).unwrap();
            gz.finish().unwrap();
        }
        let dir = scratch("big");
        assert!(unpack_into(&big, &dir).unwrap_err().contains("more than"));
        assert!(!dir.exists());
    }

    /// A stage as `plugin_stage` leaves one: its folder with `manifest`, and the entry it was staged for.
    fn staged(root: &Path, manifest: &str, staged_for: &str) -> String {
        let stage = uuid::Uuid::new_v4().simple().to_string();
        let dir = root.join(".staging").join(&stage);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("manifest.json"), manifest).unwrap();
        std::fs::write(for_of(&dir), staged_for).unwrap();
        stage
    }

    #[test]
    fn a_stage_is_taken_into_use_only_as_the_plugin_it_was_got_as() {
        let root = scratch("commit");
        // (an id or version Meno does not take, in its manifest)
        for (manifest, what) in [(r#"{"id":"../x","version":"0.3.0"}"#, "id"), (r#"{"id":"sketch","version":"1.2.3-rc"}"#, "version")] {
            let stage = staged(&root, manifest, "sketch\n0.3.0");
            assert!(commit_stage(&root, &stage).unwrap_err().contains(what), "{what}");
        }
        // (its manifest another plugin than the entry it was got for - one in use, say: thrown away, nothing of it used)
        let stage = staged(&root, r#"{"id":"other","version":"0.3.0"}"#, "sketch\n0.3.0");
        assert_eq!(commit_stage(&root, &stage).unwrap_err(), "its manifest is not the plugin it was got as");
        assert!(!root.join(".staging").join(&stage).exists() && !root.join("other").exists());
        // (not put in place - where its folder should go, a file: the stage thrown away whole, and said why)
        std::fs::write(root.join("blocked"), b"a file").unwrap();
        let stage = staged(&root, r#"{"id":"blocked","version":"0.3.0"}"#, "blocked\n0.3.0");
        let dir = root.join(".staging").join(&stage);
        assert!(commit_stage(&root, &stage).unwrap_err().starts_with("putting blocked 0.3.0 in place"));
        assert!(!dir.exists() && !for_of(&dir).exists());
        // (as it was got: taken in, and its entry beside it gone)
        let stage = staged(&root, r#"{"id":"sketch","version":"0.3.0"}"#, "sketch\n0.3.0");
        commit_stage(&root, &stage).unwrap();
        assert!(root.join("sketch/0.3.0/manifest.json").exists());
        assert!(!for_of(&root.join(".staging").join(&stage)).exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_plugin_s_files_are_taken_out_of_use_before_its_folder_is_taken_away() {
        let root = scratch("order");
        std::fs::create_dir_all(root.join("sketch/0.3.0")).unwrap();
        set_current(&root, "sketch", "0.3.0").unwrap();
        // (its folder not taken away - say, a file in it held: `current` gone already, so it is no plugin in use)
        let refused = remove_files(&root, "sketch", |d| {
            assert!(!d.join("current").exists(), "current taken away first");
            Err(std::io::Error::other("held"))
        });
        assert!(refused.unwrap_err().contains("held"));
        assert!(!root.join("sketch/current").exists());
        assert!(root.join("sketch/0.3.0").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
