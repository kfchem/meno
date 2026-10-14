//! The tools that make Meno's Python environments - uv, and pixi - fetched
//! the first time an environment needs one, and never bundled
//! (docs/WORKSPACE.md, stage 3d): either alone does nothing without the
//! network, and bundled, every update of Meno carried it again.
//!
//! Each tool's version, and its archive's SHA-256 for each computer Meno is
//! built for, are pinned here, so they come with Meno as surely as a bundled
//! tool would: the archive is fetched through the network task of the
//! environment it is for - under that environment's consent - checked
//! against its hash, and its program kept in the app's data folder, in
//! `tools/<tool>/<version>/`. A version no longer pinned is taken away once
//! the new one is in place.

use sha2::{Digest, Sha256};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

/// A tool that makes environments.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    /// Astral's uv: environments PyPI fills.
    Uv,
    /// prefix.dev's pixi: environments that need conda-forge.
    Pixi,
}

impl Tool {
    pub fn name(self) -> &'static str {
        match self {
            Tool::Uv => "uv",
            Tool::Pixi => "pixi",
        }
    }
}

/// How a tool's archive is packed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Archive {
    TarGz,
    Zip,
}

/// A tool's build for one computer: its version, where its archive is, the
/// archive's SHA-256, how it is packed, and where in it the program is.
#[derive(Debug)]
pub struct Pin {
    pub tool: Tool,
    pub target: &'static str,
    pub version: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub archive: Archive,
    pub member: &'static str,
}

impl Pin {
    /// The program's own file name: the archive's member's last part.
    pub fn program(&self) -> &'static str {
        self.member.rsplit('/').next().unwrap_or(self.member)
    }
}

/// The computer this build of Meno runs on, as the tools name their builds.
pub const TARGET: &str = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "aarch64-apple-darwin"
} else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    "x86_64-apple-darwin"
} else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
    "x86_64-pc-windows-msvc"
} else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    "x86_64-unknown-linux"
} else {
    "unsupported"
};

/// Every pinned build. uv's come from Astral's own host, as the Pythons it
/// installs do; pixi's from its releases on GitHub. The hashes are the
/// releases' own, checked against the archives when they were pinned.
pub static PINS: &[Pin] = &[
    Pin {
        tool: Tool::Uv,
        target: "aarch64-apple-darwin",
        version: "0.12.19",
        url: "https://releases.astral.sh/github/uv/releases/download/0.12.19/uv-aarch64-apple-darwin.tar.gz",
        sha256: "a9a8df1eedeb192f2e47e40e2faabfb387db4b850209118786d42f89dde3e0ba",
        archive: Archive::TarGz,
        member: "uv-aarch64-apple-darwin/uv",
    },
    Pin {
        tool: Tool::Uv,
        target: "x86_64-apple-darwin",
        version: "0.12.19",
        url: "https://releases.astral.sh/github/uv/releases/download/0.12.19/uv-x86_64-apple-darwin.tar.gz",
        sha256: "cb5fa57bafe68fc0fb94b17f06bee0b0b9a7feb94ccbd110445afa0696e39273",
        archive: Archive::TarGz,
        member: "uv-x86_64-apple-darwin/uv",
    },
    Pin {
        tool: Tool::Uv,
        target: "x86_64-pc-windows-msvc",
        version: "0.12.19",
        url: "https://releases.astral.sh/github/uv/releases/download/0.12.19/uv-x86_64-pc-windows-msvc.zip",
        sha256: "6dbb02d79e419522f1c500f0adb1cddcff0cda7d59b0d66ea7f5e3b4a1b2f5f0",
        archive: Archive::Zip,
        member: "uv.exe",
    },
    Pin {
        tool: Tool::Uv,
        target: "x86_64-unknown-linux",
        version: "0.12.19",
        url: "https://releases.astral.sh/github/uv/releases/download/0.12.19/uv-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "23bf5552d220e0842b65c862097b2ebaeba0064b74eda5e565e77fd25969d8c8",
        archive: Archive::TarGz,
        member: "uv-x86_64-unknown-linux-gnu/uv",
    },
    Pin {
        tool: Tool::Pixi,
        target: "aarch64-apple-darwin",
        version: "0.81.0",
        url: "https://github.com/prefix-dev/pixi/releases/download/v0.81.0/pixi-aarch64-apple-darwin.tar.gz",
        sha256: "f4e32ea91970d4e11739488817979a5f2c6ebbb9cedb0d6dea74b2b790b272dc",
        archive: Archive::TarGz,
        member: "pixi",
    },
    Pin {
        tool: Tool::Pixi,
        target: "x86_64-apple-darwin",
        version: "0.81.0",
        url: "https://github.com/prefix-dev/pixi/releases/download/v0.81.0/pixi-x86_64-apple-darwin.tar.gz",
        sha256: "9859588ba57f390b5c77d56b2654fab37bc00e10952da25e3efd6e3434557e5a",
        archive: Archive::TarGz,
        member: "pixi",
    },
    Pin {
        tool: Tool::Pixi,
        target: "x86_64-pc-windows-msvc",
        version: "0.81.0",
        url: "https://github.com/prefix-dev/pixi/releases/download/v0.81.0/pixi-x86_64-pc-windows-msvc.zip",
        sha256: "1fc82219c96d539e6a856bd1bb2643ec9e1753f5b3af61b0c3158921aca89de3",
        archive: Archive::Zip,
        member: "pixi.exe",
    },
    Pin {
        tool: Tool::Pixi,
        target: "x86_64-unknown-linux",
        version: "0.81.0",
        url: "https://github.com/prefix-dev/pixi/releases/download/v0.81.0/pixi-x86_64-unknown-linux-musl.tar.gz",
        sha256: "7aa3ec39aecceff9062fa2ed4d42cbaa0bdc25ddea727d048e061cf188d434f6",
        archive: Archive::TarGz,
        member: "pixi",
    },
];

/// A tool's pinned build for this computer.
pub fn pin(tool: Tool) -> Result<&'static Pin, String> {
    pin_for(tool, TARGET)
}

fn pin_for(tool: Tool, target: &str) -> Result<&'static Pin, String> {
    PINS.iter()
        .find(|p| p.tool == tool && p.target == target)
        .ok_or_else(|| format!("Meno has no {} for this computer ({target})", tool.name()))
}

/// Where a tool's program is kept, in the app's data folder `data`.
pub fn program_path(data: &Path, pin: &Pin) -> PathBuf {
    data.join("tools").join(pin.tool.name()).join(pin.version).join(pin.program())
}

/// A tool's program, fetched first if it is not here: through `proxy` (the
/// network task's), checked against its hash, unpacked, and made runnable.
pub async fn ensure(data: &Path, tool: Tool, proxy: Option<String>) -> Result<PathBuf, String> {
    let pin = pin(tool)?;
    let program = program_path(data, pin);
    if program.is_file() {
        return Ok(program);
    }
    let proxy = proxy.ok_or("the network is not ready")?;
    let archive = download(pin.url, &proxy).await?;
    check(&archive, pin.sha256).map_err(|e| format!("{} {}: {e}", pin.tool.name(), pin.version))?;
    let body = unpack(&archive, pin.archive, pin.member)?;
    place(&program, &body)?;
    forget_others(data, pin);
    Ok(program)
}

/// The most a tool's archive may be. uv's and pixi's are tens of megabytes;
/// no size is pinned with them, so the bound is a generous one.
const ARCHIVE_MOST: u64 = 256 * 1024 * 1024;

async fn download(url: &str, proxy: &str) -> Result<Vec<u8>, String> {
    // (rustls, as the updater has it: its crypto provider set once)
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("Meno/", env!("CARGO_PKG_VERSION")))
        .proxy(reqwest::Proxy::all(proxy).map_err(|e| format!("proxy: {e}"))?)
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("fetching {url}: {e}"))?;
    body_within(response, url, ARCHIVE_MOST).await
}

/// A response's body, read piece by piece as it comes, never more than
/// `most` bytes (`Within`) - one that says beforehand it is more, not read at all.
pub async fn body_within(mut response: reqwest::Response, what: &str, most: u64) -> Result<Vec<u8>, String> {
    let mut body = Within::new(what, most);
    if response.content_length().is_some_and(|n| n > most) {
        return Err(body.too_large());
    }
    while let Some(piece) = response.chunk().await.map_err(|e| format!("fetching {what}: {e}"))? {
        body.take(&piece)?;
    }
    Ok(body.whole())
}

/// A body gathered as it comes, never more than `most` bytes: a piece that
/// would take it past them is refused, saying so - and what came is let go.
pub struct Within {
    what: String,
    most: u64,
    body: Vec<u8>,
}

impl Within {
    pub fn new(what: &str, most: u64) -> Within {
        Within { what: what.to_string(), most, body: Vec::new() }
    }

    /// One more piece of it.
    pub fn take(&mut self, piece: &[u8]) -> Result<(), String> {
        if self.body.len() as u64 + piece.len() as u64 > self.most {
            self.body = Vec::new();
            return Err(self.too_large());
        }
        self.body.extend_from_slice(piece);
        Ok(())
    }

    /// All of it.
    pub fn whole(self) -> Vec<u8> {
        self.body
    }

    fn too_large(&self) -> String {
        format!("{} is larger than Meno takes it to be (more than {} bytes): not taken", self.what, self.most)
    }
}

/// Whether `bytes` are what `sha256` (hex) says.
pub fn check(bytes: &[u8], sha256: &str) -> Result<(), String> {
    let got: String = Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
    if got.eq_ignore_ascii_case(sha256) {
        Ok(())
    } else {
        Err(format!("the archive is not the one Meno knows (SHA-256 {got})"))
    }
}

/// The member `member` of an archive, as bytes.
pub fn unpack(archive: &[u8], kind: Archive, member: &str) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    match kind {
        Archive::TarGz => {
            let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(Cursor::new(archive)));
            for entry in tar.entries().map_err(|e| format!("archive: {e}"))? {
                let mut entry = entry.map_err(|e| format!("archive: {e}"))?;
                let path = entry.path().map_err(|e| format!("archive: {e}"))?;
                if path.to_string_lossy().trim_start_matches("./") == member {
                    entry.read_to_end(&mut body).map_err(|e| format!("archive: {e}"))?;
                    return Ok(body);
                }
            }
        }
        Archive::Zip => {
            let mut zip = zip::ZipArchive::new(Cursor::new(archive)).map_err(|e| format!("archive: {e}"))?;
            let found = match zip.by_name(member) {
                Ok(mut file) => {
                    file.read_to_end(&mut body).map_err(|e| format!("archive: {e}"))?;
                    true
                }
                Err(_) => false,
            };
            if found {
                return Ok(body);
            }
        }
    }
    Err(format!("the archive has no {member}"))
}

/// Writes a program where it is kept - whole, or not at all: written beside
/// it first, then put in place - runnable.
fn place(program: &Path, body: &[u8]) -> Result<(), String> {
    let dir = program.parent().ok_or("no folder for the program")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let part = dir.join(format!(".{}.{}.part", program.file_name().and_then(|n| n.to_str()).unwrap_or("tool"), uuid::Uuid::new_v4()));
    std::fs::write(&part, body).map_err(|e| format!("{}: {e}", part.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&part, std::fs::Permissions::from_mode(0o755)).map_err(|e| format!("{}: {e}", part.display()))?;
    }
    // (another setup may have put it there meanwhile: theirs stands)
    if let Err(e) = std::fs::rename(&part, program) {
        let _ = std::fs::remove_file(&part);
        if !program.is_file() {
            return Err(format!("{}: {e}", program.display()));
        }
    }
    Ok(())
}

/// Takes away a tool's other versions, now one pinned is in place.
fn forget_others(data: &Path, pin: &Pin) {
    let Ok(entries) = std::fs::read_dir(data.join("tools").join(pin.tool.name())) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy() != pin.version && entry.path().is_dir() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn every_computer_meno_is_built_for_has_both_tools_pinned() {
        for target in ["aarch64-apple-darwin", "x86_64-apple-darwin", "x86_64-pc-windows-msvc", "x86_64-unknown-linux"] {
            for tool in [Tool::Uv, Tool::Pixi] {
                let p = pin_for(tool, target).unwrap();
                assert!(p.url.starts_with("https://"), "{}", p.url);
                assert!(p.url.contains(p.version), "{}", p.url);
                assert_eq!(p.sha256.len(), 64);
                assert!(p.sha256.chars().all(|c| c.is_ascii_hexdigit()));
                assert_eq!(p.archive == Archive::Zip, target.contains("windows"));
                assert_eq!(p.program(), if target.contains("windows") { format!("{}.exe", tool.name()) } else { tool.name().to_string() });
            }
        }
        assert!(pin_for(Tool::Uv, "riscv64-unknown-linux").is_err());
    }

    #[test]
    fn a_tool_is_kept_in_the_data_folder_by_its_version() {
        let p = pin_for(Tool::Pixi, "x86_64-pc-windows-msvc").unwrap();
        assert_eq!(program_path(Path::new("data"), p), Path::new("data").join("tools").join("pixi").join("0.81.0").join("pixi.exe"));
    }

    #[test]
    fn an_archive_is_taken_only_as_its_hash_says() {
        let sha = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"; // "hello"
        assert!(check(b"hello", sha).is_ok());
        assert!(check(b"hello", &sha.to_uppercase()).is_ok());
        assert!(check(b"hellp", sha).is_err());
    }

    fn tar_gz(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast()));
        for (name, body) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder.append_data(&mut header, name, *body).unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap()
    }

    fn zipped(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, body) in files {
            zip.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(body).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    #[test]
    fn the_program_is_taken_out_of_its_archive_and_nothing_else() {
        let tgz = tar_gz(&[("uv-aarch64-apple-darwin/uvx", b"uvx"), ("uv-aarch64-apple-darwin/uv", b"the uv")]);
        assert_eq!(unpack(&tgz, Archive::TarGz, "uv-aarch64-apple-darwin/uv").unwrap(), b"the uv");
        assert!(unpack(&tgz, Archive::TarGz, "uv").is_err());
        let zip = zipped(&[("uvx.exe", b"uvx"), ("uv.exe", b"the uv")]);
        assert_eq!(unpack(&zip, Archive::Zip, "uv.exe").unwrap(), b"the uv");
        assert!(unpack(&zip, Archive::Zip, "pixi.exe").is_err());
    }

    /// A body in memory read as a response's comes, `size` bytes a piece,
    /// into `Within`: all of it, or why not and how much was left unread.
    fn read_within(body: &[u8], size: usize, most: u64) -> (Result<Vec<u8>, String>, usize) {
        let mut stream = Cursor::new(body);
        let mut within = Within::new("the archive", most);
        let mut piece = vec![0u8; size];
        loop {
            let n = stream.read(&mut piece).unwrap();
            if n == 0 {
                return (Ok(within.whole()), 0);
            }
            if let Err(e) = within.take(&piece[..n]) {
                return (Err(e), body.len() - stream.position() as usize);
            }
        }
    }

    #[test]
    fn takes_a_body_only_up_to_its_bound() {
        let body: Vec<u8> = (0..10_000u32).map(|i| (i % 251) as u8).collect();
        // within it, or exactly it: whole
        for most in [10_000, 1 << 20] {
            assert_eq!(read_within(&body, 333, most).0.unwrap(), body);
        }
        // a byte past it: refused, saying so
        let (got, _) = read_within(&body, 333, 9_999);
        assert_eq!(got.unwrap_err(), "the archive is larger than Meno takes it to be (more than 9999 bytes): not taken");
        // (stopped at the piece that goes past it: the rest never read)
        let (got, unread) = read_within(&body, 333, 1_000);
        assert!(got.is_err());
        assert_eq!(unread, 10_000 - 4 * 333);
        // nothing at all
        assert_eq!(read_within(&[], 1, 0).0.unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn a_program_is_put_in_place_runnable_and_other_versions_go() {
        let data = std::env::temp_dir().join(format!("meno-tools-{}", uuid::Uuid::new_v4()));
        let p = pin_for(Tool::Uv, TARGET).unwrap_or(&PINS[0]);
        let old = data.join("tools").join("uv").join("0.0.1");
        std::fs::create_dir_all(&old).unwrap();
        let program = program_path(&data, p);
        place(&program, b"the uv").unwrap();
        assert_eq!(std::fs::read(&program).unwrap(), b"the uv");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&program).unwrap().permissions().mode() & 0o777, 0o755);
        }
        forget_others(&data, p);
        assert!(!old.exists());
        assert!(program.is_file());
        let _ = std::fs::remove_dir_all(&data);
    }

    /// Fetches both tools for this computer, as pinned, and runs each:
    /// by hand, as it needs the network - `cargo test -- --ignored`.
    #[tokio::test(flavor = "current_thread")]
    #[ignore]
    async fn fetches_each_tool_for_this_computer() {
        let data = std::env::temp_dir().join(format!("meno-tools-{}", uuid::Uuid::new_v4()));
        for tool in [Tool::Uv, Tool::Pixi] {
            let p = pin(tool).unwrap();
            let archive = direct(p.url).await;
            check(&archive, p.sha256).unwrap();
            // (within the bound Meno fetches it under)
            assert!(archive.len() as u64 <= ARCHIVE_MOST, "{}: {} bytes", p.url, archive.len());
            let program = program_path(&data, p);
            place(&program, &unpack(&archive, p.archive, p.member).unwrap()).unwrap();
            let out = std::process::Command::new(&program).arg("--version").output().unwrap();
            assert!(out.status.success());
            let said = String::from_utf8_lossy(&out.stdout);
            assert!(said.contains(p.version), "{said}");
        }
        let _ = std::fs::remove_dir_all(&data);
    }

    async fn direct(url: &str) -> Vec<u8> {
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        reqwest::Client::new().get(url).send().await.unwrap().error_for_status().unwrap().bytes().await.unwrap().to_vec()
    }
}
