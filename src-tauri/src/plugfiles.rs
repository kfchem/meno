//! Files a plugin needs besides its environment, as its manifest lists
//! them (`downloads`; docs/PLUGINS.md, *Files a plugin downloads*): a
//! model's trained weights, say - too large for Meno to carry, and not a
//! package uv or pixi installs. Each is fetched once, from where the
//! manifest says, checked against the SHA-256 it gives before it is kept,
//! and kept in the plugin's environment's folder - `files` beside its
//! `venv` - so that taking the plugin away takes them too.
//!
//! It goes on the network only as Meno's network lets it (net.rs): as a
//! task with the purpose the plugin's environment is set up under - so only
//! once the user has allowed that, having been told of these files and
//! their size - its requests through Meno's proxy. A download cut short is
//! taken up where it stopped, where the server allows it.

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
/// size in bytes.
#[derive(Debug, Clone, PartialEq)]
pub struct Download {
    pub file: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
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
        if !file_ok(&file) || !url_ok(&url) || !sha_ok(&sha256) || bytes == 0 || bytes > MOST_BYTES {
            return Err(format!("a download the manifest lists is not one Meno takes: {d}"));
        }
        if out.iter().any(|o| o.file == file) {
            return Err(format!("{file} is listed twice"));
        }
        out.push(Download { file, url, sha256, bytes });
    }
    Ok(out)
}

/// Where a plugin's files are kept, in the app data (`data`): `files` in
/// its environment's folder - uv's or pixi's - removed with it.
pub fn folder(data: &Path, id: &str, pixi: bool) -> PathBuf {
    let home = if pixi { data.join("pixi") } else { data.join("uv") };
    home.join(format!("plugin-{id}")).join("files")
}

/// The files not kept yet: those missing, or not the size they should be.
pub fn missing<'a>(dir: &Path, downloads: &'a [Download]) -> Vec<&'a Download> {
    downloads
        .iter()
        .filter(|d| std::fs::metadata(dir.join(&d.file)).map(|m| m.len() != d.bytes).unwrap_or(true))
        .collect()
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
/// user has allowed that - and kept, how far they have come said as they
/// come (`plugin-files:progress`).
#[tauri::command]
pub async fn plugin_files(app: AppHandle, plugin: String, fetch: bool) -> Result<FilesState, String> {
    if !crate::plugin_id_ok(&plugin) {
        return Err(format!("not a plugin's id: {plugin}"));
    }
    let manifest = manifest_of(&app, &plugin)?;
    let downloads = downloads_of(&manifest)?;
    let pixi = manifest.get("environment").and_then(Value::as_str) == Some("pixi");
    let data = app.path().app_data_dir().map_err(|e| format!("app data dir: {e}"))?;
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
    let task = app.state::<Net>().begin(&format!("python-env:plugin-{plugin}"), &format!("Downloading what {name} needs"))?;
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
        fetch_one(&client, d, &dir, tell).await?;
        before += d.bytes;
    }
    task.finish(true);
    Ok(state(&[]))
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
        assert_eq!(got, vec![Download { file: "model.pth".into(), url: "https://huggingface.co/x/y/resolve/abc/model.pth".into(), sha256: "a".repeat(64), bytes: 10 }]);
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

    #[test]
    fn keeps_a_plugins_files_in_its_environments_folder() {
        let data = Path::new("/data");
        assert_eq!(folder(data, "molscribe", false), Path::new("/data/uv/plugin-molscribe/files"));
        assert_eq!(folder(data, "x", true), Path::new("/data/pixi/plugin-x/files"));
    }

    #[test]
    fn a_file_not_its_size_is_still_missing() {
        let dir = Scratch::new();
        let d = |file: &str, bytes| Download { file: file.into(), url: "https://h/m".into(), sha256: "a".repeat(64), bytes };
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
        Download { file: "model.bin".into(), url: url.into(), sha256: sha(body), bytes: body.len() as u64 }
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
