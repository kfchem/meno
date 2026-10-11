//! Jobs (docs/WORKFLOWS.md, *What changes in the contract*): a program run
//! for a workflow's step, on this computer, in a folder of its own - started
//! apart from Meno, so that it goes on when Meno closes - its log written
//! as it goes, and how it ended recorded.
//!
//! A job's folder, in Meno's data folder, `jobs/<id>/`:
//!
//! - `job.json` - what to run: the program, its arguments and environment,
//!   how many jobs may run at once, when it was asked for;
//! - `work/` - where it runs: its input, written there before it starts,
//!   and what it writes;
//! - `log.txt` - what it says, its output and its errors, as it goes;
//! - `state.json` - Meno's record of it: waiting, running, done, failed,
//!   stopped - or gone, where what ran it is no longer there;
//! - `runner.lock` - held for as long as its runner is there;
//! - `stop` - there once it has been asked to stop.
//!
//! Meno's own executable runs each job (`--job <folder>`, [`job_mode`]): it
//! waits its turn - jobs start in the order they were asked for, as many at
//! once as was allowed - then runs the program in a process group of its
//! own (a job object on Windows), so that a stop stops it and everything it
//! started; and it writes down how it ended. It shows nothing and needs no
//! Meno: closed, Meno leaves it running, and finds it again from its folder.
//!
//! A job runs only a program a plugin names (its manifest's `steps`, each
//! with the `programs` it needs), from that plugin's environment - Python
//! only with a script of the plugin's - and reaches no network.

use crate::pixienv;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

/// The flag that starts Meno's executable as a job's runner.
pub const JOB_FLAG: &str = "--job";

const SPEC: &str = "job.json";
const RECORD: &str = "state.json";
const LOG: &str = "log.txt";
const STOP: &str = "stop";
const RUNNER_LOCK: &str = "runner.lock";
const WORK: &str = "work";
/// Held by a runner while it looks whether it is its turn: one at a time.
const QUEUE_LOCK: &str = ".queue.lock";

/// How often a waiting job looks for its turn, and a running one at its program and for a stop.
const WAIT_STEP: Duration = Duration::from_millis(400);
const RUN_STEP: Duration = Duration::from_millis(200);
/// How long a program asked to stop has before it is made to (macOS, Linux).
const STOP_GRACE: Duration = Duration::from_secs(3);
/// How long a job may stand without a record before it is taken for gone: its runner starting.
const STARTING_MS: u64 = 30_000;
/// The most of a log read at once.
const LOG_MOST: u64 = 256 * 1024;
/// What says how many cores a program may use, to the libraries programs are built on.
const THREADS: &[&str] = &["OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"];
/// Programs a job never runs, whatever names them: shells, and interpreters
/// that take code in their arguments. (Python runs only a plugin's script.)
const NEVER: &[&str] = &[
    "sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish", "env", "cmd", "powershell", "pwsh", "perl", "ruby", "node", "osascript",
    "wscript", "cscript",
];

/// What a job is to run.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JobSpec {
    /// The plugin that asked for it, and the program, by its name and its full path.
    pub plugin: String,
    pub name: String,
    pub program: String,
    pub args: Vec<String>,
    /// A file in its folder that it reads as its input (its standard input) -
    /// Gaussian's, run as `g16 <input`; none, it reads nothing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stdin: Option<String>,
    /// What it is given beside the environment its runner was started in.
    pub env: BTreeMap<String, String>,
    /// How many jobs may run at once, as it was when this one was asked for.
    pub slots: u32,
    /// When it was asked for, in milliseconds since 1970: the order jobs start in.
    pub created: u64,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    Waiting,
    Running,
    Done,
    Failed,
    Stopped,
    /// What ran it is no longer there, and never said how it ended: the computer was restarted, say.
    Gone,
}

impl JobState {
    pub fn finished(self) -> bool {
        !matches!(self, JobState::Waiting | JobState::Running)
    }
}

/// Meno's record of a job: what state it is in, and when it got there.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JobRecord {
    pub state: JobState,
    pub created: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended: Option<u64>,
    /// The program's exit code, where it ended with one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<i32>,
    /// Why it failed, where it failed before its program could say.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
}

impl JobRecord {
    fn new(state: JobState, created: u64) -> Self {
        JobRecord { state, created, started: None, ended: None, code: None, why: None }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn read_record(dir: &Path) -> Option<JobRecord> {
    serde_json::from_str(&fs::read_to_string(dir.join(RECORD)).ok()?).ok()
}

/// A record written whole: one reading it never finds half of one.
fn write_record(dir: &Path, record: &JobRecord) -> std::io::Result<()> {
    let text = serde_json::to_string_pretty(record).map_err(std::io::Error::other)?;
    let tmp = dir.join(format!("{RECORD}.{}.tmp", std::process::id()));
    fs::write(&tmp, text)?;
    fs::rename(tmp, dir.join(RECORD))
}

fn read_spec(dir: &Path) -> Option<JobSpec> {
    serde_json::from_str(&fs::read_to_string(dir.join(SPEC)).ok()?).ok()
}

/// Whether a job's runner is there: it holds its lock for as long as it is,
/// and a runner that is gone - however it went - holds nothing.
fn runner_there(dir: &Path) -> bool {
    let Ok(lock) = OpenOptions::new().read(true).open(dir.join(RUNNER_LOCK)) else { return false };
    match lock.try_lock() {
        Ok(()) => false,
        Err(TryLockError::WouldBlock) => true,
        Err(TryLockError::Error(_)) => false,
    }
}

/// A job's record as it is now - none where its folder is not a job's (yet).
/// One whose record says it is waiting or running, but whose runner is gone,
/// is gone, and is recorded so.
pub fn current_record(dir: &Path) -> Option<JobRecord> {
    let created = read_spec(dir)?.created;
    let Some(record) = read_record(dir) else {
        // (its runner starting: waiting, for a while)
        let state = if now_ms().saturating_sub(created) < STARTING_MS { JobState::Waiting } else { JobState::Gone };
        return Some(JobRecord::new(state, created));
    };
    if record.state.finished() || runner_there(dir) {
        return Some(record);
    }
    // (read again: what it wrote last, before it went)
    let record = read_record(dir).unwrap_or(record);
    if record.state.finished() {
        return Some(record);
    }
    let gone = JobRecord { state: JobState::Gone, ended: Some(now_ms()), ..record };
    let _ = write_record(dir, &gone);
    Some(gone)
}

fn stop_asked(dir: &Path) -> bool {
    dir.join(STOP).exists()
}

/// Ask a job to stop: its runner stops its program and everything it started - or, not started yet, lets it go.
pub fn ask_stop(dir: &Path) -> std::io::Result<()> {
    fs::write(dir.join(STOP), b"")
}

/// Meno's executable started as a job's runner (`--job <folder>`): the job
/// run, and what the runner ends with. None where it was started as Meno.
pub fn job_mode() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()? != JOB_FLAG {
        return None;
    }
    let dir = PathBuf::from(args.next()?);
    Some(run_job(&dir))
}

/// Run the job in `dir`: wait for its turn, run its program, and write down how it ended.
pub fn run_job(dir: &Path) -> i32 {
    // (held until the runner goes: while it is held, the job is not gone)
    let Ok(lock) = OpenOptions::new().create(true).truncate(false).write(true).open(dir.join(RUNNER_LOCK)) else { return 1 };
    // (another runner has it - or, for a moment, one looking whether it is there)
    let held = (0..10).any(|i| {
        if i > 0 {
            std::thread::sleep(Duration::from_millis(50));
        }
        lock.try_lock().is_ok()
    });
    if !held {
        return 1;
    }
    let Some(spec) = read_spec(dir) else {
        let record = JobRecord { ended: Some(now_ms()), why: Some("what it was to run could not be read".into()), ..JobRecord::new(JobState::Failed, now_ms()) };
        let _ = write_record(dir, &record);
        return 1;
    };
    let base = JobRecord::new(JobState::Waiting, spec.created);
    let end = |state: JobState, started: Option<u64>, code: Option<i32>, why: Option<String>| {
        let _ = write_record(dir, &JobRecord { state, started, ended: Some(now_ms()), code, why, ..base.clone() });
    };
    if write_record(dir, &base).is_err() {
        return 1;
    }

    // its turn: as many running as were allowed, those asked for first first
    loop {
        if stop_asked(dir) {
            end(JobState::Stopped, None, None, None);
            return 0;
        }
        match take_turn(dir, &spec, &base) {
            Ok(true) => break,
            Ok(false) => std::thread::sleep(WAIT_STEP),
            Err(e) => {
                end(JobState::Failed, None, None, Some(format!("it could not wait its turn: {e}")));
                return 1;
            }
        }
    }
    let started = Some(now_ms());

    // its program, in its work folder, what it says going into its log
    let mut program = match spawn_program(dir, &spec) {
        Ok(p) => p,
        Err(e) => {
            end(JobState::Failed, started, None, Some(format!("{} could not be started: {e}", spec.name)));
            return 1;
        }
    };
    let mut stopping: Option<Instant> = None;
    let status = loop {
        match program.child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(_) => break None,
        }
        if stopping.is_none() && stop_asked(dir) {
            stopping = Some(Instant::now());
            program.stop(false);
        }
        if stopping.is_some_and(|t| t.elapsed() > STOP_GRACE) {
            program.stop(true);
        }
        std::thread::sleep(RUN_STEP);
    };
    // (what it started that is still there goes with it)
    program.stop(true);
    let code = status.and_then(|s| s.code());
    if stopping.is_some() {
        end(JobState::Stopped, started, code, None);
    } else if status.is_some_and(|s| s.success()) {
        end(JobState::Done, started, code, None);
    } else {
        end(JobState::Failed, started, code, None);
    }
    drop(lock);
    0
}

/// Whether it is this job's turn - the first waiting, with fewer running
/// than it allows - and, where it is, the job recorded running. Asked by one
/// runner at a time.
fn take_turn(dir: &Path, spec: &JobSpec, base: &JobRecord) -> std::io::Result<bool> {
    let root = dir.parent().ok_or_else(|| std::io::Error::other("a job's folder has no parent"))?;
    let queue = OpenOptions::new().create(true).truncate(false).write(true).open(root.join(QUEUE_LOCK))?;
    queue.lock()?;
    let mut running = 0u32;
    let mut first: Option<(u64, PathBuf)> = None;
    for entry in fs::read_dir(root)?.flatten() {
        let other = entry.path();
        if !other.is_dir() {
            continue;
        }
        let Some(record) = current_record(&other) else { continue };
        match record.state {
            JobState::Running => running += 1,
            JobState::Waiting => {
                let key = (record.created, other);
                if first.as_ref().is_none_or(|f| key < *f) {
                    first = Some(key);
                }
            }
            _ => {}
        }
    }
    let mine = first.is_some_and(|(_, p)| p.file_name() == dir.file_name());
    let taken = mine && running < spec.slots.max(1);
    if taken {
        write_record(dir, &JobRecord { state: JobState::Running, started: Some(now_ms()), ..base.clone() })?;
    }
    Ok(taken)
}

/// A running program, and the group - or job object - it and what it starts are in.
struct Program {
    child: std::process::Child,
    #[cfg(windows)]
    job: windows_sys::Win32::Foundation::HANDLE,
}

impl Program {
    /// Stop it and everything it started: asked (`hard` false), then made to.
    #[cfg(unix)]
    fn stop(&mut self, hard: bool) {
        // (its group is its own, named by it)
        let group = self.child.id() as libc::pid_t;
        unsafe {
            libc::killpg(group, if hard { libc::SIGKILL } else { libc::SIGTERM });
        }
    }

    /// (Windows asks nothing of a program without a window: it is made to stop at once.)
    #[cfg(windows)]
    fn stop(&mut self, _hard: bool) {
        if !self.job.is_null() {
            unsafe {
                windows_sys::Win32::System::JobObjects::TerminateJobObject(self.job, 1);
            }
        }
        let _ = self.child.kill();
    }
}

#[cfg(windows)]
impl Drop for Program {
    fn drop(&mut self) {
        if !self.job.is_null() {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.job);
            }
        }
    }
}

fn spawn_program(dir: &Path, spec: &JobSpec) -> std::io::Result<Program> {
    let log = OpenOptions::new().create(true).append(true).open(dir.join(LOG))?;
    let input = match &spec.stdin {
        None => Stdio::null(),
        Some(name) if inside_name(name) => Stdio::from(File::open(dir.join(WORK).join(name))?),
        Some(name) => return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("not a file in its folder: {name}"))),
    };
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args)
        .envs(&spec.env)
        .current_dir(dir.join(WORK))
        .stdin(input)
        .stdout(log.try_clone()?)
        .stderr(log);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn()?;
    Ok(Program {
        #[cfg(windows)]
        job: job_object_for(&child),
        child,
    })
}

/// A job object holding the program - and so what it starts - which takes
/// them with it when it closes: when the runner goes, however it goes.
#[cfg(windows)]
fn job_object_for(child: &std::process::Child) -> windows_sys::Win32::Foundation::HANDLE {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return job;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        AssignProcessToJobObject(job, child.as_raw_handle());
        job
    }
}

// --- what a job may run ------------------------------------------------------

/// Whether `id` could be a plugin's id (lib.rs `plugin_id_ok`).
fn plugin_id(id: &str) -> bool {
    crate::plugin_id_ok(id)
}

/// Whether `name` is a path inside a folder: relative, and never above it.
pub fn inside_name(name: &str) -> bool {
    !name.is_empty() && Path::new(name).components().all(|c| matches!(c, Component::Normal(_)))
}

/// The programs a plugin's manifest names: those its steps need (`steps`,
/// each with its `programs`, by name).
fn programs_named(manifest: &serde_json::Value) -> Vec<String> {
    let steps = manifest.get("steps").and_then(|s| s.as_array()).map(Vec::as_slice).unwrap_or_default();
    steps
        .iter()
        .filter_map(|s| s.get("programs")?.as_array())
        .flatten()
        .filter_map(|p| p.as_str())
        .map(str::to_string)
        .collect()
}

/// A program a job may run, found, and the activation its environment wants
/// - or, installed separately, what it is given besides.
#[derive(Debug)]
pub struct Found {
    pub program: PathBuf,
    pub activation: Option<pixienv::Activation>,
    pub env: Vec<(String, String)>,
}

/// The program `name` of plugin `id` (its folder `plugin_dir`), from the
/// plugin's environment in Meno's data folder `data`: one its manifest
/// names, never a shell, found in its environment's own folders - and, where
/// it is Python, running a script of the plugin's.
pub fn plugin_program(data: &Path, plugin_dir: &Path, id: &str, name: &str, args: &[String]) -> Result<Found, String> {
    if !plugin_id(id) {
        return Err(format!("not a plugin: {id}"));
    }
    let single = Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name);
    if !single || !inside_name(name) || NEVER.contains(&name.to_ascii_lowercase().as_str()) {
        return Err(format!("not a program a job runs: {name}"));
    }
    let manifest = fs::read_to_string(plugin_dir.join("manifest.json")).map_err(|e| format!("{id}'s manifest: {e}"))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest).map_err(|e| format!("{id}'s manifest: {e}"))?;
    if !programs_named(&manifest).iter().any(|p| p == name) {
        return Err(format!("{id} names no program {name}"));
    }

    // its environment: pixi's, activated, or uv's
    let pixi = data.join("pixi").join(format!("plugin-{id}"));
    let uv = data.join("uv").join(format!("plugin-{id}")).join("venv");
    let (env_dir, activation, folders) = if let Ok(text) = fs::read_to_string(pixienv::activation_path(&pixi)) {
        let activation: pixienv::Activation = serde_json::from_str(&text).map_err(|e| format!("{id}'s environment: {e}"))?;
        let folders: Vec<PathBuf> = activation.path.iter().map(PathBuf::from).collect();
        (pixi, Some(activation), folders)
    } else if uv.is_dir() {
        let folders = vec![uv.join("bin"), uv.join("Scripts")];
        (uv, None, folders)
    } else {
        return Err(format!("{id} is not set up"));
    };
    let root = env_dir.canonicalize().map_err(|e| format!("{id}'s environment: {e}"))?;
    let files: Vec<String> = if cfg!(windows) { vec![format!("{name}.exe"), name.to_string()] } else { vec![name.to_string()] };
    let program = folders
        .iter()
        .flat_map(|f| files.iter().map(move |n| f.join(n)))
        .find(|p| p.is_file())
        .ok_or_else(|| format!("{name} is not in {id}'s environment"))?;
    // (its folder, not the file: a venv's python is a link to one outside it)
    let dir = program.parent().and_then(|p| p.canonicalize().ok());
    if !dir.is_some_and(|d| d.starts_with(&root)) {
        return Err(format!("{name} is not in {id}'s environment"));
    }
    let stem = program.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_ascii_lowercase();
    if stem.starts_with("python") {
        let scripts = plugin_dir.canonicalize().map_err(|e| format!("{id}'s folder: {e}"))?;
        crate::validate_sidecar(&program, args, &root, &[scripts])?;
    }
    Ok(Found { program, activation, env: Vec::new() })
}

// --- a program installed separately ------------------------------------------

/// The system Meno runs on, as a manifest names it.
pub fn system() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

/// What a plugin may not set for a program installed separately: where
/// programs are looked for (its folders are said apart), what loads code
/// into a program, and what Meno sets itself.
const ENV_NEVER: &[&str] = &[
    "PATH", "LD_PRELOAD", "LD_AUDIT", "DYLD_INSERT_LIBRARIES", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY",
];

/// A program installed separately - ORCA, Gaussian - as its plugin's
/// manifest says how to know it (`installed`): its name, as its steps name
/// it; its file on this system; the folders put before the others where
/// programs are looked for; and the variables it is given besides. Each
/// folder is a place in its installation: `{folder}`, where its file is,
/// or `{parent}`, the folder above, with a path inside it after.
#[derive(Debug, Clone, PartialEq)]
pub struct Installed {
    pub name: String,
    pub file: String,
    pub path: Vec<String>,
    pub env: Vec<(String, Vec<String>)>,
}

/// Whether `t` is a place in a program's installation: `{folder}` or
/// `{parent}`, and after it, if anything, a path inside that, never above.
fn place_ok(t: &str) -> bool {
    match t.strip_prefix("{folder}").or_else(|| t.strip_prefix("{parent}")) {
        Some("") => true,
        Some(rest) => rest.strip_prefix('/').is_some_and(inside_name),
        None => false,
    }
}

/// Whether a plugin may give a program installed separately the variable `n`.
fn env_name_ok(n: &str) -> bool {
    let mut chars = n.chars();
    let shaped = n.len() <= 64
        && chars.next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
    shaped && !ENV_NEVER.iter().chain(THREADS).any(|x| x.eq_ignore_ascii_case(n))
}

/// The program installed separately that a manifest declares as `name`, on
/// `system`: none, where it declares none so named; why not, where what it
/// declares cannot be taken - a file that is a path, a shell, Python; a
/// place outside its installation; a variable it may not set.
pub fn installed_named(manifest: &serde_json::Value, name: &str, system: &str) -> Result<Option<Installed>, String> {
    let declared = manifest.get("installed").and_then(|v| v.as_array()).map(Vec::as_slice).unwrap_or_default();
    let Some(decl) = declared.iter().find(|d| d.get("name").and_then(|n| n.as_str()) == Some(name)) else {
        return Ok(None);
    };
    let file = decl
        .get("files")
        .and_then(|f| f.get(system))
        .and_then(|f| f.as_str())
        .ok_or_else(|| format!("{name} is not made for this system"))?;
    let single = Path::new(file).file_name().and_then(|n| n.to_str()) == Some(file);
    let stem = Path::new(file).file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !single || !inside_name(file) || NEVER.contains(&stem.as_str()) || stem.starts_with("python") {
        return Err(format!("not a program a job runs: {file}"));
    }
    let places = |v: Option<&serde_json::Value>| -> Result<Vec<String>, String> {
        let list = match v {
            None => return Ok(Vec::new()),
            Some(serde_json::Value::String(s)) => vec![s.as_str()],
            Some(serde_json::Value::Array(a)) => a.iter().map(|x| x.as_str().ok_or("not a place")).collect::<Result<_, _>>()?,
            Some(_) => return Err("not a place".into()),
        };
        list.into_iter().map(|t| if place_ok(t) { Ok(t.to_string()) } else { Err(format!("not a place in {name}'s installation: {t}")) }).collect()
    };
    let path = places(decl.get("path"))?;
    let mut env = Vec::new();
    if let Some(vars) = decl.get("env").and_then(|e| e.as_object()) {
        for (k, v) in vars {
            if !env_name_ok(k) {
                return Err(format!("{name} may not be given {k}"));
            }
            env.push((k.clone(), places(Some(v))?));
        }
    }
    Ok(Some(Installed { name: name.to_string(), file: file.to_string(), path, env }))
}

/// Whether `p` is a program that can be run: a file, executable where that is said.
fn runnable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(p).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// Where a program installed separately is: where the chemist located it,
/// where that is still a program of its file's name; else the first of its
/// file's name where the system finds programs (`path_var`: PATH, as Meno
/// was given it).
pub fn installed_where(decl: &Installed, located: Option<&str>, path_var: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let located = located.map(Path::new).filter(|p| {
        p.is_absolute() && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.eq_ignore_ascii_case(&decl.file)) && runnable(p)
    });
    if let Some(p) = located {
        return Some(p.to_path_buf());
    }
    std::env::split_paths(path_var?).filter(|d| d.is_absolute()).map(|d| d.join(&decl.file)).find(|p| runnable(p))
}

/// What a program installed separately is given, found at `program`: its
/// folders before the others where programs are looked for (`path_var`),
/// and its variables, each its places in its installation.
pub fn installed_env(decl: &Installed, program: &Path, path_var: Option<&std::ffi::OsStr>) -> Result<Vec<(String, String)>, String> {
    let folder = program.parent().ok_or("a program in no folder")?;
    let parent = folder.parent().unwrap_or(folder);
    let fill = |t: &String| -> PathBuf {
        let (base, rest) = match t.strip_prefix("{folder}") {
            Some(rest) => (folder, rest),
            None => (parent, t.strip_prefix("{parent}").unwrap_or_default()),
        };
        let rest = rest.trim_start_matches('/');
        if rest.is_empty() { base.to_path_buf() } else { base.join(rest) }
    };
    let joined = |places: Vec<PathBuf>| -> Result<String, String> {
        std::env::join_paths(places).map_err(|e| e.to_string())?.into_string().map_err(|_| "a place that is not text".to_string())
    };
    let mut path: Vec<PathBuf> = decl.path.iter().map(fill).collect();
    path.extend(path_var.map(std::env::split_paths).into_iter().flatten());
    let mut out = vec![("PATH".to_string(), joined(path)?)];
    for (k, places) in &decl.env {
        out.push((k.clone(), joined(places.iter().map(fill).collect())?));
    }
    Ok(out)
}

/// Reads a plugin's manifest from its folder.
fn manifest_of(plugin_dir: &Path, id: &str) -> Result<serde_json::Value, String> {
    let text = fs::read_to_string(plugin_dir.join("manifest.json")).map_err(|e| format!("{id}'s manifest: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("{id}'s manifest: {e}"))
}

/// The program `name` of plugin `id` installed separately, where its
/// manifest declares it so, and one of its steps names it: found where the
/// chemist located it (`located`) or where the system finds programs, with
/// what it is given. None, where the manifest declares no such program.
pub fn installed_program(plugin_dir: &Path, id: &str, name: &str, located: Option<&str>) -> Result<Option<Found>, String> {
    if !plugin_id(id) {
        return Err(format!("not a plugin: {id}"));
    }
    let manifest = manifest_of(plugin_dir, id)?;
    let Some(decl) = installed_named(&manifest, name, system())? else {
        return Ok(None);
    };
    if !programs_named(&manifest).iter().any(|p| p == name) {
        return Err(format!("{id} names no program {name}"));
    }
    let path_var = std::env::var_os("PATH");
    let program = installed_where(&decl, located, path_var.as_deref()).ok_or_else(|| format!("{name} is not found"))?;
    let env = installed_env(&decl, &program, path_var.as_deref())?;
    Ok(Some(Found { program, activation: None, env }))
}

// --- a job's folder ----------------------------------------------------------

/// A file to write into a job's work folder before it starts.
#[derive(Deserialize, Clone, Debug)]
pub struct JobFile {
    pub name: String,
    pub text: String,
}

/// A job's folder made in `root`, its input written and what it runs said,
/// ready for its runner: its id, and its folder.
pub fn make_job(root: &Path, spec: &JobSpec, files: &[JobFile]) -> Result<(String, PathBuf), String> {
    if let Some(f) = files.iter().find(|f| !inside_name(&f.name)) {
        return Err(format!("a job's file must be inside its folder: {}", f.name));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let dir = root.join(&id);
    let work = dir.join(WORK);
    fs::create_dir_all(&work).map_err(|e| format!("a job's folder could not be made: {e}"))?;
    for f in files {
        let path = work.join(&f.name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", f.name))?;
        }
        fs::write(&path, &f.text).map_err(|e| format!("{} could not be written: {e}", f.name))?;
    }
    // (written last: a folder without it is not a job yet)
    let text = serde_json::to_string_pretty(spec).map_err(|e| e.to_string())?;
    fs::write(dir.join(SPEC), text).map_err(|e| format!("a job could not be written: {e}"))?;
    Ok((id, dir))
}

/// What a job's log says from byte `from` on - at most `most` bytes, never
/// ending inside a character - and where that ends.
pub fn read_log(dir: &Path, from: u64, most: u64) -> (String, u64) {
    let Ok(mut f) = File::open(dir.join(LOG)) else { return (String::new(), from) };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let from = from.min(len);
    let mut buf = vec![0u8; (len - from).min(most) as usize];
    if f.seek(SeekFrom::Start(from)).is_err() || f.read_exact(&mut buf).is_err() {
        return (String::new(), from);
    }
    // (a character cut off at the end comes whole next time)
    let end = match std::str::from_utf8(&buf) {
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        _ => buf.len(),
    };
    (String::from_utf8_lossy(&buf[..end]).into_owned(), from + end as u64)
}

/// A file a job wrote in its work folder, as text.
pub fn read_work_file(dir: &Path, name: &str) -> Result<String, String> {
    if !inside_name(name) {
        return Err(format!("not a file of the job's: {name}"));
    }
    let bytes = fs::read(dir.join(WORK).join(name)).map_err(|e| format!("{name}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// The files in a job's work folder, by their paths inside it.
pub fn work_files(dir: &Path) -> Vec<String> {
    fn walk(base: &Path, at: &Path, out: &mut Vec<String>) {
        let Ok(entries) = fs::read_dir(at) else { return };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(base, &p, out);
            } else if let Ok(rel) = p.strip_prefix(base) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let base = dir.join(WORK);
    let mut out = Vec::new();
    walk(&base, &base, &mut out);
    out.sort();
    out
}

/// A job's runner started apart from Meno - a process group of its own,
/// with no console and nothing to say to Meno - so that it outlives it.
fn start_runner(exe: &Path, dir: &Path) -> std::io::Result<()> {
    let mut cmd = Command::new(exe);
    cmd.arg(JOB_FLAG).arg(dir).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    let mut child = cmd.spawn()?;
    // (waited for, apart, so that one ending while Meno is open leaves nothing behind)
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

// --- Meno's commands ---------------------------------------------------------

fn jobs_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = crate::app_data_dir(app)?.join("jobs");
    fs::create_dir_all(&root).map_err(|e| format!("the jobs' folder: {e}"))?;
    Ok(root)
}

/// A job's folder, by its id - which is only ever one Meno made.
fn job_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let ok = uuid::Uuid::parse_str(id).is_ok_and(|u| u.hyphenated().to_string() == id);
    let dir = jobs_root(app)?.join(id);
    if !ok || !dir.join(SPEC).is_file() {
        return Err(format!("no job {id}"));
    }
    Ok(dir)
}

/// What a plugin asks to run (docs/WORKFLOWS.md, `prepare`): its program, by
/// its name, with arguments; the files to write for it; and, from Settings,
/// how many jobs may run at once and how many cores each may use.
#[derive(Deserialize, Debug)]
pub struct JobAsk {
    pub plugin: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub files: Vec<JobFile>,
    /// One of its files, given to its program as what it reads (`JobSpec::stdin`).
    #[serde(default)]
    pub stdin: Option<String>,
    #[serde(default)]
    pub slots: Option<u32>,
    #[serde(default)]
    pub cores: Option<u32>,
    /// Where the chemist located its program, where it is one installed separately.
    #[serde(default)]
    pub path: Option<String>,
}

/// A job made and its runner started: its id. It waits its turn.
#[tauri::command]
pub async fn job_start(app: AppHandle, net: State<'_, crate::net::Net>, payload: JobAsk) -> Result<String, String> {
    let data = crate::app_data_dir(&app)?;
    if !plugin_id(&payload.plugin) {
        return Err(format!("not a plugin: {}", payload.plugin));
    }
    if let Some(name) = payload.stdin.as_deref().filter(|n| !payload.files.iter().any(|f| f.name == *n)) {
        return Err(format!("a job reads only a file written for it: {name}"));
    }
    let plugin_dir = crate::resource_path(&app, &Path::new("resources/plugins").join(&payload.plugin))?;
    let found = match installed_program(&plugin_dir, &payload.plugin, &payload.program, payload.path.as_deref())? {
        Some(found) => found,
        None => plugin_program(&data, &plugin_dir, &payload.plugin, &payload.program, &payload.args)?,
    };

    // what it is given: its environment's activation - or, installed
    // separately, its folders and variables - a network that refuses it
    // (and, while Meno is open, says so), the cores it may use
    let mut given = Command::new(&found.program);
    if let Some(activation) = &found.activation {
        pixienv::activate(&mut given, activation);
    }
    given.envs(found.env.iter().map(|(k, v)| (k, v)));
    net.route_nowhere(&mut given);
    if let Some(cores) = payload.cores {
        for key in THREADS {
            given.env(key, cores.clamp(1, 1024).to_string());
        }
    }
    let env = given
        .get_envs()
        .filter_map(|(k, v)| Some((k.to_str()?.to_string(), v?.to_str()?.to_string())))
        .collect();

    let spec = JobSpec {
        plugin: payload.plugin.clone(),
        name: payload.program.clone(),
        program: found.program.to_string_lossy().into_owned(),
        args: payload.args,
        stdin: payload.stdin,
        env,
        slots: payload.slots.unwrap_or(1).clamp(1, 64),
        created: now_ms(),
    };
    let (id, dir) = make_job(&jobs_root(&app)?, &spec, &payload.files)?;
    let started = std::env::current_exe().and_then(|exe| start_runner(&exe, &dir));
    if let Err(e) = started {
        let why = format!("its runner could not be started: {e}");
        let _ = write_record(&dir, &JobRecord { ended: Some(now_ms()), why: Some(why.clone()), ..JobRecord::new(JobState::Failed, spec.created) });
        return Err(why);
    }
    Ok(id)
}

/// Where plugin `plugin`'s program `name`, installed separately, is: where
/// the chemist located it (`located`), where that is still it, or where the
/// system finds programs. None, where it is found nowhere.
#[tauri::command]
pub async fn program_where(app: AppHandle, plugin: String, name: String, located: Option<String>) -> Result<Option<String>, String> {
    if !plugin_id(&plugin) {
        return Err(format!("not a plugin: {plugin}"));
    }
    let plugin_dir = crate::resource_path(&app, &Path::new("resources/plugins").join(&plugin))?;
    let decl = installed_named(&manifest_of(&plugin_dir, &plugin)?, &name, system())?.ok_or_else(|| format!("{plugin} declares no program {name}"))?;
    let path_var = std::env::var_os("PATH");
    Ok(installed_where(&decl, located.as_deref(), path_var.as_deref()).map(|p| p.to_string_lossy().into_owned()))
}

/// A job, as Meno lists it.
#[derive(Serialize, Debug)]
pub struct JobListed {
    pub id: String,
    pub plugin: String,
    pub program: String,
    #[serde(flatten)]
    pub record: JobRecord,
}

fn listed(id: &str, dir: &Path) -> Option<JobListed> {
    let spec = read_spec(dir)?;
    Some(JobListed { id: id.to_string(), plugin: spec.plugin, program: spec.name, record: current_record(dir)? })
}

#[tauri::command]
pub async fn job_state(app: AppHandle, id: String) -> Result<JobListed, String> {
    let dir = job_dir(&app, &id)?;
    listed(&id, &dir).ok_or_else(|| format!("no job {id}"))
}

/// Every job in Meno's data folder, those asked for first first.
#[tauri::command]
pub async fn jobs_list(app: AppHandle) -> Result<Vec<JobListed>, String> {
    let root = jobs_root(&app)?;
    let mut jobs: Vec<JobListed> = fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            let id = e.file_name().to_str()?.to_string();
            listed(&id, &e.path())
        })
        .collect();
    jobs.sort_by_key(|j| j.record.created);
    Ok(jobs)
}

#[derive(Serialize, Debug)]
pub struct LogRead {
    pub text: String,
    /// Where to read from next.
    pub next: u64,
}

/// What a job's log says from byte `from` on.
#[tauri::command]
pub async fn job_log(app: AppHandle, id: String, from: u64) -> Result<LogRead, String> {
    let (text, next) = read_log(&job_dir(&app, &id)?, from, LOG_MOST);
    Ok(LogRead { text, next })
}

#[tauri::command]
pub async fn job_files(app: AppHandle, id: String) -> Result<Vec<String>, String> {
    Ok(work_files(&job_dir(&app, &id)?))
}

#[tauri::command]
pub async fn job_read(app: AppHandle, id: String, name: String) -> Result<String, String> {
    read_work_file(&job_dir(&app, &id)?, &name)
}

/// Where a job's files are, for *Show files*.
#[tauri::command]
pub async fn job_folder(app: AppHandle, id: String) -> Result<String, String> {
    Ok(job_dir(&app, &id)?.join(WORK).to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn job_stop(app: AppHandle, id: String) -> Result<(), String> {
    ask_stop(&job_dir(&app, &id)?).map_err(|e| e.to_string())
}

/// A finished job's folder taken away; one waiting or running is not.
#[tauri::command]
pub async fn job_remove(app: AppHandle, id: String) -> Result<(), String> {
    let dir = job_dir(&app, &id)?;
    if !current_record(&dir).is_some_and(|r| r.state.finished()) {
        return Err(format!("job {id} has not finished: stop it first"));
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())
}

/// Every finished job's folder taken away: how many.
#[tauri::command]
pub async fn jobs_clear_finished(app: AppHandle) -> Result<u32, String> {
    let root = jobs_root(&app)?;
    let mut cleared = 0;
    for e in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let dir = e.path();
        if dir.is_dir() && current_record(&dir).is_some_and(|r| r.state.finished()) && fs::remove_dir_all(&dir).is_ok() {
            cleared += 1;
        }
    }
    Ok(cleared)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-jobs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A job running a script of the system's shell.
    fn shell(root: &Path, script: &str, slots: u32) -> PathBuf {
        #[cfg(unix)]
        let (program, flag) = ("/bin/sh".to_string(), "-c");
        #[cfg(windows)]
        let (program, flag) = (std::env::var("ComSpec").unwrap_or_else(|_| r"C:\Windows\System32\cmd.exe".into()), "/C");
        let spec = JobSpec {
            plugin: "test".into(),
            name: "shell".into(),
            program,
            args: vec![flag.into(), script.into()],
            stdin: None,
            env: BTreeMap::from([("MENO_JOB_SAYS".into(), "hello".into())]),
            slots,
            created: now_ms(),
        };
        make_job(root, &spec, &[JobFile { name: "input.txt".into(), text: "input".into() }]).unwrap().1
    }

    fn wait_for(what: impl Fn() -> bool) {
        let t = Instant::now();
        while !what() {
            assert!(t.elapsed() < Duration::from_secs(10), "waited too long");
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    #[cfg(unix)]
    const ECHO: &str = "cat input.txt; echo; echo $MENO_JOB_SAYS; echo out > result.txt";
    #[cfg(windows)]
    const ECHO: &str = "type input.txt&echo(&echo %MENO_JOB_SAYS%&echo out>result.txt";

    #[cfg(unix)]
    const FAIL: &str = "echo nope >&2; exit 3";
    #[cfg(windows)]
    const FAIL: &str = "echo nope 1>&2 & exit 3";

    #[test]
    fn runs_its_program_in_its_folder_and_says_how_it_ended() {
        let root = temp();
        let ok = shell(&root, ECHO, 1);
        assert_eq!(run_job(&ok), 0);
        let r = current_record(&ok).unwrap();
        assert_eq!((r.state, r.code), (JobState::Done, Some(0)));
        assert!(r.started.is_some() && r.ended >= r.started);
        let log = read_log(&ok, 0, LOG_MOST).0.replace('\r', "");
        assert_eq!(log, "input\nhello\n");
        assert_eq!(read_work_file(&ok, "result.txt").unwrap().trim_end(), "out");
        assert_eq!(work_files(&ok), vec!["input.txt", "result.txt"]);
        // and read on from where it was read to
        let (_, next) = read_log(&ok, 0, 3);
        assert_eq!(read_log(&ok, next, LOG_MOST).0.replace('\r', ""), "ut\nhello\n");

        let bad = shell(&root, FAIL, 1);
        run_job(&bad);
        let r = current_record(&bad).unwrap();
        assert_eq!((r.state, r.code), (JobState::Failed, Some(3)));
        assert_eq!(read_log(&bad, 0, LOG_MOST).0.trim_end(), "nope");
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    const READS: &str = "cat";
    #[cfg(windows)]
    const READS: &str = "sort";

    #[test]
    fn gives_its_program_a_file_of_its_own_to_read() {
        let root = temp();
        let dir = shell(&root, READS, 1);
        let spec = JobSpec { stdin: Some("input.txt".into()), ..read_spec(&dir).unwrap() };
        fs::write(dir.join(SPEC), serde_json::to_string(&spec).unwrap()).unwrap();
        assert_eq!(run_job(&dir), 0);
        assert_eq!(read_log(&dir, 0, LOG_MOST).0.trim_end(), "input");

        // (a file not in its folder: it never starts)
        let away = shell(&root, READS, 1);
        let spec = JobSpec { stdin: Some("../job.json".into()), ..read_spec(&away).unwrap() };
        fs::write(away.join(SPEC), serde_json::to_string(&spec).unwrap()).unwrap();
        run_job(&away);
        let r = current_record(&away).unwrap();
        assert_eq!(r.state, JobState::Failed);
        assert!(r.why.unwrap().contains("not a file in its folder"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn fails_saying_why_where_its_program_cannot_start() {
        let root = temp();
        let dir = shell(&root, "", 1);
        let spec = JobSpec { program: root.join("no-such-program").to_string_lossy().into_owned(), ..read_spec(&dir).unwrap() };
        fs::write(dir.join(SPEC), serde_json::to_string(&spec).unwrap()).unwrap();
        run_job(&dir);
        let r = current_record(&dir).unwrap();
        assert_eq!(r.state, JobState::Failed);
        assert!(r.why.unwrap().contains("could not be started"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    const PAUSE: &str = "sleep 1";
    #[cfg(windows)]
    const PAUSE: &str = "ping -n 2 127.0.0.1 > nul";

    #[test]
    fn waits_its_turn_in_the_order_jobs_were_asked_for() {
        let root = temp();
        let first = shell(&root, PAUSE, 1);
        std::thread::sleep(Duration::from_millis(5));
        let second = shell(&root, ECHO, 1);
        // (the second's runner started first: it still waits for the first)
        let b = {
            let d = second.clone();
            std::thread::spawn(move || run_job(&d))
        };
        let a = {
            let d = first.clone();
            std::thread::spawn(move || run_job(&d))
        };
        wait_for(|| current_record(&first).is_some_and(|r| r.state == JobState::Running));
        assert_eq!(current_record(&second).unwrap().state, JobState::Waiting);
        a.join().unwrap();
        b.join().unwrap();
        let (f, s) = (current_record(&first).unwrap(), current_record(&second).unwrap());
        assert_eq!((f.state, s.state), (JobState::Done, JobState::Done));
        assert!(s.started.unwrap() >= f.ended.unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn runs_as_many_at_once_as_were_allowed() {
        let root = temp();
        let jobs: Vec<PathBuf> = (0..2).map(|_| shell(&root, PAUSE, 2)).collect();
        let runners: Vec<_> = jobs
            .iter()
            .map(|d| {
                let d = d.clone();
                std::thread::spawn(move || run_job(&d))
            })
            .collect();
        wait_for(|| jobs.iter().all(|d| current_record(d).is_some_and(|r| r.state == JobState::Running)));
        for r in runners {
            r.join().unwrap();
        }
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    const LONG: &str = "sleep 30 & echo $! > child.pid; wait";
    #[cfg(windows)]
    const LONG: &str = "ping -n 30 127.0.0.1";

    #[test]
    fn stops_its_program_and_what_it_started_when_asked() {
        let root = temp();
        let dir = shell(&root, LONG, 1);
        let runner = {
            let d = dir.clone();
            std::thread::spawn(move || run_job(&d))
        };
        let t = Instant::now();
        #[cfg(unix)]
        wait_for(|| read_work_file(&dir, "child.pid").is_ok_and(|s| s.ends_with('\n')));
        #[cfg(windows)]
        wait_for(|| current_record(&dir).is_some_and(|r| r.state == JobState::Running));
        ask_stop(&dir).unwrap();
        runner.join().unwrap();
        assert_eq!(current_record(&dir).unwrap().state, JobState::Stopped);
        assert!(t.elapsed() < Duration::from_secs(10));
        // (what it started went with it)
        #[cfg(unix)]
        {
            let started: libc::pid_t = read_work_file(&dir, "child.pid").unwrap().trim().parse().unwrap();
            wait_for(|| unsafe { libc::kill(started, 0) } != 0);
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_waiting_job_asked_to_stop_never_starts() {
        let root = temp();
        let dir = shell(&root, ECHO, 1);
        ask_stop(&dir).unwrap();
        run_job(&dir);
        let r = current_record(&dir).unwrap();
        assert_eq!((r.state, r.started), (JobState::Stopped, None));
        assert!(!dir.join(WORK).join("result.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_job_whose_runner_is_gone_is_gone() {
        let root = temp();
        let dir = shell(&root, ECHO, 1);
        // (recorded running, by a runner that holds nothing)
        write_record(&dir, &JobRecord { started: Some(2), ..JobRecord::new(JobState::Running, 1) }).unwrap();
        assert_eq!(current_record(&dir).unwrap().state, JobState::Gone);
        // and one it holds is not
        let other = shell(&root, ECHO, 1);
        let lock = OpenOptions::new().create(true).truncate(false).write(true).open(other.join(RUNNER_LOCK)).unwrap();
        lock.lock().unwrap();
        write_record(&other, &JobRecord::new(JobState::Running, 1)).unwrap();
        assert_eq!(current_record(&other).unwrap().state, JobState::Running);
        drop(lock);
        // (let go: gone - once a program another test starts, forked while the
        // lock was held and holding it with it until it runs, has let go too)
        wait_for(|| current_record(&other).unwrap().state == JobState::Gone);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn keeps_a_job_s_files_inside_its_folder() {
        assert!(inside_name("input.inp"));
        assert!(inside_name("sub/coords.xyz"));
        assert!(!inside_name("../escape"));
        assert!(!inside_name("/etc/passwd"));
        assert!(!inside_name(""));
        let root = temp();
        let dir = shell(&root, ECHO, 1);
        assert!(read_work_file(&dir, "../job.json").is_err());
        let spec = read_spec(&dir).unwrap();
        assert!(make_job(&root, &spec, &[JobFile { name: "../x".into(), text: String::new() }]).is_err());
        let _ = fs::remove_dir_all(root);
    }

    /// A plugin's folder naming `programs`, and Meno's data folder with its uv environment holding `files`.
    fn plugin(programs: &str, files: &[&str]) -> (PathBuf, PathBuf) {
        let base = temp();
        let plugin = base.join("plugins").join("demo");
        fs::create_dir_all(&plugin).unwrap();
        fs::write(plugin.join("manifest.json"), format!(r#"{{"id": "demo", "steps": [{{"kinds": ["optimise"], "programs": {programs}}}]}}"#)).unwrap();
        fs::write(plugin.join("worker.py"), "").unwrap();
        let data = base.join("data");
        let bin = data.join("uv").join("plugin-demo").join("venv").join(if cfg!(windows) { "Scripts" } else { "bin" });
        fs::create_dir_all(&bin).unwrap();
        for f in files {
            fs::write(bin.join(f), "").unwrap();
        }
        (data, plugin)
    }

    #[test]
    fn runs_only_a_program_its_plugin_names_from_the_plugin_s_environment() {
        let exe = |n: &str| if cfg!(windows) { format!("{n}.exe") } else { n.to_string() };
        let (data, dir) = plugin(r#"["xtb", "crest", {"name": "named"}, "bash"]"#, &[&exe("xtb"), &exe("crest"), &exe("named"), &exe("bash"), &exe("other")]);
        let found = plugin_program(&data, &dir, "demo", "xtb", &["in.xyz".into(), "--opt".into()]).unwrap();
        assert!(found.program.ends_with(exe("xtb")));
        assert!(found.activation.is_none());
        assert!(plugin_program(&data, &dir, "demo", "crest", &[]).is_ok());
        // not named - by name, as the manifest's reader takes them; never a shell, named or not; a name, not a path
        assert!(plugin_program(&data, &dir, "demo", "other", &[]).is_err());
        assert!(plugin_program(&data, &dir, "demo", "named", &[]).is_err());
        assert!(plugin_program(&data, &dir, "demo", "bash", &[]).is_err());
        assert!(plugin_program(&data, &dir, "demo", "../xtb", &[]).is_err());
        assert!(plugin_program(&data, &dir, "../demo", "xtb", &[]).is_err());
        // named, but not in its environment
        let (empty, dir2) = plugin(r#"["xtb"]"#, &[]);
        assert!(plugin_program(&empty, &dir2, "demo", "xtb", &[]).unwrap_err().contains("not in"));
        let _ = fs::remove_dir_all(data.parent().unwrap());
        let _ = fs::remove_dir_all(empty.parent().unwrap());
    }

    #[test]
    fn runs_python_only_with_a_script_of_the_plugin_s() {
        let python = if cfg!(windows) { "python.exe" } else { "python" };
        let (data, dir) = plugin(r#"["python"]"#, &[python]);
        let script = dir.canonicalize().unwrap().join("worker.py").to_string_lossy().into_owned();
        assert!(plugin_program(&data, &dir, "demo", "python", &["-u".into(), script, "--in".into(), "x".into()]).is_ok());
        assert!(plugin_program(&data, &dir, "demo", "python", &["-c".into(), "print(1)".into()]).is_err());
        assert!(plugin_program(&data, &dir, "demo", "python", &[]).is_err());
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn finds_a_pixi_environment_s_program_where_its_activation_puts_it() {
        let (data, dir) = plugin(r#"["xtb"]"#, &[]);
        let env = data.join("pixi").join("plugin-demo");
        let bin = env.join(".pixi").join("envs").join("default").join("bin");
        fs::create_dir_all(&bin).unwrap();
        let exe = if cfg!(windows) { "xtb.exe" } else { "xtb" };
        fs::write(bin.join(exe), "").unwrap();
        let activation = pixienv::Activation { vars: BTreeMap::from([("CONDA_PREFIX".into(), "x".into())]), path: vec![bin.to_string_lossy().into_owned()] };
        fs::write(pixienv::activation_path(&env), serde_json::to_string(&activation).unwrap()).unwrap();
        let found = plugin_program(&data, &dir, "demo", "xtb", &[]).unwrap();
        assert!(found.program.ends_with(exe));
        assert_eq!(found.activation, Some(activation));
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    /// A program file named `name` in `dir`, which can be run.
    fn program_file(dir: &Path, name: &str) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let p = dir.join(name);
        fs::write(&p, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&p, fs::Permissions::from_mode(0o755)).unwrap();
        }
        p
    }

    #[test]
    fn reads_a_program_installed_separately_as_its_manifest_declares_it() {
        let m = serde_json::json!({"installed": [{
            "name": "g16", "files": {"macos": "g16", "linux": "g16"},
            "path": ["{folder}"], "env": {"g16root": "{parent}", "GAUSS_EXEDIR": ["{folder}/bsd", "{folder}"]}
        }]});
        let decl = installed_named(&m, "g16", "linux").unwrap().unwrap();
        assert_eq!(decl.file, "g16");
        assert_eq!(decl.path, vec!["{folder}"]);
        assert_eq!(decl.env, vec![("GAUSS_EXEDIR".to_string(), vec!["{folder}/bsd".to_string(), "{folder}".to_string()]), ("g16root".to_string(), vec!["{parent}".to_string()])]);
        // not declared; not made for this system
        assert_eq!(installed_named(&m, "orca", "linux").unwrap(), None);
        assert!(installed_named(&m, "g16", "windows").unwrap_err().contains("not made"));
        // never a path, a shell or Python; never a place outside its installation; never a variable it may not set
        let one = |decl: serde_json::Value| installed_named(&serde_json::json!({"installed": [decl]}), "p", "linux");
        for file in ["../g16", "/bin/g16", "sh", "bash.exe", "python3"] {
            assert!(one(serde_json::json!({"name": "p", "files": {"linux": file}})).is_err(), "{file}");
        }
        for place in ["/usr/lib", "{folder}/../x", "{home}", "{folder}x", "bsd"] {
            assert!(one(serde_json::json!({"name": "p", "files": {"linux": "p"}, "path": [place]})).is_err(), "{place}");
        }
        for var in ["PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "omp_num_threads", "HTTP_PROXY", "1X", "A-B"] {
            assert!(one(serde_json::json!({"name": "p", "files": {"linux": "p"}, "env": {var: "{folder}"}})).is_err(), "{var}");
        }
    }

    #[test]
    fn finds_a_program_installed_separately_where_it_was_located_or_where_programs_are() {
        let base = temp();
        let decl = Installed { name: "orca".into(), file: "orca".into(), path: vec!["{folder}".into()], env: vec![("ORCA_HOME".into(), vec!["{parent}".into()])] };
        let installed = program_file(&base.join("apps").join("orca_6"), "orca");
        let on_path = program_file(&base.join("bin"), "orca");
        let path_var = std::env::join_paths([base.join("nowhere"), base.join("bin")]).unwrap();
        // where it was located; else where the system finds programs
        assert_eq!(installed_where(&decl, installed.to_str(), Some(&path_var)), Some(installed.clone()));
        assert_eq!(installed_where(&decl, None, Some(&path_var)), Some(on_path.clone()));
        // a place located that is not it - another file's name, gone, not absolute - is passed over
        let other = program_file(&base.join("apps"), "other");
        assert_eq!(installed_where(&decl, other.to_str(), Some(&path_var)), Some(on_path));
        assert_eq!(installed_where(&decl, Some("orca"), None), None);
        assert_eq!(installed_where(&decl, base.join("gone").join("orca").to_str(), None), None);
        // what it is given: its folder first where programs are looked for, its variables in its installation
        let env = installed_env(&decl, &installed, Some(&path_var)).unwrap();
        let path: Vec<PathBuf> = std::env::split_paths(&env[0].1).collect();
        assert_eq!(env[0].0, "PATH");
        assert_eq!(path, vec![base.join("apps").join("orca_6"), base.join("nowhere"), base.join("bin")]);
        assert_eq!(env[1], ("ORCA_HOME".to_string(), base.join("apps").to_string_lossy().into_owned()));
        let _ = fs::remove_dir_all(base);
    }

    #[cfg(unix)]
    #[test]
    fn a_program_installed_separately_is_found_only_where_it_can_be_run() {
        let base = temp();
        let decl = Installed { name: "g16".into(), file: "g16".into(), path: vec![], env: vec![] };
        let p = base.join("g16");
        fs::create_dir_all(&base).unwrap();
        fs::write(&p, "").unwrap();
        assert_eq!(installed_where(&decl, p.to_str(), None), None);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn runs_a_program_installed_separately_only_as_its_plugin_declares_and_names_it() {
        let base = temp();
        let plugin = base.join("plugins").join("demo");
        fs::create_dir_all(&plugin).unwrap();
        let exe = if cfg!(windows) { "orca.exe" } else { "orca" };
        let manifest = serde_json::json!({
            "id": "demo",
            "installed": [
                {"name": "orca", "files": {system(): exe}, "path": ["{folder}"]},
                {"name": "unused", "files": {system(): "unused"}},
                {"name": "nowhere", "files": {system(): "meno-test-not-a-program"}}
            ],
            "steps": [{"kinds": ["energy"], "programs": ["orca", "nowhere"]}]
        });
        fs::write(plugin.join("manifest.json"), manifest.to_string()).unwrap();
        let orca = program_file(&base.join("orca_6"), exe);
        let found = installed_program(&plugin, "demo", "orca", orca.to_str()).unwrap().unwrap();
        assert_eq!(found.program, orca);
        assert!(found.activation.is_none());
        assert_eq!(found.env[0].0, "PATH");
        // not declared installed: the plugin's environment's, as before; declared but named by no step; not found
        assert!(installed_program(&plugin, "demo", "xtb", None).unwrap().is_none());
        assert!(installed_program(&plugin, "demo", "unused", None).unwrap_err().contains("names no program"));
        assert!(installed_program(&plugin, "demo", "nowhere", None).unwrap_err().contains("not found"));
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn reads_the_programs_a_manifest_names() {
        let m: serde_json::Value = serde_json::from_str(r#"{"steps": [{"kinds": ["optimise", "energy"], "programs": ["a", {"name": "b"}]}, {"kinds": ["energy"]}, {"programs": [3, "c"]}]}"#).unwrap();
        // (by name only, as the manifest's reader takes them)
        assert_eq!(programs_named(&m), vec!["a", "c"]);
        assert!(programs_named(&serde_json::json!({})).is_empty());
    }
}
