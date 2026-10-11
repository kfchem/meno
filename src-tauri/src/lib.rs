// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Component, Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Mutex, MutexGuard, PoisonError},
};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use uuid::Uuid;

mod clipboard;
mod fonts;
#[cfg(windows)]
mod drop;
mod jobs;
mod pdf;
mod net;
mod pixienv;
mod tools;
mod update;
#[cfg(windows)]
mod ole;

// uv-based Python env helpers
#[derive(Deserialize, Clone)]
struct PyEnvInfo {
    #[serde(rename = "os")]
    _os: String,
    #[serde(rename = "lockPath")]
    lock_path: String,
    #[serde(rename = "venvHome")]
    venv_home: String,
    #[serde(rename = "venvPythonRel")]
    venv_python_rel: String,
    #[serde(rename = "stampPath")]
    _stamp_path: String,
    #[serde(rename = "pythonVersion")]
    python_version: String,
    /// What the environment is for, as the user allowed its download
    /// ("python-env:console"), and in words.
    #[serde(default)]
    purpose: String,
    #[serde(default)]
    label: String,
    /// What makes it: "uv" (or unsaid), or "pixi" - an environment that needs conda-forge.
    #[serde(default)]
    host: String,
}

/// Whether a lock file pins its packages by hash as well as by version.
fn lock_is_hashed(lock: &str) -> bool {
    lock.lines().any(|line| line.trim_start().starts_with("--hash="))
}

/// The purpose a setup's downloads go under: one of the Python environments'
/// own, never another's - the user's code needs no asking, a setup does.
fn setup_purpose(info: &PyEnvInfo) -> Result<String, String> {
    let name = info
        .purpose
        .strip_prefix("python-env:")
        .ok_or_else(|| format!("unexpected purpose: {}", info.purpose))?;
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("unexpected purpose: {}", info.purpose));
    }
    Ok(info.purpose.clone())
}

// The webview supplies every path these commands use, so each one is checked
// here: lock files must be bundled resources, venvs must live under the app
// data dir, and sidecars may only run a venv's Python on a bundled worker
// script. uv is none of the webview's to name: it is the one pinned in
// tools.rs, fetched when first needed. See docs/ARCHITECTURE.md.
/// Python interpreter file names a sidecar may be started with.
const PYTHON_NAMES: &[&str] = &["python", "python3", "python.exe"];
/// Interpreter flags allowed before the worker script.
const PYTHON_FLAGS: &[&str] = &["-u", "-B"];

/// Parse `p` as a path relative to some base directory, rejecting anything
/// that could escape it: absolute paths, drive/UNC prefixes, `.` and `..`.
fn safe_relative(p: &str) -> Result<PathBuf, String> {
    if p.is_empty() {
        return Err("empty path".into());
    }
    let mut out = PathBuf::new();
    for c in Path::new(p).components() {
        match c {
            Component::Normal(s) => out.push(s),
            _ => return Err(format!("path must be relative without '..': {p}")),
        }
    }
    Ok(out)
}

fn valid_python_version(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 16
        && v.split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

/// `PyEnvInfo` paths after validation; all relative to their base directory.
#[derive(Debug)]
struct ValidatedEnv {
    /// Made by pixi (pixienv.rs), not by uv.
    pixi: bool,
    lock: PathBuf,
    venv_home: PathBuf,
    venv_python_rel: PathBuf,
}

fn validate_env_info(info: &PyEnvInfo) -> Result<ValidatedEnv, String> {
    if info.host == "pixi" {
        return validate_pixi_env(info);
    }
    if !info.host.is_empty() && info.host != "uv" {
        return Err(format!("unexpected host: {}", info.host));
    }
    let lock = safe_relative(&info.lock_path)?;
    let is_lock = lock.extension().and_then(|e| e.to_str()) == Some("lock");
    let venv_home = safe_relative(&info.venv_home)?;
    match plugin_file(&lock) {
        // (a plugin's: its requirements.lock, made into its own environment)
        Some((id, file)) => {
            if file != "requirements.lock" {
                return Err(format!("unexpected lock file: {}", info.lock_path));
            }
            if venv_home != Path::new("uv").join(format!("plugin-{id}")).join("venv") {
                return Err(format!("unexpected venv location: {}", info.venv_home));
            }
        }
        // (Meno's own, among its locks)
        None => {
            if !is_lock || !lock.starts_with("resources/py") {
                return Err(format!("unexpected lock file: {}", info.lock_path));
            }
            if !venv_home.starts_with("uv") || venv_home.as_path() == Path::new("uv") {
                return Err(format!("unexpected venv location: {}", info.venv_home));
            }
        }
    }
    let venv_python_rel = safe_relative(&info.venv_python_rel)?;
    if !valid_python_version(&info.python_version) {
        return Err(format!("invalid Python version: {}", info.python_version));
    }
    Ok(ValidatedEnv {
        pixi: false,
        lock,
        venv_home,
        venv_python_rel,
    })
}

/// Whether `id` is a plugin's id: a lower-case letter or digit, then up to
/// 39 more of those or hyphens - as the manifest's reader takes it
/// (src/lib/plugins/manifest.ts `isId`).
pub(crate) fn plugin_id_ok(id: &str) -> bool {
    let mut chars = id.chars();
    let first = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit();
    id.len() <= 40 && chars.next().is_some_and(first) && chars.all(|c| first(c) || c == '-')
}

/// A plugin's file, in its folder of its own among the plugins Meno
/// carries: `resources/plugins/<id>/<file>`. Its id and the file's name.
fn plugin_file(path: &Path) -> Option<(String, String)> {
    let parts: Vec<String> = path.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    match parts.as_slice() {
        [r, p, id, file] if r == "resources" && p == "plugins" && plugin_id_ok(id) && !file.is_empty() => Some((id.clone(), file.clone())),
        _ => None,
    }
}

/// Where a plugin's worker runs: a script in the plugins' folders must be a
/// plugin's `worker.py`, run by the interpreter of that plugin's own
/// environment - `uv/plugin-<id>/venv` or `pixi/plugin-<id>` in the app
/// data (`data`) - never another plugin's. All paths canonical; a script
/// elsewhere (Meno's own workers) is not a plugin's, and fits.
fn plugin_worker_fits(script: &Path, entry_dir: &Path, plugins_root: &Path, data: &Path) -> Result<(), String> {
    let Ok(rel) = script.strip_prefix(plugins_root) else {
        return Ok(());
    };
    let parts: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    let id = match parts.as_slice() {
        [id, file] if plugin_id_ok(id) && file == "worker.py" => id,
        _ => return Err("a plugin's sidecar must be its worker.py".into()),
    };
    let homes = [data.join("uv").join(format!("plugin-{id}")), data.join("pixi").join(format!("plugin-{id}"))];
    if homes.iter().filter_map(|h| h.canonicalize().ok()).any(|h| entry_dir.starts_with(h)) {
        Ok(())
    } else {
        Err(format!("{id}'s worker runs only in {id}'s own environment"))
    }
}

/// A pixi environment's paths: its lock must be a plugin's
/// `resources/plugins/<id>/pixi.lock` (its manifest beside it), its home
/// `pixi/plugin-<id>` in the app data, and its interpreter where pixi puts it.
fn validate_pixi_env(info: &PyEnvInfo) -> Result<ValidatedEnv, String> {
    let lock = safe_relative(&info.lock_path)?;
    let id = match plugin_file(&lock) {
        Some((id, file)) if file == "pixi.lock" => id,
        _ => return Err(format!("unexpected lock file: {}", info.lock_path)),
    };
    let venv_home = safe_relative(&info.venv_home)?;
    if venv_home != Path::new("pixi").join(format!("plugin-{id}")) {
        return Err(format!("unexpected environment location: {}", info.venv_home));
    }
    let venv_python_rel = safe_relative(&info.venv_python_rel)?;
    let python_ok = [Path::new(".pixi/envs/default/bin/python"), Path::new(".pixi/envs/default/python.exe")]
        .iter()
        .any(|p| venv_python_rel == p.components().collect::<PathBuf>());
    if !python_ok {
        return Err(format!("unexpected interpreter: {}", info.venv_python_rel));
    }
    Ok(ValidatedEnv {
        pixi: true,
        lock,
        venv_home,
        venv_python_rel,
    })
}

/// Check a sidecar request: `entry` must be a Python interpreter inside
/// `venv_root`, and `args` must be allowed interpreter flags followed by a
/// `.py` script inside one of `workers_roots` - Meno's own workers, or the
/// plugins' folders (arguments after the script are passed to it
/// untouched). The roots must already be canonical. Returns the script's
/// directory, used as the working directory.
fn validate_sidecar(
    entry: &Path,
    args: &[String],
    venv_root: &Path,
    workers_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    let name = entry.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !entry.is_absolute() || !PYTHON_NAMES.contains(&name) {
        return Err("sidecar entry must be a Python interpreter path".into());
    }
    // Canonicalize the directory, not the file: a venv's bin/python is
    // usually a symlink to the base interpreter outside the venv.
    let entry_dir = entry
        .parent()
        .ok_or("sidecar entry has no parent directory")?
        .canonicalize()
        .map_err(|e| format!("sidecar entry: {e}"))?;
    if !entry_dir.starts_with(venv_root) {
        return Err("sidecar entry must be inside the app's Python environments".into());
    }

    let script = args
        .iter()
        .find(|a| !PYTHON_FLAGS.contains(&a.as_str()))
        .ok_or("sidecar needs a worker script")?;
    let script = Path::new(script);
    let is_py = script.extension().and_then(|e| e.to_str()) == Some("py");
    if !script.is_absolute() || !is_py {
        return Err("sidecar script must be an absolute path to a .py file".into());
    }
    let canonical = script
        .canonicalize()
        .map_err(|e| format!("sidecar script: {e}"))?;
    if !workers_roots.iter().any(|r| canonical.starts_with(r)) {
        return Err("sidecar script must be one of the bundled workers".into());
    }
    script
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "sidecar script has no parent directory".into())
}

/// The file name of the worker script a sidecar runs.
fn worker_name(args: &[String]) -> Option<&str> {
    let script = args.iter().find(|a| !PYTHON_FLAGS.contains(&a.as_str()))?;
    Path::new(script).file_name()?.to_str()
}

fn resource_path(app: &AppHandle, rel: &Path) -> Result<PathBuf, String> {
    app.path()
        .resolve(rel, BaseDirectory::Resource)
        .map_err(|e| format!("resolve resource {}: {e}", rel.display()))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn no_window(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn no_window(_cmd: &mut Command) {}

/// The folder a plugin's environment lives in - `uv/plugin-<id>`, its `venv`
/// within, or pixi's `pixi/plugin-<id>` - and nothing else: Meno's own
/// environments are not taken away from Settings.
fn plugin_env_dir(venv_home: &Path) -> Result<PathBuf, String> {
    let parts: Vec<String> = venv_home
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    let plugin = |name: &str| {
        name.len() > "plugin-".len() && name.starts_with("plugin-") && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    };
    match parts.as_slice() {
        [uv, name, venv] if uv == "uv" && venv == "venv" && plugin(name) => Ok(Path::new("uv").join(name)),
        [pixi, name] if pixi == "pixi" && plugin(name) => Ok(Path::new("pixi").join(name)),
        _ => Err(format!("not a plugin's environment: {}", venv_home.display())),
    }
}

/// A plugin's record of being set up, beside the others' of its maker:
/// `uv/stamps/plugin-<id>.json`, or `pixi/stamps/...`, for the folder
/// `plugin_env_dir` gives.
fn plugin_stamp(dir: &Path) -> Result<PathBuf, String> {
    let name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("not a plugin's environment: {}", dir.display()))?;
    let maker = dir.components().next().map(|c| c.as_os_str().to_owned()).unwrap_or_default();
    Ok(Path::new(&maker).join("stamps").join(format!("{name}.json")))
}

/// Takes a plugin's environment away, and its record of being set
/// up, when it is removed in Settings, Plugins - and, with the
/// last of pixi's, what pixi keeps for them. Its worker is stopped first,
/// by the app.
#[tauri::command]
async fn py_env_remove(app: AppHandle, payload: PyEnvInfo) -> Result<(), String> {
    let env = validate_env_info(&payload)?;
    let data = app_data_dir(&app)?;
    let rel = plugin_env_dir(&env.venv_home)?;
    let dir = data.join(&rel);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("removing {}: {e}", dir.display()))?;
    }
    let stamp = data.join(plugin_stamp(&rel)?);
    if stamp.exists() {
        std::fs::remove_file(&stamp).map_err(|e| format!("removing {}: {e}", stamp.display()))?;
    }
    if env.pixi {
        // (the environment is gone either way: a cache not taken away is
        // only room not given back, and pixi finds it again if needed)
        for kept in pixienv::unused_keeping(&data.join("pixi")) {
            let _ = std::fs::remove_dir_all(kept);
        }
    }
    Ok(())
}

#[tauri::command]
async fn py_env_python_path_uv(app: AppHandle, payload: PyEnvInfo) -> Result<String, String> {
    let env = validate_env_info(&payload)?;
    let venv = app_data_dir(&app)?
        .join(&env.venv_home)
        .join(&env.venv_python_rel);
    Ok(venv.to_string_lossy().into_owned())
}

/// A command running uv (`tools::ensure`), with everything it keeps - the Python
/// it downloads, its cache - under the app's own data directory rather than
/// the user's, and deaf to any uv settings of the user's: Meno's environments
/// are Meno's, and removing the app's data removes them.
fn uv_command(uv: &Path, data: &Path) -> Command {
    let mut cmd = Command::new(uv);
    cmd.env("UV_PYTHON_INSTALL_DIR", data.join("uv").join("python"))
        .env("UV_CACHE_DIR", data.join("uv").join("cache"))
        .env("UV_PYTHON_PREFERENCE", "only-managed")
        .env("UV_NO_CONFIG", "1");
    cmd
}

/// `uv venv` for a setup, made afresh over whatever is there. A setup runs
/// when the environment is missing or its lock has changed, and uv will not
/// make one over an environment already there unless told to replace it: a
/// changed lock otherwise left Meno without its Python for good.
fn uv_venv_command(uv: &Path, data: &Path, venv_dir: &Path, python: &str) -> Command {
    let mut cmd = uv_command(uv, data);
    cmd.arg("venv")
        .arg(venv_dir)
        .arg("--python")
        .arg(python)
        .arg("--clear");
    cmd
}

#[tauri::command]
async fn py_env_setup_uv(
    app: AppHandle,
    payload: PyEnvInfo,
    net: State<'_, net::Net>,
) -> Result<(), String> {
    let env = validate_env_info(&payload)?;
    // uv downloads Python and the packages: a task of its own on the
    // network, refused offline or unless its purpose has been allowed
    let label = if payload.label.is_empty() {
        "Setting up Python".to_string()
    } else {
        payload.label.clone()
    };
    let task = net.begin(&setup_purpose(&payload)?, &label)?;
    let lock = resource_path(&app, &env.lock)?;
    let data = app_data_dir(&app)?;
    // (uv itself, the first time: under the same task, the same consent)
    let uv = tools::ensure(&data, tools::Tool::Uv, task.proxy_url()).await?;
    let venv_dir = data.join(&env.venv_home);
    std::fs::create_dir_all(&venv_dir).map_err(|e| e.to_string())?;

    // 1) uv venv <venv_dir> --python <version> --clear
    let mut cmd1 = uv_venv_command(&uv, &data, &venv_dir, &payload.python_version);
    cmd1.stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut cmd1);
    task.route(&mut cmd1);
    let mut child1 = cmd1.spawn().map_err(|e| format!("spawn uv venv: {}", e))?;
    pipe_logs(&app, child1.stdout.take().unwrap(), "uv:log");
    pipe_logs(&app, child1.stderr.take().unwrap(), "uv:err");
    let st1 = child1.wait().map_err(|e| e.to_string())?;
    if !st1.success() {
        return Err("uv venv failed".into());
    }

    // 2) uv pip install --python <venv_py> -r requirements.lock --upgrade --no-deps
    let venv_py = venv_dir.join(&env.venv_python_rel);
    let mut cmd2 = uv_command(&uv, &data);
    cmd2.arg("pip")
        .arg("install")
        .arg("--python")
        .arg(&venv_py)
        .arg("-r")
        .arg(&lock)
        .arg("--upgrade")
        .arg("--no-deps")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // A lock with hashes is installed with every file checked against them.
    let lock_text = std::fs::read_to_string(&lock).map_err(|e| format!("read lock: {e}"))?;
    if lock_is_hashed(&lock_text) {
        cmd2.arg("--require-hashes");
    }
    no_window(&mut cmd2);
    task.route(&mut cmd2);
    let mut child2 = cmd2.spawn().map_err(|e| format!("spawn uv pip: {}", e))?;
    pipe_logs(&app, child2.stdout.take().unwrap(), "uv:log");
    pipe_logs(&app, child2.stderr.take().unwrap(), "uv:err");
    let st2 = child2.wait().map_err(|e| e.to_string())?;
    if !st2.success() {
        return Err("uv pip install failed".into());
    }
    task.finish(true);
    Ok(())
}

/// Makes a pixi environment (pixienv.rs): pixi itself first, where it is
/// not here; the manifest and lock Meno carries copied into its folder;
/// `pixi install` from the lock as it is; and what activation sets, kept.
#[tauri::command]
async fn py_env_setup_pixi(app: AppHandle, payload: PyEnvInfo, net: State<'_, net::Net>) -> Result<(), String> {
    let env = validate_env_info(&payload)?;
    if !env.pixi {
        return Err("not a pixi environment".into());
    }
    let label = if payload.label.is_empty() { "Setting up Python".to_string() } else { payload.label.clone() };
    let task = net.begin(&setup_purpose(&payload)?, &label)?;
    let data = app_data_dir(&app)?;
    let lock = resource_path(&app, &env.lock)?;
    let manifest_from = lock.with_file_name("pixi.toml");
    let dir = data.join(&env.venv_home);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::copy(&manifest_from, dir.join("pixi.toml")).map_err(|e| format!("copying the manifest: {e}"))?;
    std::fs::copy(&lock, dir.join("pixi.lock")).map_err(|e| format!("copying the lock: {e}"))?;
    let manifest = dir.join("pixi.toml");
    // (pixi itself, the first time: under the same task, the same consent)
    let pixi = tools::ensure(&data, tools::Tool::Pixi, task.proxy_url()).await?;

    let mut install = pixienv::install_command(&pixi, &data, &manifest);
    install.stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut install);
    task.route(&mut install);
    let mut child = install.spawn().map_err(|e| format!("spawn pixi install: {e}"))?;
    pipe_logs(&app, child.stdout.take().unwrap(), "uv:log");
    pipe_logs(&app, child.stderr.take().unwrap(), "uv:err");
    if !child.wait().map_err(|e| e.to_string())?.success() {
        return Err("pixi install failed".into());
    }

    let mut hook = pixienv::activation_command(&pixi, &data, &manifest);
    no_window(&mut hook);
    task.route(&mut hook);
    let out = hook.output().map_err(|e| format!("spawn pixi shell-hook: {e}"))?;
    if !out.status.success() {
        for line in String::from_utf8_lossy(&out.stderr).lines() {
            let _ = app.emit("uv:err", line.to_string());
        }
        return Err("pixi shell-hook failed".into());
    }
    let activation = pixienv::read_activation(&String::from_utf8_lossy(&out.stdout))?;
    let text = serde_json::to_string_pretty(&activation).map_err(|e| e.to_string())?;
    std::fs::write(pixienv::activation_path(&dir), text).map_err(|e| format!("keeping the activation: {e}"))?;
    task.finish(true);
    Ok(())
}

// Pipe stdout/stderr from child processes to Tauri events. Reading is
// blocking, so it runs on a dedicated OS thread rather than an async worker
// (which it would otherwise tie up for the lifetime of the child).
fn pipe_logs<R: Read + Send + 'static>(app: &AppHandle, stream: R, ch: &'static str) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        for s in BufReader::new(stream).lines().map_while(Result::ok) {
            let _ = app2.emit(ch, s);
        }
    });
}

// Python sidecar: spawn process and handle IO

type Procs = HashMap<String, (Child, Option<ChildStdin>)>;

struct ProcState(Mutex<Procs>);

impl ProcState {
    /// Lock the process table. A panic while the lock was held cannot leave
    /// the map inconsistent, so recover from poisoning instead of panicking
    /// on every later call.
    fn lock(&self) -> MutexGuard<'_, Procs> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Remove a sidecar, kill it if it is still running and wait for it so
    /// no process handle is leaked. Returns false if it was already gone.
    fn reap(&self, id: &str) -> bool {
        let entry = self.lock().remove(id);
        match entry {
            Some((mut child, stdin)) => {
                drop(stdin);
                let _ = child.kill();
                let _ = child.wait();
                true
            }
            None => false,
        }
    }

    fn kill_all(&self) {
        let all: Vec<_> = self.lock().drain().collect();
        for (_, (mut child, _)) in all {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Serialize, Deserialize)]
struct SpawnArgs {
    entry: String,
    args: Vec<String>,
}

#[tauri::command]
async fn ext_spawn_sidecar(
    app: AppHandle,
    payload: SpawnArgs,
    state: State<'_, ProcState>,
    net: State<'_, net::Net>,
) -> Result<String, String> {
    // (an interpreter of uv's environments, or of pixi's)
    let data = app_data_dir(&app)?;
    let roots: Vec<PathBuf> = ["uv", "pixi"].iter().filter_map(|r| data.join(r).canonicalize().ok()).collect();
    if roots.is_empty() {
        return Err("the Python environment is not set up".to_string());
    }
    // (Meno's own workers, and the plugins' - each in its folder)
    let workers_roots: Vec<PathBuf> = ["resources/workers", "resources/plugins"]
        .iter()
        .filter_map(|r| resource_path(&app, Path::new(r)).ok()?.canonicalize().ok())
        .collect();
    if workers_roots.is_empty() {
        return Err("no worker directory".to_string());
    }
    let entry = PathBuf::from(&payload.entry);
    let (cwd, root) = roots
        .iter()
        .find_map(|root| validate_sidecar(&entry, &payload.args, root, &workers_roots).ok().map(|cwd| (cwd, root.clone())))
        .ok_or_else(|| validate_sidecar(&entry, &payload.args, &roots[0], &workers_roots).err().unwrap_or_default())?;
    // (a plugin's worker, in its own environment)
    if let (Some(plugins), Some(script), Some(dir)) = (
        resource_path(&app, Path::new("resources/plugins")).ok().and_then(|p| p.canonicalize().ok()),
        payload.args.iter().find(|a| !PYTHON_FLAGS.contains(&a.as_str())).and_then(|s| Path::new(s).canonicalize().ok()),
        entry.parent().and_then(|p| p.canonicalize().ok()),
    ) {
        plugin_worker_fits(&script, &dir, &plugins, &data.canonicalize().map_err(|e| e.to_string())?)?;
    }

    let mut cmd = Command::new(&entry);
    cmd.args(&payload.args).current_dir(cwd);
    no_window(&mut cmd);
    // a pixi environment's worker, activated as the environment was made to be
    if root.file_name().and_then(|n| n.to_str()) == Some("pixi") {
        let dir = entry.parent().and_then(|p| p.canonicalize().ok()).and_then(|p| pixienv::env_dir_of(&p, &root));
        let kept = dir.and_then(|d| std::fs::read_to_string(pixienv::activation_path(&d)).ok());
        if let Some(activation) = kept.and_then(|t| serde_json::from_str::<pixienv::Activation>(&t).ok()) {
            pixienv::activate(&mut cmd, &activation);
        }
    }
    // Whatever the code run in the console reaches for goes through the
    // proxy, seen and logged, as a task that lasts as long as the sidecar.
    // The other workers run no one's code and need no network; nor may the
    // console while Meno is offline. Those are pointed at the proxy with no
    // task, so an attempt is refused and on the record - never left to go
    // out on its own.
    let console = worker_name(&payload.args) == Some("interactive_worker.py");
    let task = net.route_sidecar(&mut cmd, console);
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    let stdin = child.stdin.take();
    // Register before the reader threads start so an immediate exit can be
    // reaped.
    state.lock().insert(id.clone(), (child, stdin));

    // stdout -> ext:stdout; EOF means the sidecar is gone: reap it, then
    // announce the exit (unless ext_kill already did).
    {
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            for s in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app2.emit(
                    "ext:stdout",
                    serde_json::json!({"id": id2, "line": s}).to_string(),
                );
            }
            if app2.state::<ProcState>().reap(&id2) {
                let _ = app2.emit("ext:exit", serde_json::json!({"id": id2}).to_string());
            }
            // the sidecar's time on the network ends with it
            if let Some(task) = task {
                task.finish(true);
            }
        });
    }

    // stderr -> ext:stderr
    {
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            for s in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app2.emit(
                    "ext:stderr",
                    serde_json::json!({"id": id2, "line": s}).to_string(),
                );
            }
        });
    }

    Ok(id)
}

#[tauri::command]
async fn ext_stdin(id: String, data: String, state: State<'_, ProcState>) -> Result<(), String> {
    if let Some((_child, optin)) = state.lock().get_mut(&id) {
        if let Some(stdin) = optin {
            stdin
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("no stdin".into())
        }
    } else {
        Err("not found".into())
    }
}

#[tauri::command]
async fn ext_kill(app: AppHandle, id: String, state: State<'_, ProcState>) -> Result<(), String> {
    if state.reap(&id) {
        let _ = app.emit("ext:exit", serde_json::json!({"id": id}).to_string());
    }
    Ok(())
}

/// Structures Office has asked to have opened since the page last looked
/// (Windows: see ole.rs; nothing elsewhere).
#[tauri::command]
fn ole_take_pending() -> serde_json::Value {
    #[cfg(windows)]
    return serde_json::to_value(ole::take_pending()).unwrap_or_default();
    #[cfg(not(windows))]
    serde_json::Value::Array(Vec::new())
}

/// A structure open from a document, drawn afresh: the document takes it.
#[tauri::command]
fn ole_update(id: u32, record: String, emf: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let emf = STANDARD.decode(emf).map_err(|e| e.to_string())?;
        ole::update(id, record, emf)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, record, emf);
        Err("documents hold structures only on Windows".into())
    }
}

/// Whether Windows started this Meno for Office, so that it goes again once
/// the document is done with it and nothing else is open.
#[tauri::command]
fn ole_started_for_office() -> bool {
    #[cfg(windows)]
    return ole::started_for_office();
    #[cfg(not(windows))]
    false
}

/// A drag from another program, not of files, has come over a part of the
/// page that takes such drags: on Windows, Meno takes it from the webview
/// there, as the webview cannot read what Office drags (drop.rs), and tells
/// the page where it goes ("native-drag").
/// Whether this platform does so - a Mac's page reads drags as they are.
#[tauri::command]
fn drop_catch(app: AppHandle, x: f64, y: f64, width: f64, height: f64) -> bool {
    #[cfg(windows)]
    {
        let area = drop::Area { x, y, width, height };
        // (on the window's own thread: it is that thread's windows OLE
        // hands drags to)
        let _ = app.run_on_main_thread(move || {
            if let Err(e) = drop::catch(area) {
                eprintln!("drags cannot be taken from the page: {e}");
            }
        });
        true
    }
    #[cfg(not(windows))]
    {
        let _ = (app, x, y, width, height);
        false
    }
}

/// The drag has ended where the page could read it: Meno's window over the
/// page, if it laid one, goes.
#[tauri::command]
fn drop_release(app: AppHandle) {
    #[cfg(windows)]
    let _ = app.run_on_main_thread(drop::release);
    #[cfg(not(windows))]
    let _ = app;
}

/// Whether the page takes a drag Meno took from it, where it now is.
#[tauri::command]
fn drop_takes(takes: bool) {
    #[cfg(windows)]
    drop::takes(takes);
    #[cfg(not(windows))]
    let _ = takes;
}

/// Whether Office still holds any of this Meno's structures (Windows).
#[tauri::command]
fn ole_in_use() -> bool {
    #[cfg(windows)]
    return ole::in_use();
    #[cfg(not(windows))]
    false
}

/// A structure open from a document is done with: its tab has closed.
#[tauri::command]
fn ole_close(id: u32) -> Result<(), String> {
    #[cfg(windows)]
    return ole::close(id);
    #[cfg(not(windows))]
    {
        let _ = id;
        Ok(())
    }
}

/// `--register-ole` and `--unregister-ole`, which the installer runs: the
/// class Office finds Meno's structures by, written or taken out, and then
/// nothing else. Whether it worked is the exit code.
#[cfg(windows)]
fn registration_asked() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    let done = |r: Result<(), String>| match r {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    };
    if args.iter().any(|a| a == "--register-ole") {
        let exe = std::env::current_exe().map_err(|e| e.to_string());
        return Some(done(exe.and_then(|p| ole::register(&p.to_string_lossy()))));
    }
    if args.iter().any(|a| a == "--unregister-ole") {
        return Some(done(ole::unregister()));
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // started to run a job (jobs.rs): that, apart from Meno, and nothing else
    if let Some(code) = jobs::job_mode() {
        std::process::exit(code);
    }
    // started as the PDF reader (pdf.rs): that, apart from Meno
    if let Some(code) = pdf::pdf_mode() {
        std::process::exit(code);
    }
    #[cfg(windows)]
    if let Some(code) = registration_asked() {
        std::process::exit(code);
    }
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    // A Meno Windows starts for Office opens unseen: it shows itself when a
    // structure opens in it (ole.rs), and one started only for a picture
    // goes again without having been seen.
    #[cfg(windows)]
    if ole::started_for_office() {
        for window in &mut context.config_mut().app.windows {
            window.visible = false;
        }
    }
    let version = context.package_info().version.to_string();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // keeping Meno up to date, through Meno's network (update.rs)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ProcState(Mutex::new(HashMap::new())))
        .manage(net::Net::default())
        .manage(pdf::PdfState::default())
        .manage(update::Updates::new(version))
        .setup(|app| {
            net::start(app.handle());
            // drags from other programs the webview cannot read (Windows)
            #[cfg(windows)]
            drop::start(app.handle());
            // structures in Office documents, opened here on a double-click
            #[cfg(windows)]
            ole::start(app.handle());
            // the installers updates left in the temporary folder (Windows)
            #[cfg(windows)]
            update::tidy_after_updates(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pdf::pdf_hold_path,
            pdf::pdf_hold_bytes,
            pdf::pdf_bytes,
            pdf::pdf_render,
            pdf::pdf_links,
            pdf::pdf_text,
            pdf::pdf_objects,
            // the system clipboard, for structures
            clipboard::clipboard_write,
            clipboard::clipboard_read,
            clipboard::clipboard_takes,
            clipboard::drag_read,
            // drags the page cannot read, taken from the webview (Windows)
            drop_catch,
            drop_release,
            drop_takes,
            // structures in Office documents (Windows)
            ole_take_pending,
            ole_update,
            ole_close,
            ole_started_for_office,
            ole_in_use,
            // the system's fonts, for atom labels
            fonts::font_families,
            fonts::font_file,
            // uv + env
            py_env_python_path_uv,
            py_env_setup_uv,
            py_env_setup_pixi,
            py_env_remove,
            // the network: what goes out, and whether it may
            net::net_state,
            net::net_set_offline,
            net::net_grant,
            net::net_revoke,
            net::net_note_blocked,
            // keeping Meno up to date
            update::update_state,
            update::update_check,
            update::update_restart_after_quit,
            // python sidecar
            ext_spawn_sidecar,
            ext_stdin,
            ext_kill,
            // jobs: programs run for a workflow's steps, apart from Meno
            jobs::job_start,
            jobs::program_where,
            jobs::job_state,
            jobs::jobs_list,
            jobs::job_log,
            jobs::job_files,
            jobs::job_read,
            jobs::job_folder,
            jobs::job_stop,
            jobs::job_remove,
            jobs::jobs_clear_finished
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|app, event| {
            // Don't leave Python sidecars running after the window closes.
            if let RunEvent::Exit = event {
                app.state::<ProcState>().kill_all();
                // structures open from documents go back into them, and what
                // was copied stays on the clipboard without Meno
                #[cfg(windows)]
                {
                    ole::shutdown();
                    ole::flush_clipboard();
                }
                // a newer Meno, downloaded, goes in as this one quits
                update::install_on_exit(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn tells_a_hashed_lock_and_which_worker_a_sidecar_runs() {
        assert!(lock_is_hashed("rdkit==2026.3.6 \\\n    --hash=sha256:abc\n"));
        assert!(!lock_is_hashed("numpy==2.3.2\n    # via accel\n"));
        let args = |s: &[&str]| s.iter().map(|a| a.to_string()).collect::<Vec<_>>();
        assert_eq!(worker_name(&args(&["-u", "/r/workers/chem_worker.py"])), Some("chem_worker.py"));
        assert_eq!(worker_name(&args(&["/r/workers/interactive_worker.py", "x"])), Some("interactive_worker.py"));
        assert_eq!(worker_name(&args(&["-u"])), None);
    }

    #[test]
    fn a_setup_downloads_only_under_a_python_environments_purpose() {
        let mut info = env_info("resources/py/requirements.lock", "uv/console/venv", "3.12");
        assert_eq!(setup_purpose(&info).as_deref(), Ok("python-env:console"));
        // not the user's own code, which needs no asking, nor anything else
        for bad in ["python-code", "python-env:", "python-env:a b", "anything"] {
            info.purpose = bad.into();
            assert!(setup_purpose(&info).is_err(), "{bad}");
        }
    }

    #[test]
    fn uv_keeps_its_python_and_cache_under_the_app_data() {
        let data = Path::new("/data/Meno");
        let cmd = uv_command(Path::new("/app/uv"), data);
        let envs: HashMap<_, _> = cmd
            .get_envs()
            .map(|(k, v)| (k.to_owned(), v.map(|v| v.to_owned())))
            .collect();
        let get = |k: &str| envs.get(std::ffi::OsStr::new(k)).cloned().flatten();
        let under = |leaf: &str| Some(data.join("uv").join(leaf).into_os_string());
        assert_eq!(get("UV_PYTHON_INSTALL_DIR"), under("python"));
        assert_eq!(get("UV_CACHE_DIR"), under("cache"));
        assert_eq!(get("UV_PYTHON_PREFERENCE"), Some("only-managed".into()));
        assert_eq!(get("UV_NO_CONFIG"), Some("1".into()));
    }

    #[test]
    fn a_setup_makes_its_environment_afresh_over_one_already_there() {
        let venv = Path::new("/data/Meno/uv/chem/venv");
        let cmd = uv_venv_command(Path::new("/app/uv"), Path::new("/data/Meno"), venv, "3.12");
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["venv", "/data/Meno/uv/chem/venv", "--python", "3.12", "--clear"]);
    }

    fn env_info(lock: &str, venv: &str, py: &str) -> PyEnvInfo {
        PyEnvInfo {
            _os: String::new(),
            lock_path: lock.into(),
            venv_home: venv.into(),
            venv_python_rel: if cfg!(windows) {
                "Scripts/python.exe".into()
            } else {
                "bin/python".into()
            },
            _stamp_path: String::new(),
            python_version: py.into(),
            purpose: "python-env:console".into(),
            label: String::new(),
            host: String::new(),
        }
    }

    fn pixi_info(lock: &str, home: &str, python: &str) -> PyEnvInfo {
        PyEnvInfo {
            lock_path: lock.into(),
            venv_home: home.into(),
            venv_python_rel: python.into(),
            purpose: "python-env:plugin-pyscf".into(),
            host: "pixi".into(),
            ..env_info(LOCK, "uv/console/venv", "3.12")
        }
    }

    #[test]
    fn a_pixi_environment_is_one_meno_carries_the_lock_of_made_in_the_app_data() {
        let env = validate_env_info(&pixi_info("resources/plugins/pyscf/pixi.lock", "pixi/plugin-pyscf", ".pixi/envs/default/bin/python")).unwrap();
        assert!(env.pixi);
        assert_eq!(env.venv_home, Path::new("pixi/plugin-pyscf"));
        assert!(validate_env_info(&pixi_info("resources/plugins/pyscf/pixi.lock", "pixi/plugin-pyscf", ".pixi/envs/default/python.exe")).is_ok());
        for (lock, home, python) in [
            ("resources/py/requirements.chem.lock", "pixi/plugin-pyscf", ".pixi/envs/default/bin/python"),
            ("resources/plugins/pyscf/pixi.toml", "pixi/plugin-pyscf", ".pixi/envs/default/bin/python"),
            ("resources/plugins/../py/pixi.lock", "pixi/plugin-pyscf", ".pixi/envs/default/bin/python"),
            ("resources/plugins/pyscf/x/pixi.lock", "pixi/plugin-pyscf", ".pixi/envs/default/bin/python"),
            ("resources/plugins/PySCF/pixi.lock", "pixi/plugin-PySCF", ".pixi/envs/default/bin/python"),
            ("resources/plugins/pyscf/pixi.lock", "pixi/pyscf", ".pixi/envs/default/bin/python"),
            ("resources/plugins/pyscf/pixi.lock", "pixi/plugin-other", ".pixi/envs/default/bin/python"),
            ("resources/plugins/pyscf/pixi.lock", "uv/plugin-pyscf", ".pixi/envs/default/bin/python"),
            ("resources/plugins/pyscf/pixi.lock", "pixi/plugin-pyscf", "bin/sh"),
        ] {
            assert!(validate_env_info(&pixi_info(lock, home, python)).is_err(), "{lock} {home} {python}");
        }
        let mut odd = env_info(LOCK, "uv/console/venv", "3.12");
        odd.host = "conda".into();
        assert!(validate_env_info(&odd).is_err());
    }

    const LOCK: &str = "resources/py/requirements.console.lock";

    #[test]
    fn only_a_plugins_environment_is_taken_away() {
        assert_eq!(plugin_env_dir(Path::new("uv/plugin-cclib/venv")), Ok(PathBuf::from("uv/plugin-cclib")));
        assert_eq!(plugin_stamp(Path::new("uv/plugin-cclib")), Ok(PathBuf::from("uv/stamps/plugin-cclib.json")));
        assert_eq!(plugin_env_dir(Path::new("pixi/plugin-pyscf")), Ok(PathBuf::from("pixi/plugin-pyscf")));
        assert_eq!(plugin_stamp(Path::new("pixi/plugin-pyscf")), Ok(PathBuf::from("pixi/stamps/plugin-pyscf.json")));
        for bad in ["pixi/cache", "pixi/home", "pixi/plugin-pyscf/.pixi", "pixi"] {
            assert!(plugin_env_dir(Path::new(bad)).is_err(), "{bad}");
        }
        for bad in ["uv/chem/venv", "uv/console/venv", "uv/plugin-/venv", "uv/plugin-cclib", "uv/plugin-cclib/venv/bin", "uv/plugin-a b/venv", "data/plugin-cclib/venv"] {
            assert!(plugin_env_dir(Path::new(bad)).is_err(), "{bad}");
        }
    }

    #[test]
    fn safe_relative_rejects_escapes() {
        assert!(safe_relative("uv/console/venv").is_ok());
        for bad in ["", "../x", "uv/../../x", "./x", "/etc/passwd"] {
            assert!(safe_relative(bad).is_err(), "{bad} should be rejected");
        }
        if cfg!(windows) {
            for bad in [
                r"C:\Windows\System32\cmd.exe",
                r"uv\..\..\x",
                r"\\server\share",
            ] {
                assert!(safe_relative(bad).is_err(), "{bad} should be rejected");
            }
        }
    }

    #[test]
    fn python_version_format() {
        assert!(valid_python_version("3.12"));
        assert!(valid_python_version("3.12.4"));
        for bad in ["", "3.", ".12", "3.12; rm -rf /", "latest", "3..12"] {
            assert!(!valid_python_version(bad), "{bad} should be rejected");
        }
    }

    #[test]
    fn env_info_accepts_the_frontend_payload() {
        let env = validate_env_info(&env_info(LOCK, "uv/console/venv", "3.12"))
            .expect("frontend payload must validate");
        assert_eq!(env.venv_home, Path::new("uv/console/venv"));
        assert!(validate_env_info(&env_info(
            "resources/py/requirements.lock",
            "uv/node/venv",
            "3.12"
        ))
        .is_ok());
        // a plugin's, from its folder
        assert!(validate_env_info(&env_info("resources/plugins/cclib/requirements.lock", "uv/plugin-cclib/venv", "3.12")).is_ok());
    }

    #[test]
    fn a_plugin_is_known_by_an_id_the_manifest_reader_takes() {
        for good in ["cclib", "rdkit", "getting-started", "a", "x1", &"x".repeat(40)] {
            assert!(plugin_id_ok(good), "{good}");
        }
        for bad in ["", "-x", "RDKit", "x_y", "x.y", "x/y", &"x".repeat(41)] {
            assert!(!plugin_id_ok(bad), "{bad}");
        }
    }

    #[test]
    fn env_info_rejects_foreign_paths() {
        let cases = [
            env_info("resources/py/notes.txt", "uv/console/venv", "3.12"),
            env_info("resources/plugins/cclib/manifest.json", "uv/plugin-cclib/venv", "3.12"),
            env_info("resources/plugins/cclib/x/requirements.lock", "uv/plugin-cclib/venv", "3.12"),
            env_info("resources/workers/requirements.lock", "uv/console/venv", "3.12"),
            // a plugin's lock is its requirements.lock, made into its own environment
            env_info("resources/plugins/cclib/other.lock", "uv/plugin-cclib/venv", "3.12"),
            env_info("resources/plugins/cclib/requirements.lock", "uv/plugin-pyscf/venv", "3.12"),
            env_info("resources/plugins/cclib/requirements.lock", "uv/console/venv", "3.12"),
            env_info("resources/plugins/CClib/requirements.lock", "uv/plugin-CClib/venv", "3.12"),
            env_info("../outside.lock", "uv/console/venv", "3.12"),
            env_info(LOCK, "../../elsewhere", "3.12"),
            env_info(LOCK, "uv", "3.12"),
            env_info(LOCK, "other/venv", "3.12"),
            env_info(LOCK, "uv/console/venv", "3.12 --index-url x"),
        ];
        for info in &cases {
            assert!(
                validate_env_info(info).is_err(),
                "should reject lock={} venv={} py={}",
                info.lock_path,
                info.venv_home,
                info.python_version
            );
        }
    }

    /// Temporary tree: <root>/uv/console/venv/<bin>/python, <root>/workers/w.py,
    /// a plugin's <root>/plugins/p/worker.py, and look-alikes outside the roots.
    struct Sandbox {
        root: PathBuf,
    }

    impl Sandbox {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("meno-test-{}", Uuid::new_v4()));
            let bin = if cfg!(windows) { "Scripts" } else { "bin" };
            for dir in [
                format!("uv/console/venv/{bin}"),
                "workers".into(),
                "plugins/p".into(),
                "outside".into(),
            ] {
                fs::create_dir_all(root.join(dir)).unwrap();
            }
            for file in [
                format!("uv/console/venv/{bin}/python"),
                format!("uv/console/venv/{bin}/cmd.exe"),
                "workers/w.py".into(),
                "plugins/p/worker.py".into(),
                "outside/python".into(),
                "outside/evil.py".into(),
            ] {
                fs::write(root.join(file), "").unwrap();
            }
            Sandbox {
                root: root.canonicalize().unwrap(),
            }
        }

        fn p(&self, rel: &str) -> PathBuf {
            self.root.join(rel)
        }

        fn python(&self) -> PathBuf {
            self.p(if cfg!(windows) {
                "uv/console/venv/Scripts/python"
            } else {
                "uv/console/venv/bin/python"
            })
        }

        fn check(&self, entry: &Path, args: &[&str]) -> Result<PathBuf, String> {
            let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
            validate_sidecar(entry, &args, &self.p("uv"), &[self.p("workers"), self.p("plugins")])
        }
    }

    impl Drop for Sandbox {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn sidecar_accepts_venv_python_on_bundled_worker() {
        let sb = Sandbox::new();
        let worker = sb.p("workers/w.py");
        let worker = worker.to_str().unwrap();
        let cwd = sb.check(&sb.python(), &["-u", worker, "--script-arg"]);
        assert_eq!(cwd, Ok(sb.p("workers")));
        // a plugin's, in its folder
        let plugin = sb.p("plugins/p/worker.py");
        assert_eq!(sb.check(&sb.python(), &["-u", plugin.to_str().unwrap()]), Ok(sb.p("plugins/p")));
    }

    #[test]
    fn sidecar_rejects_other_executables_and_scripts() {
        let sb = Sandbox::new();
        let worker = sb.p("workers/w.py");
        let worker = worker.to_str().unwrap();
        let evil = sb.p("outside/evil.py");
        let evil = evil.to_str().unwrap();
        let cmd = sb.python().with_file_name("cmd.exe");

        // interpreter outside the venv root, or not an interpreter at all
        assert!(sb.check(&sb.p("outside/python"), &["-u", worker]).is_err());
        assert!(sb.check(&cmd, &["-u", worker]).is_err());
        assert!(sb.check(Path::new("python"), &["-u", worker]).is_err());
        // script outside the workers root, missing, or not a script
        assert!(sb.check(&sb.python(), &["-u", evil]).is_err());
        assert!(sb.check(&sb.python(), &["-u"]).is_err());
        assert!(sb.check(&sb.python(), &["-c", "import os"]).is_err());
        assert!(sb.check(&sb.python(), &["-m", "http.server"]).is_err());
        // traversal out of the workers dir
        let traversal = sb.p("workers/../outside/evil.py");
        assert!(sb
            .check(&sb.python(), &["-u", traversal.to_str().unwrap()])
            .is_err());
    }

    #[test]
    fn a_plugins_worker_runs_in_its_own_environment_only() {
        let root = std::env::temp_dir().join(format!("meno-test-{}", Uuid::new_v4()));
        let bin = if cfg!(windows) { "Scripts" } else { "bin" };
        for dir in [format!("data/uv/plugin-p/venv/{bin}"), format!("data/uv/plugin-q/venv/{bin}"), "data/pixi/plugin-r/.pixi".into(), "plugins/p".into(), "plugins/r".into(), "workers".into()] {
            fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in ["plugins/p/worker.py", "plugins/p/other.py", "plugins/r/worker.py", "workers/w.py"] {
            fs::write(root.join(file), "").unwrap();
        }
        let root = root.canonicalize().unwrap();
        let (plugins, data) = (root.join("plugins"), root.join("data"));
        let fits = |script: &str, env: &str| plugin_worker_fits(&root.join(script), &data.join(env), &plugins, &data);
        assert!(fits("plugins/p/worker.py", &format!("uv/plugin-p/venv/{bin}")).is_ok());
        assert!(fits("plugins/r/worker.py", "pixi/plugin-r/.pixi").is_ok());
        // another plugin's environment, or another of its scripts
        assert!(fits("plugins/p/worker.py", &format!("uv/plugin-q/venv/{bin}")).is_err());
        assert!(fits("plugins/r/worker.py", &format!("uv/plugin-p/venv/{bin}")).is_err());
        assert!(fits("plugins/p/other.py", &format!("uv/plugin-p/venv/{bin}")).is_err());
        // Meno's own workers are no plugin's
        assert!(fits("workers/w.py", &format!("uv/plugin-q/venv/{bin}")).is_ok());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn reap_removes_and_reports_once() {
        let state = ProcState(Mutex::new(HashMap::new()));
        let child = if cfg!(windows) {
            Command::new("cmd").args(["/C", "exit 0"]).spawn()
        } else {
            Command::new("true").spawn()
        }
        .expect("spawn a trivial process");
        state.lock().insert("a".into(), (child, None));
        assert!(state.reap("a"));
        assert!(!state.reap("a"));
        assert!(state.lock().is_empty());
    }
}
