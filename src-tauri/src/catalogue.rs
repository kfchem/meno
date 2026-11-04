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
/// changed for the other by a Meno that carries both first. None until the maintainer gives the first: no
/// catalogue is taken until then.
const KEYS: &[&str] = &[];

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

/// The catalogue, checked: signed by one of `keys`, of the form Meno reads, and - where Meno has taken one
/// before (`floor`, its serial) - not older than it. Only then is it read at all; its serial with it.
fn checked(list: &[u8], sig: &[u8], keys: &[&str], floor: Option<u64>) -> Result<(Value, u64), String> {
    let signature = signature_of(sig)?;
    let signed = keys
        .iter()
        .filter_map(|k| PublicKey::from_base64(k).ok())
        .any(|k| k.verify(list, &signature, false).is_ok());
    if !signed {
        return Err(if keys.is_empty() { "Meno has no key to check the list with yet".to_string() } else { "the list is not signed with Meno's key".to_string() });
    }
    let value: Value = serde_json::from_slice(list).map_err(|_| "the list is not one Meno reads".to_string())?;
    if value.get("schema").and_then(Value::as_u64) != Some(SCHEMA) {
        return Err("the list is of a form this Meno does not read: a newer Meno may".to_string());
    }
    let serial = value.get("serial").and_then(Value::as_u64).filter(|s| *s > 0).ok_or("the list has no serial")?;
    if let Some(floor) = floor {
        if serial < floor {
            return Err(format!("the list is older than one Meno has taken (its serial {serial}, under {floor})"));
        }
    }
    Ok((value, serial))
}

/// The catalogue as kept, and what Meno knows of it.
#[derive(serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeptState {
    serial: u64,
    fetched_at: String,
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

/// The catalogue kept from before, checked again as it is read - never trusted for having been kept.
fn kept(root: &Path, keys: &[&str]) -> Option<(Value, KeptState)> {
    let list = std::fs::read(root.join("catalogue.json")).ok()?;
    let sig = std::fs::read(root.join("catalogue.json.minisig")).ok()?;
    let state: KeptState = serde_json::from_slice(&std::fs::read(root.join("catalogue-state.json")).ok()?).ok()?;
    let (value, serial) = checked(&list, &sig, keys, None).ok()?;
    (serial == state.serial).then_some((value, state))
}

/// Keeps a catalogue checked: the list and its signature, then what Meno knows of it - its serial the floor
/// a later one is held to.
fn keep(root: &Path, list: &[u8], sig: &[u8], serial: u64, fetched_at: &str) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| format!("making {}: {e}", root.display()))?;
    put(&root.join("catalogue.json"), list)?;
    put(&root.join("catalogue.json.minisig"), sig)?;
    let state = serde_json::to_vec(&KeptState { serial, fetched_at: fetched_at.to_string() }).map_err(|e| e.to_string())?;
    put(&root.join("catalogue-state.json"), &state)
}

/// The serial a fetched catalogue is held to: the one kept's, signed or not - a catalogue kept whose
/// signature no longer checks does not lower it.
fn floor(root: &Path) -> Option<u64> {
    let state: KeptState = serde_json::from_slice(&std::fs::read(root.join("catalogue-state.json")).ok()?).ok()?;
    Some(state.serial)
}

/// What the page is given: the catalogue checked, when it was fetched, and - where it is the one kept from
/// before, though a newer one was asked for - why.
#[derive(Serialize)]
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
async fn fetch_list(net: &net::Net) -> Result<(Vec<u8>, Vec<u8>), String> {
    let task = net.begin(PURPOSE, "The plugins online", Some(HOSTS.iter().map(|h| h.to_string()).collect()))?;
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
    let mut why = None;
    if fetch {
        let fetched = fetch_list(&net).await.and_then(|(list, sig)| {
            let (value, serial) = checked(&list, &sig, KEYS, floor(&root))?;
            Ok((list, sig, value, serial))
        });
        match fetched {
            Ok((list, sig, catalogue, serial)) => {
                let fetched_at = now_iso();
                keep(&root, &list, &sig, serial, &fetched_at)?;
                return Ok(Some(Got { catalogue, fetched_at, kept: None }));
            }
            Err(e) => why = Some(e),
        }
    }
    match (kept(&root, KEYS), why) {
        (Some((catalogue, state)), why) => Ok(Some(Got { catalogue, fetched_at: state.fetched_at, kept: why })),
        (None, Some(why)) => Err(why),
        (None, None) => Ok(None),
    }
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
struct Source {
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
    Ok(Source { url: url.to_string(), sha256, bytes, manifest_sha256 })
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
                Component::Normal(p) => rel.push(p),
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
    unpack_into(archive, &dir)?;
    let manifest = std::fs::read(dir.join("manifest.json")).ok();
    let fits = manifest.as_deref().is_some_and(|m| tools::check(m, &source.manifest_sha256).is_ok());
    let text = manifest.and_then(|m| String::from_utf8(m).ok());
    match (fits, text) {
        (true, Some(manifest)) => Ok(Staged { stage, manifest }),
        _ => {
            let _ = std::fs::remove_dir_all(&dir);
            Err("its manifest is not the one the list gave the fingerprint of".to_string())
        }
    }
}

/// A plugin's files got (lib/plugins/online `getPlugin`): its entry found in the catalogue kept - checked
/// again, never as the page says it - its archive fetched under the catalogue's purpose, and staged.
#[tauri::command]
pub async fn plugin_stage(app: AppHandle, net: State<'_, net::Net>, id: String, version: String) -> Result<Staged, String> {
    if !crate::plugin_id_ok(&id) || !version_ok(&version) {
        return Err("not a plugin's id and version".to_string());
    }
    let root = root(&app)?;
    let (catalogue, _) = kept(&root, KEYS).ok_or("there is no list of the plugins online here")?;
    let entry = entry_of(&catalogue, &id, &version).ok_or_else(|| format!("the list holds no {id} {version}"))?;
    let source = source_of(entry)?;
    let task = net.begin(PURPOSE, &format!("Getting the plugin {id} {version}"), Some(HOSTS.iter().map(|h| h.to_string()).collect()))?;
    let proxy = task.proxy_url().ok_or("the network is not ready")?;
    let archive = match tools::download(&source.url, &proxy, source.bytes).await {
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

/// A stage taken into use: its folder made `<id>/<version>` - by its manifest's id and version - and
/// `current` naming it. A version once in place is never changed: where it is there already, the stage is
/// thrown away and `current` names that one.
fn commit_stage(root: &Path, stage: &str) -> Result<(), String> {
    let dir = stage_dir(root, stage)?;
    let manifest: Value = serde_json::from_slice(&std::fs::read(dir.join("manifest.json")).map_err(|_| "no such stage")?).map_err(|_| "its manifest is not one Meno reads")?;
    let id = manifest.get("id").and_then(Value::as_str).filter(|i| crate::plugin_id_ok(i)).ok_or("its manifest gives no id Meno takes")?;
    let version = manifest.get("version").and_then(Value::as_str).filter(|v| version_ok(v)).ok_or("its manifest gives no version Meno takes")?;
    let target = root.join(id).join(version);
    if target.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    } else {
        std::fs::create_dir_all(root.join(id)).map_err(|e| format!("making {id}: {e}"))?;
        std::fs::rename(&dir, &target).map_err(|e| format!("putting {id} {version} in place: {e}"))?;
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
    let dir = stage_dir(&root(&app)?, &stage)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("throwing the stage away: {e}"))?;
    }
    Ok(())
}

/// A plugin's files taken away: `current` first - so that a folder left half taken is no plugin in use - then
/// its folder.
fn remove_files(root: &Path, id: &str) -> Result<(), String> {
    if !crate::plugin_id_ok(id) {
        return Err("not a plugin's id".to_string());
    }
    let dir = root.join(id);
    let current = dir.join("current");
    if current.exists() {
        std::fs::remove_file(&current).map_err(|e| format!("taking {id} out of use: {e}"))?;
    }
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("removing {id}'s files: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn plugin_files_remove(app: AppHandle, id: String) -> Result<(), String> {
    remove_files(&root(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Three key pairs made for these tests alone, their secret keys not kept: the list signed with the first
    // (serial 3, and 2), and with the second (serial 4); the third, no key of Meno's.
    const KEY_A: &str = "RWSs/jS3j5RbI4onMUi8LIJIdFYySkSf8LvHJ/GjO3I7aCC3nHeGRbyg";
    const KEY_B: &str = "RWTQ7SrJNzUVkBa6/essR0FBoRqIxc/TXBT0aOV96ubAdl4JQ68b2IgT";
    const SERIAL2: &[u8] = include_bytes!("../fixtures/catalogue/serial2.json");
    const SERIAL2_A: &[u8] = include_bytes!("../fixtures/catalogue/serial2.a.minisig");
    const SERIAL3: &[u8] = include_bytes!("../fixtures/catalogue/serial3.json");
    const SERIAL3_A: &[u8] = include_bytes!("../fixtures/catalogue/serial3.a.minisig");
    const SERIAL4: &[u8] = include_bytes!("../fixtures/catalogue/serial4.json");
    const SERIAL4_B: &[u8] = include_bytes!("../fixtures/catalogue/serial4.b.minisig");
    const SERIAL4_C: &[u8] = include_bytes!("../fixtures/catalogue/serial4.c.minisig");

    fn scratch(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("meno-catalogue-{name}-{}", uuid::Uuid::new_v4().simple()))
    }

    #[test]
    fn a_list_is_read_only_signed_with_meno_s_key() {
        let (value, serial) = checked(SERIAL3, SERIAL3_A, &[KEY_A], None).unwrap();
        assert_eq!(serial, 3);
        assert_eq!(value["plugins"][0]["id"], "sketch");
        // (signed with no key of Meno's, or with none given at all)
        assert_eq!(checked(SERIAL4, SERIAL4_C, &[KEY_A, KEY_B], None).unwrap_err(), "the list is not signed with Meno's key");
        assert_eq!(checked(SERIAL3, SERIAL3_A, &[], None).unwrap_err(), "Meno has no key to check the list with yet");
        // (a list changed after it was signed - one byte - or another list's signature)
        let mut changed = SERIAL3.to_vec();
        let at = changed.iter().position(|b| *b == b'3').unwrap();
        changed[at] = b'9';
        assert!(checked(&changed, SERIAL3_A, &[KEY_A], None).is_err());
        assert!(checked(SERIAL2, SERIAL3_A, &[KEY_A], None).is_err());
        assert!(checked(SERIAL3, b"not a signature", &[KEY_A], None).is_err());
    }

    #[test]
    fn the_next_key_signs_once_meno_carries_it() {
        assert!(checked(SERIAL4, SERIAL4_B, &[KEY_A], None).is_err());
        assert_eq!(checked(SERIAL4, SERIAL4_B, &[KEY_A, KEY_B], None).unwrap().1, 4);
    }

    #[test]
    fn a_signature_is_read_as_minisign_writes_it_or_in_base64() {
        use base64::Engine;
        let wrapped = base64::engine::general_purpose::STANDARD.encode(SERIAL3_A);
        assert_eq!(checked(SERIAL3, wrapped.as_bytes(), &[KEY_A], None).unwrap().1, 3);
    }

    #[test]
    fn a_list_older_than_one_taken_is_refused() {
        assert!(checked(SERIAL2, SERIAL2_A, &[KEY_A], Some(2)).is_ok());
        assert_eq!(checked(SERIAL2, SERIAL2_A, &[KEY_A], Some(3)).unwrap_err(), "the list is older than one Meno has taken (its serial 2, under 3)");
    }

    #[test]
    fn a_list_kept_is_checked_again_as_it_is_read_and_holds_later_ones_to_its_serial() {
        let root = scratch("kept");
        keep(&root, SERIAL3, SERIAL3_A, 3, "2026-11-05T00:00:00Z").unwrap();
        let (value, state) = kept(&root, &[KEY_A]).unwrap();
        assert_eq!((value["serial"].as_u64(), state.fetched_at.as_str()), (Some(3), "2026-11-05T00:00:00Z"));
        assert_eq!(floor(&root), Some(3));
        // (one changed where it is kept: not read)
        std::fs::write(root.join("catalogue.json"), SERIAL2).unwrap();
        assert!(kept(&root, &[KEY_A]).is_none());
        // (and the floor stays: a list signed but older is refused still)
        assert!(checked(SERIAL2, SERIAL2_A, &[KEY_A], floor(&root)).is_err());
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
        Source { url: String::new(), sha256: sha(archive), bytes: archive.len() as u64, manifest_sha256: sha(MANIFEST) }
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
        remove_files(&root, "sketch").unwrap();
        assert!(!root.join("sketch").exists());
        assert!(remove_files(&root, "../up").is_err());
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
        ] {
            let dir = scratch("unpack");
            assert!(unpack_into(&a, &dir).is_err(), "{what}");
            assert!(!dir.exists(), "{what}: what was unpacked taken away");
            assert!(!dir.parent().unwrap().join("up.txt").exists());
        }
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
        let entry = |url: &str| serde_json::json!({ "source": { "url": url, "sha256": "a".repeat(64), "bytes": 10 }, "manifestSha256": "b".repeat(64) });
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
        let big = serde_json::json!({ "source": { "url": "https://github.com/a", "sha256": "a".repeat(64), "bytes": ARCHIVE_MOST + 1 }, "manifestSha256": "b".repeat(64) });
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
}
