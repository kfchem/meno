//! Jobs (docs/WORKFLOWS.md, *What changes in the contract*): a program run
//! for a workflow's step, on this computer, in a folder of its own - started
//! apart from Meno, so that it goes on when Meno closes - its log written
//! as it goes, and how it ended recorded.
//!
//! A job's folder, in Meno's local data folder (lib.rs `local_data_dir`),
//! `jobs/<id>/`:
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
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

/// The flag that starts Meno's executable as a job's runner.
pub const JOB_FLAG: &str = "--job";

const SPEC: &str = "job.json";
const RECORD: &str = "state.json";
const LOG: &str = "log.txt";
/// What the programs run after its own say (`JobSpec::then`): kept apart
/// from its log, which is its program's output, read as such.
const AFTER_LOG: &str = "after.txt";
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
    /// Programs installed beside its own, run after it in turn where it ended
    /// well - ORCA's orca_2mkl, writing its orbitals as a Molden file - each
    /// in its work folder, given what it was given, what they say kept apart.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub then: Vec<Then>,
}

/// A program a job runs after its own (`JobSpec::then`): by its name, its full path, and its arguments.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Then {
    pub name: String,
    pub program: String,
    pub args: Vec<String>,
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
    let input = spec.stdin.as_deref();
    let mut program = match spawn_program(dir, &spec.program, &spec.args, &spec.env, input, LOG) {
        Ok(p) => p,
        Err(e) => {
            end(JobState::Failed, started, None, Some(format!("{} could not be started: {e}", spec.name)));
            return 1;
        }
    };
    let (status, stopped) = wait_program(dir, &mut program);
    let code = status.and_then(|s| s.code());
    if stopped {
        end(JobState::Stopped, started, code, None);
    } else if !status.is_some_and(|s| s.success()) {
        end(JobState::Failed, started, code, None);
    } else {
        // then those beside it, in turn: what they make is a help, not the
        // job - one that fails or cannot start leaves it done, saying so
        // apart from its log
        for then in &spec.then {
            let mut after = match spawn_program(dir, &then.program, &then.args, &spec.env, None, AFTER_LOG) {
                Ok(p) => p,
                Err(e) => {
                    let _ = OpenOptions::new().create(true).append(true).open(dir.join(AFTER_LOG)).and_then(|mut f| writeln!(f, "{} could not be started: {e}", then.name));
                    continue;
                }
            };
            if wait_program(dir, &mut after).1 {
                end(JobState::Stopped, started, code, None);
                drop(lock);
                return 0;
            }
        }
        end(JobState::Done, started, code, None);
    }
    drop(lock);
    0
}

/// A program run until it ends - asked to stop where the job is, then made
/// to - and what it started that is still there stopped with it: how it
/// ended, and whether it was stopped.
fn wait_program(dir: &Path, program: &mut Program) -> (Option<std::process::ExitStatus>, bool) {
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
    program.stop(true);
    (status, stopping.is_some())
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

/// A program started in the job's work folder, given `env`, reading
/// `stdin` (a file in that folder) or nothing, what it says going to the
/// job's file `log`.
fn spawn_program(dir: &Path, program: &str, args: &[String], env: &BTreeMap<String, String>, stdin: Option<&str>, log: &str) -> std::io::Result<Program> {
    let log = OpenOptions::new().create(true).append(true).open(dir.join(log))?;
    let input = match stdin {
        None => Stdio::null(),
        Some(name) if inside_name(name) => Stdio::from(File::open(dir.join(WORK).join(name))?),
        Some(name) => return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("not a file in its folder: {name}"))),
    };
    let mut cmd = Command::new(program);
    cmd.args(args)
        .envs(env)
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

/// The programs a plugin's manifest names: those its steps need, and its
/// roles (`steps` and `roles`, each with its `programs`, by name).
fn programs_named(manifest: &serde_json::Value) -> Vec<String> {
    let listed = |key: &str| manifest.get(key).and_then(|s| s.as_array()).map(Vec::as_slice).unwrap_or_default();
    listed("steps")
        .iter()
        .chain(listed("roles"))
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
    /// Programs installed beside it that a job may run after it, by name: where each would be (`Installed::beside`).
    pub beside: Vec<(String, PathBuf)>,
}

/// The program `name` of plugin `id` (its folder `plugin_dir`), from the
/// plugin's environment in Meno's data folder `data`: one its manifest
/// names, never a shell, found in its environment's own folders - and, where
/// it is Python, running a script of the plugin's. Or, where its manifest
/// says Meno fetches it as the plugin is set up (`downloads[].provides`:
/// Blender), Meno's own copy of it, in the plugin's files.
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
    // (Meno's own copy, fetched as the plugin was set up)
    if let Some(program) = crate::plugfiles::provided(data, &manifest, id, name)? {
        return Ok(Found { program, activation: None, env: Vec::new(), beside: Vec::new() });
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
    Ok(Found { program, activation, env: Vec::new(), beside: Vec::new() })
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
    /// The folders it is usually installed in, on this system (`places`),
    /// each from `/`, `{home}` or `{programs}`; a `*` in a folder's name
    /// stands for any text - a version's, say.
    pub places: Vec<String>,
    /// What it is called, as Meno says it to the chemist.
    pub label: String,
    /// How it says its version, and the least Meno takes (`version`).
    pub version: Option<VersionRule>,
    /// Programs installed with it, in its folder, that a job may run after it
    /// (`beside`): each by its name and its file on this system - ORCA's
    /// orca_2mkl.
    pub beside: Vec<(String, String)>,
}

/// How a program installed separately says its version (`installed[].version`):
/// run with `args` - each an option, never a file - it prints a line beginning
/// `after`, then the version, digits and dots; `least` is the version Meno
/// needs, or later.
#[derive(Debug, Clone, PartialEq)]
pub struct VersionRule {
    pub args: Vec<String>,
    pub after: String,
    pub least: String,
}

/// Whether `v` is a version as a rule says one: digits, dots between them.
fn version_ok(v: &str) -> bool {
    !v.is_empty() && v.len() <= 20 && v.split('.').all(|p| !p.is_empty() && p.len() <= 6 && p.chars().all(|c| c.is_ascii_digit()))
}

/// Versions compared part by part, as numbers; a part not given, 0.
pub fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let parts = |v: &str| v.split('.').map(|p| p.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    let (x, y) = (parts(a), parts(b));
    (0..x.len().max(y.len())).map(|i| x.get(i).unwrap_or(&0).cmp(y.get(i).unwrap_or(&0))).find(|o| o.is_ne()).unwrap_or(std::cmp::Ordering::Equal)
}

/// The version a program printed, as its rule reads it: after `after` at a
/// line's start, digits and dots.
pub fn version_in(printed: &str, rule: &VersionRule) -> Option<String> {
    printed.lines().find_map(|line| {
        let rest = line.trim_start().strip_prefix(&rule.after)?;
        let v: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        let v = v.trim_end_matches('.').to_string();
        version_ok(&v).then_some(v)
    })
}

/// How long a program may take to say its version.
const VERSION_WAIT: std::time::Duration = std::time::Duration::from_secs(20);

/// What a program said of its version, by its file as it is (its size and
/// when it was last changed) and how it was asked.
type VersionsKnown = std::collections::HashMap<(PathBuf, u64, Option<std::time::SystemTime>, Vec<String>), Option<String>>;

/// The version the program at `p` says, run as its rule says - asked once
/// for each file as it is: none, where it says none it can be read by, or
/// does not answer in time.
pub fn version_of(p: &Path, rule: &VersionRule) -> Option<String> {
    use std::sync::{Mutex, OnceLock};
    static KNOWN: OnceLock<Mutex<VersionsKnown>> = OnceLock::new();
    let meta = fs::metadata(p).ok()?;
    let key = (p.to_path_buf(), meta.len(), meta.modified().ok(), rule.args.clone());
    if let Some(v) = KNOWN.get_or_init(Default::default).lock().ok()?.get(&key) {
        return v.clone();
    }
    let mut cmd = Command::new(p);
    cmd.args(&rule.args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().ok()?;
    let mut out = child.stdout.take()?;
    // (what it prints read apart, so that a full pipe never holds it)
    let reader = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = out.read_to_string(&mut text);
        text
    });
    let start = std::time::Instant::now();
    let ended = loop {
        match child.try_wait() {
            Ok(Some(_)) => break true,
            Ok(None) if start.elapsed() < VERSION_WAIT => std::thread::sleep(std::time::Duration::from_millis(30)),
            _ => break false,
        }
    };
    if !ended {
        let _ = child.kill();
        let _ = child.wait();
    }
    let printed = reader.join().unwrap_or_default();
    let v = if ended { version_in(&printed, rule) } else { None };
    if let Ok(mut known) = KNOWN.get_or_init(Default::default).lock() {
        known.insert(key, v.clone());
    }
    v
}


/// Where a usual place starts, as Meno has it: the home folder, and the
/// folder programs are installed in (Windows' Program Files).
#[derive(Debug, Clone, Default)]
pub struct Bases {
    pub home: Option<PathBuf>,
    pub programs: Option<PathBuf>,
}

impl Bases {
    /// This computer's.
    pub fn here() -> Bases {
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
        let programs = if cfg!(windows) { std::env::var_os("ProgramFiles").map(PathBuf::from) } else { None };
        Bases { home: home.filter(|p| p.is_absolute()), programs: programs.filter(|p| p.is_absolute()) }
    }
}

/// Whether `t` is a usual place for a program: from `/`, `{home}` or
/// `{programs}`, and after it folders' names - never `.` or `..`, a `*` at
/// most once in each.
fn usual_place_ok(t: &str) -> bool {
    let rest = if let Some(r) = t.strip_prefix("{home}").or_else(|| t.strip_prefix("{programs}")) {
        if r.is_empty() {
            return true;
        }
        match r.strip_prefix('/') {
            Some(r) => r,
            None => return false,
        }
    } else {
        match t.strip_prefix('/') {
            Some(r) => r,
            None => return false,
        }
    };
    t.len() <= 300
        && rest.split('/').all(|part| {
            !part.is_empty() && part != "." && part != ".." && part.matches('*').count() <= 1 && !part.contains(['\\', ':', '{', '}'])
        })
}

/// Names compared as a person reads them: numbers by their value, so that
/// "Blender 10.1" comes after "Blender 5.2".
fn natural(a: &str, b: &str) -> std::cmp::Ordering {
    fn chunks(s: &str) -> Vec<(bool, String)> {
        let mut out: Vec<(bool, String)> = Vec::new();
        for c in s.chars() {
            let digit = c.is_ascii_digit();
            match out.last_mut() {
                Some((d, t)) if *d == digit => t.push(c),
                _ => out.push((digit, c.to_string())),
            }
        }
        out
    }
    let (x, y) = (chunks(a), chunks(b));
    for (p, q) in x.iter().zip(&y) {
        let order = match (p, q) {
            ((true, m), (true, n)) => {
                let (m, n) = (m.trim_start_matches('0'), n.trim_start_matches('0'));
                m.len().cmp(&n.len()).then_with(|| m.cmp(n))
            }
            ((_, m), (_, n)) => m.cmp(n),
        };
        if order != std::cmp::Ordering::Equal {
            return order;
        }
    }
    x.len().cmp(&y.len())
}

/// The folders a usual place stands for, the newest first where a `*` stands
/// for a version: those there are.
fn usual_folders(place: &str, bases: &Bases) -> Vec<PathBuf> {
    let (base, rest) = if let Some(r) = place.strip_prefix("{home}") {
        (bases.home.clone(), r)
    } else if let Some(r) = place.strip_prefix("{programs}") {
        (bases.programs.clone(), r)
    } else {
        (Some(PathBuf::from("/")), place)
    };
    let Some(base) = base else {
        return Vec::new();
    };
    let mut folders = vec![base];
    for part in rest.split('/').filter(|p| !p.is_empty()) {
        let mut next = Vec::new();
        for f in &folders {
            match part.split_once('*') {
                None => next.push(f.join(part)),
                Some((before, after)) => {
                    let mut names: Vec<String> = fs::read_dir(f)
                        .map(|rd| rd.filter_map(|e| e.ok()?.file_name().into_string().ok()).collect())
                        .unwrap_or_default();
                    names.retain(|n| n.len() >= before.len() + after.len() && n.starts_with(before) && n.ends_with(after));
                    names.sort_by(|a, b| natural(b, a));
                    next.extend(names.into_iter().map(|n| f.join(n)));
                }
            }
        }
        folders = next;
    }
    folders.into_iter().filter(|f| f.is_dir()).collect()
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
    if !program_file_ok(file) {
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
    let usual = match decl.get("places").and_then(|p| p.get(system)) {
        None => Vec::new(),
        Some(serde_json::Value::Array(a)) => a
            .iter()
            .map(|x| x.as_str().filter(|t| usual_place_ok(t)).map(str::to_string).ok_or_else(|| format!("not a place {name} is installed in: {x}")))
            .collect::<Result<_, _>>()?,
        Some(x) => return Err(format!("not a place {name} is installed in: {x}")),
    };
    let mut env = Vec::new();
    if let Some(vars) = decl.get("env").and_then(|e| e.as_object()) {
        for (k, v) in vars {
            if !env_name_ok(k) {
                return Err(format!("{name} may not be given {k}"));
            }
            env.push((k.clone(), places(Some(v))?));
        }
    }
    let label = decl.get("label").and_then(|l| l.as_str()).map(str::trim).filter(|l| !l.is_empty() && l.len() <= 60).unwrap_or(name).to_string();
    let version = match decl.get("version") {
        None => None,
        Some(v) => {
            let args: Vec<String> = v.get("args").and_then(|a| a.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
            let after = v.get("after").and_then(|a| a.as_str()).unwrap_or_default().to_string();
            let least = v.get("least").and_then(|a| a.as_str()).unwrap_or_default().to_string();
            // (options alone, never a file or a path; text to find; a version)
            let arg_ok = |a: &String| a.starts_with('-') && a.len() <= 40 && a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
            if args.is_empty() || args.len() > 4 || !args.iter().all(arg_ok) || after.is_empty() || after.len() > 40 || after.contains(['\n', '\r']) || !version_ok(&least) {
                return Err(format!("not a way to read {name}'s version"));
            }
            Some(VersionRule { args, after, least })
        }
    };
    let mut beside = Vec::new();
    if let Some(given) = decl.get("beside") {
        let given = given.as_object().filter(|b| b.len() <= 4).ok_or_else(|| format!("not programs beside {name}"))?;
        for (k, v) in given {
            let ok_name = !k.is_empty() && k.len() <= 40 && k.chars().all(|c| c.is_ascii_alphanumeric() || "._+-".contains(c)) && k.chars().next().is_some_and(|c| c.is_ascii_alphanumeric());
            if !ok_name || !v.is_object() {
                return Err(format!("not a program beside {name}: {k}"));
            }
            // (one not made for this system: none here)
            let Some(f) = v.get(system) else { continue };
            match f.as_str().filter(|f| program_file_ok(f)) {
                Some(f) => beside.push((k.clone(), f.to_string())),
                None => return Err(format!("not a program a job runs: {f}")),
            }
        }
    }
    Ok(Some(Installed { name: name.to_string(), file: file.to_string(), path, env, places: usual, label, version, beside }))
}

/// Whether `file` is a program's file a job may run: a name alone, in its
/// folder, never a shell or an interpreter.
fn program_file_ok(file: &str) -> bool {
    let single = Path::new(file).file_name().and_then(|n| n.to_str()) == Some(file);
    let stem = Path::new(file).file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_ascii_lowercase();
    single && inside_name(file) && !NEVER.contains(&stem.as_str()) && !stem.starts_with("python")
}

/// The programs a job asked to run after its own (`JobAsk::then`), each one
/// declared beside it and there: where each is. Why not, where one is not.
pub fn then_of(found: &Found, label: &str, asked: &[ThenAsk]) -> Result<Vec<Then>, String> {
    if asked.len() > 4 {
        return Err("a job runs at most four programs after its own".into());
    }
    asked
        .iter()
        .map(|t| {
            let (_, path) = found.beside.iter().find(|(n, _)| *n == t.program).ok_or_else(|| format!("{label} has no {} beside it to run", t.program))?;
            if !runnable(path) {
                return Err(format!("{} is not found beside {label}", t.program));
            }
            Ok(Then { name: t.program.clone(), program: path.to_string_lossy().into_owned(), args: t.args.clone() })
        })
        .collect()
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

/// Every copy of a program installed separately there is, in order: where
/// the chemist located it, where that is still a program of its file's name -
/// or a macOS app that holds it (`Blender.app`: its `Contents/MacOS`) - that
/// alone, `exact`; then each of its file's name where the system finds
/// programs (`path_var`: PATH, as Meno was given it); then in the folders it
/// is usually installed in, the newest first.
pub fn installed_found(decl: &Installed, located: Option<&str>, path_var: Option<&std::ffi::OsStr>, bases: &Bases, exact: bool) -> Vec<PathBuf> {
    let is_it = |p: &Path| p.is_absolute() && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.eq_ignore_ascii_case(&decl.file)) && runnable(p);
    let mut out: Vec<PathBuf> = Vec::new();
    if let Some(p) = located.map(Path::new) {
        let inside = p.extension().is_some_and(|e| e.eq_ignore_ascii_case("app")) && p.is_dir();
        let p = if inside { p.join("Contents").join("MacOS").join(&decl.file) } else { p.to_path_buf() };
        if is_it(&p) {
            out.push(p);
        }
    }
    if exact {
        return out;
    }
    let on_path = path_var.into_iter().flat_map(std::env::split_paths).filter(|d| d.is_absolute()).map(|d| d.join(&decl.file));
    let usual = decl.places.iter().flat_map(|t| usual_folders(t, bases)).map(|d| d.join(&decl.file));
    for p in on_path.chain(usual) {
        if runnable(&p) && !out.iter().any(|q| same_file(q, &p)) {
            out.push(p);
        }
    }
    out
}

/// Whether two paths are one file.
fn same_file(a: &Path, b: &Path) -> bool {
    a == b || matches!((a.canonicalize(), b.canonicalize()), (Ok(x), Ok(y)) if x == y)
}

/// A program installed separately, chosen: where it is, its version where
/// it says one, and why it cannot be run, where it is too old for Meno.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Chosen {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
}

/// The copy of a program installed separately a job runs - of those there
/// are (`installed_found`), each asked its version by `probe` where its rule
/// says how: where it was located, where that one is new enough; else the
/// newest that is; else the first there is, with why it cannot be run. None,
/// where there is none.
pub fn installed_choice(
    decl: &Installed,
    located: Option<&str>,
    path_var: Option<&std::ffi::OsStr>,
    bases: &Bases,
    exact: bool,
    probe: &dyn Fn(&Path, &VersionRule) -> Option<String>,
) -> Option<Chosen> {
    let found = installed_found(decl, located, path_var, bases, exact);
    let first = found.first()?.clone();
    let chosen = |p: &Path, version: Option<String>, why: Option<String>| Chosen { path: p.to_string_lossy().into_owned(), version, why };
    let Some(rule) = &decl.version else {
        return Some(chosen(&first, None, None));
    };
    let fits = |v: &Option<String>| v.as_deref().is_some_and(|v| version_cmp(v, &rule.least).is_ge());
    let versions: Vec<(PathBuf, Option<String>)> = found.into_iter().map(|p| {
        let v = probe(&p, rule);
        (p, v)
    }).collect();
    // (the one located, where it was found where it was located, and fits)
    let located_here = located.map(Path::new).is_some_and(|l| first.starts_with(l));
    if located_here && fits(&versions[0].1) {
        return Some(chosen(&versions[0].0, versions[0].1.clone(), None));
    }
    let newest = versions.iter().filter(|(_, v)| fits(v)).max_by(|(_, a), (_, b)| version_cmp(a.as_deref().unwrap_or("0"), b.as_deref().unwrap_or("0")));
    if let Some((p, v)) = newest {
        return Some(chosen(p, v.clone(), None));
    }
    let (p, v) = &versions[0];
    let why = match v {
        Some(v) => format!("Meno needs {} {} or later; this one is {}", decl.label, rule.least, v),
        None => format!("Meno needs {} {} or later, and cannot tell which version this one is", decl.label, rule.least),
    };
    Some(chosen(p, v.clone(), Some(why)))
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
    let chosen = installed_choice(&decl, located, path_var.as_deref(), &Bases::here(), false, &version_of).ok_or_else(|| format!("{name} is not found"))?;
    // (one too old for Meno: said, not run)
    if let Some(why) = chosen.why {
        return Err(why);
    }
    let program = PathBuf::from(chosen.path);
    let env = installed_env(&decl, &program, path_var.as_deref())?;
    let folder = program.parent().map(Path::to_path_buf).unwrap_or_default();
    let beside = decl.beside.iter().map(|(n, f)| (n.clone(), folder.join(f))).collect();
    Ok(Some(Found { program, activation: None, env, beside }))
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
    let root = crate::local_data_dir(app)?.join("jobs");
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
    /// Programs installed beside its own to run after it (`JobSpec::then`), by their names there.
    #[serde(default)]
    pub then: Vec<ThenAsk>,
}

/// A program installed beside a job's own, asked to run after it: by its name, with its arguments.
#[derive(Deserialize, Clone, Debug)]
pub struct ThenAsk {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// A job made and its runner started: its id. It waits its turn.
#[tauri::command]
pub async fn job_start(app: AppHandle, net: State<'_, crate::net::Net>, payload: JobAsk) -> Result<String, String> {
    let data = crate::local_data_dir(&app)?;
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
    let then = then_of(&found, &payload.program, &payload.then)?;

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
        then,
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

/// Where plugin `plugin`'s program `name`, installed separately, is, as a
/// job would take it (`installed_choice`): where the chemist located it -
/// that alone, `exact`, as Locate asks of what was picked - or where the
/// system finds programs, or where it is usually installed; with its version
/// and, where it is too old for Meno, why. None, where it is found nowhere.
#[tauri::command]
pub async fn program_where(app: AppHandle, plugin: String, name: String, located: Option<String>, exact: Option<bool>) -> Result<Option<Chosen>, String> {
    if !plugin_id(&plugin) {
        return Err(format!("not a plugin: {plugin}"));
    }
    let plugin_dir = crate::resource_path(&app, &Path::new("resources/plugins").join(&plugin))?;
    let decl = installed_named(&manifest_of(&plugin_dir, &plugin)?, &name, system())?.ok_or_else(|| format!("{plugin} declares no program {name}"))?;
    // (a program asked its version runs a moment: not on the async runtime's own threads)
    tauri::async_runtime::spawn_blocking(move || {
        let path_var = std::env::var_os("PATH");
        installed_choice(&decl, located.as_deref(), path_var.as_deref(), &Bases::here(), exact.unwrap_or(false), &version_of)
    })
    .await
    .map_err(|e| e.to_string())
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

/// How many of the jobs in `root` wait or run: those whose runners are
/// there, or are starting.
pub fn under_way(root: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(root) else { return 0 };
    entries.flatten().filter(|e| current_record(&e.path()).is_some_and(|r| !r.state.finished())).count() as u32
}

/// How many of Meno's jobs wait or run - every workspace's, open or not.
pub fn under_way_now(app: &AppHandle) -> u32 {
    jobs_root(app).map(|root| under_way(&root)).unwrap_or(0)
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
            then: vec![],
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

    /// The system's shell, and the flag that gives it a script.
    fn shell_program() -> (String, &'static str) {
        #[cfg(unix)]
        return ("/bin/sh".to_string(), "-c");
        #[cfg(windows)]
        return (std::env::var("ComSpec").unwrap_or_else(|_| r"C:\Windows\System32\cmd.exe".into()), "/C");
    }

    #[cfg(unix)]
    const AFTER: &str = "echo made > after.txt; echo after it";
    #[cfg(windows)]
    const AFTER: &str = "echo made>after.txt&echo after it";

    #[test]
    fn runs_the_programs_beside_its_own_after_it_where_it_ended_well_what_they_say_kept_apart() {
        let root = temp();
        let (program, flag) = shell_program();
        let then = |script: &str| Then { name: "after".into(), program: program.clone(), args: vec![flag.into(), script.into()] };
        let with = |dir: &Path, then: Vec<Then>| {
            let spec = JobSpec { then, ..read_spec(dir).unwrap() };
            fs::write(dir.join(SPEC), serde_json::to_string(&spec).unwrap()).unwrap();
        };
        let ok = shell(&root, ECHO, 1);
        with(&ok, vec![then(AFTER)]);
        assert_eq!(run_job(&ok), 0);
        assert_eq!(current_record(&ok).unwrap().state, JobState::Done);
        assert_eq!(read_work_file(&ok, "after.txt").unwrap().trim_end(), "made");
        // (its log is its own program's output alone)
        assert_eq!(read_log(&ok, 0, LOG_MOST).0.replace('\r', ""), "input\nhello\n");
        assert_eq!(fs::read_to_string(ok.join(AFTER_LOG)).unwrap().trim_end(), "after it");

        // one that fails, or cannot start, leaves the job done
        let failing = shell(&root, ECHO, 1);
        let missing = Then { name: "gone".into(), program: root.join("no-such-program").to_string_lossy().into_owned(), args: vec![] };
        with(&failing, vec![then(FAIL), missing, then(AFTER)]);
        run_job(&failing);
        assert_eq!(current_record(&failing).unwrap().state, JobState::Done);
        assert!(fs::read_to_string(failing.join(AFTER_LOG)).unwrap().contains("gone could not be started"));
        assert!(read_work_file(&failing, "after.txt").is_ok());

        // after its own failed: none
        let bad = shell(&root, FAIL, 1);
        with(&bad, vec![then(AFTER)]);
        run_job(&bad);
        assert_eq!(current_record(&bad).unwrap().state, JobState::Failed);
        assert!(read_work_file(&bad, "after.txt").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn runs_after_its_own_only_a_program_declared_beside_it_and_there() {
        let root = temp();
        let (program, _) = shell_program();
        let found = |beside: Vec<(String, PathBuf)>| Found { program: PathBuf::from(&program), activation: None, env: vec![], beside };
        let ask = |name: &str| ThenAsk { program: name.into(), args: vec!["input".into(), "-molden".into()] };
        let there = found(vec![("orca_2mkl".into(), PathBuf::from(&program))]);
        assert_eq!(then_of(&there, "orca", &[ask("orca_2mkl")]).unwrap(), vec![Then { name: "orca_2mkl".into(), program: program.clone(), args: vec!["input".into(), "-molden".into()] }]);
        assert!(then_of(&there, "orca", &[ask("orca_2aim")]).unwrap_err().contains("no orca_2aim beside it"));
        let gone = found(vec![("orca_2mkl".into(), root.join("orca_2mkl"))]);
        assert!(then_of(&gone, "orca", &[ask("orca_2mkl")]).unwrap_err().contains("not found beside orca"));
        assert!(then_of(&there, "orca", &vec![ask("orca_2mkl"); 5]).is_err());
        assert_eq!(then_of(&there, "orca", &[]).unwrap(), vec![]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_the_programs_installed_beside_one_for_this_system() {
        let m = |beside: serde_json::Value| serde_json::json!({"installed": [{"name": "orca", "files": {"macos": "orca", "windows": "orca.exe"}, "beside": beside}]});
        let orca = installed_named(&m(serde_json::json!({"orca_2mkl": {"macos": "orca_2mkl", "windows": "orca_2mkl.exe"}})), "orca", "windows").unwrap().unwrap();
        assert_eq!(orca.beside, vec![("orca_2mkl".to_string(), "orca_2mkl.exe".to_string())]);
        // (one not made for this system: none here)
        assert_eq!(installed_named(&m(serde_json::json!({"orca_2mkl": {"windows": "orca_2mkl.exe"}})), "orca", "macos").unwrap().unwrap().beside, vec![]);
        // (never a path, a shell, or a name that is not one)
        for bad in [serde_json::json!({"x": {"macos": "../x"}}), serde_json::json!({"x": {"macos": "sh"}}), serde_json::json!({"../x": {"macos": "x"}}), serde_json::json!(["x"]), serde_json::json!({"x": "x"})] {
            assert!(installed_named(&m(bad.clone()), "orca", "macos").is_err(), "{bad}");
        }
    }

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
    fn counts_the_jobs_that_wait_or_run() {
        let root = temp();
        assert_eq!(under_way(&root), 0);
        assert_eq!(under_way(&root.join("not there")), 0);
        // (its runner starting: waiting)
        shell(&root, ECHO, 1);
        // (running, its runner there)
        let running = shell(&root, ECHO, 1);
        let lock = OpenOptions::new().create(true).truncate(false).write(true).open(running.join(RUNNER_LOCK)).unwrap();
        lock.lock().unwrap();
        write_record(&running, &JobRecord::new(JobState::Running, 1)).unwrap();
        // (done; and recorded running by a runner that is gone)
        let done = shell(&root, ECHO, 1);
        write_record(&done, &JobRecord { ended: Some(3), code: Some(0), ..JobRecord::new(JobState::Done, 1) }).unwrap();
        let gone = shell(&root, ECHO, 1);
        write_record(&gone, &JobRecord::new(JobState::Running, 1)).unwrap();
        // (and what is not a job's folder)
        fs::create_dir_all(root.join("not a job")).unwrap();
        fs::write(root.join(QUEUE_LOCK), b"").unwrap();
        assert_eq!(under_way(&root), 2);
        drop(lock);
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
    fn runs_meno_s_own_copy_of_a_program_the_plugin_fetched_as_it_was_set_up() {
        let base = temp();
        let dir = base.join("plugins").join("demo");
        fs::create_dir_all(&dir).unwrap();
        let sha = "a".repeat(64);
        let manifest = serde_json::json!({"id": "demo", "name": "Demo", "roles": [{"role": "render", "programs": ["blender"]}],
            "downloads": [{"file": "blender-x.tar.xz", "url": "https://h/b", "sha256": sha, "bytes": 1, "system": system(),
                "unpack": "tar.xz", "program": "*/blender", "provides": "blender"}]});
        fs::write(dir.join("manifest.json"), manifest.to_string()).unwrap();
        let data = base.join("data");
        // (not unpacked whole: said, not looked for in its environment)
        assert_eq!(plugin_program(&data, &dir, "demo", "blender", &[]).unwrap_err(), "Demo is not set up");
        let folder = data.join("uv/plugin-demo/files/blender-x");
        let program = program_file(&folder.join("blender-5"), "blender");
        fs::write(folder.join(".meno-unpacked"), &sha).unwrap();
        let found = plugin_program(&data, &dir, "demo", "blender", &[]).unwrap();
        assert_eq!(found.program, program);
        assert!(found.activation.is_none() && found.env.is_empty());
        let _ = fs::remove_dir_all(base);
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

    /// The first copy of a program there is, as a job without a version to check takes it.
    fn installed_where(decl: &Installed, located: Option<&str>, path_var: Option<&std::ffi::OsStr>, bases: &Bases) -> Option<PathBuf> {
        installed_found(decl, located, path_var, bases, false).into_iter().next()
    }

    #[test]
    fn finds_a_program_installed_separately_where_it_was_located_or_where_programs_are() {
        let base = temp();
        let decl = Installed { name: "orca".into(), file: "orca".into(), path: vec!["{folder}".into()], env: vec![("ORCA_HOME".into(), vec!["{parent}".into()])], places: vec![], label: "ORCA".into(), version: None, beside: vec![] };
        let none = Bases::default();
        let installed = program_file(&base.join("apps").join("orca_6"), "orca");
        let on_path = program_file(&base.join("bin"), "orca");
        let path_var = std::env::join_paths([base.join("nowhere"), base.join("bin")]).unwrap();
        // where it was located; else where the system finds programs
        assert_eq!(installed_where(&decl, installed.to_str(), Some(&path_var), &none), Some(installed.clone()));
        assert_eq!(installed_where(&decl, None, Some(&path_var), &none), Some(on_path.clone()));
        // a place located that is not it - another file's name, gone, not absolute - is passed over
        let other = program_file(&base.join("apps"), "other");
        assert_eq!(installed_where(&decl, other.to_str(), Some(&path_var), &none), Some(on_path));
        assert_eq!(installed_where(&decl, Some("orca"), None, &none), None);
        assert_eq!(installed_where(&decl, base.join("gone").join("orca").to_str(), None, &none), None);
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
        let decl = Installed { name: "g16".into(), file: "g16".into(), path: vec![], env: vec![], places: vec![], label: "x".into(), version: None, beside: vec![] };
        let p = base.join("g16");
        fs::create_dir_all(&base).unwrap();
        fs::write(&p, "").unwrap();
        assert_eq!(installed_where(&decl, p.to_str(), None, &Bases::default()), None);
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
        let m: serde_json::Value = serde_json::from_str(r#"{"steps": [{"kinds": ["optimise", "energy"], "programs": ["a", {"name": "b"}]}, {"kinds": ["energy"]}, {"programs": [3, "c"]}], "roles": [{"role": "render", "programs": ["d"]}, {"role": "checks"}]}"#).unwrap();
        // (by name only, as the manifest's reader takes them: its steps', then its roles')
        assert_eq!(programs_named(&m), vec!["a", "c", "d"]);
        assert!(programs_named(&serde_json::json!({})).is_empty());
    }

    #[test]
    fn reads_the_places_a_program_is_usually_installed_in() {
        let m = serde_json::json!({"installed": [{
            "name": "blender", "files": {"macos": "Blender", "windows": "blender.exe"},
            "places": {"macos": ["/Applications/Blender.app/Contents/MacOS", "{home}/Applications/Blender.app/Contents/MacOS"], "windows": ["{programs}/Blender Foundation/Blender *"]}
        }]});
        assert_eq!(installed_named(&m, "blender", "macos").unwrap().unwrap().places.len(), 2);
        assert_eq!(installed_named(&m, "blender", "windows").unwrap().unwrap().places, vec!["{programs}/Blender Foundation/Blender *"]);
        let one = |place: &str| installed_named(&serde_json::json!({"installed": [{"name": "p", "files": {"linux": "p"}, "places": {"linux": [place]}}]}), "p", "linux");
        for place in ["/opt/p", "{home}", "{home}/p", "{programs}/P */bin"] {
            assert!(one(place).is_ok(), "{place}");
        }
        // never relative, never above, one * a folder at most, no token but at its start
        for place in ["opt/p", "/opt/../p", "/opt/./p", "{folder}/p", "{home}p", "/a/**/p", "/a/{home}", "C:\\p", "/a//p"] {
            assert!(one(place).is_err(), "{place}");
        }
    }

    #[test]
    fn finds_a_program_where_it_is_usually_installed_the_newest_first() {
        let base = temp();
        let file = if cfg!(windows) { "blender.exe" } else { "blender" };
        let older = program_file(&base.join("Blender Foundation").join("Blender 4.5"), file);
        let newer = program_file(&base.join("Blender Foundation").join("Blender 10.0"), file);
        let place = |t: &str| Installed { name: "blender".into(), file: file.into(), path: vec![], env: vec![], places: vec![t.into()], label: "x".into(), version: None, beside: vec![] };
        let bases = Bases { home: Some(base.clone()), programs: Some(base.clone()) };
        assert_eq!(installed_where(&place("{programs}/Blender Foundation/Blender *"), None, None, &bases), Some(newer.clone()));
        assert_eq!(installed_where(&place("{home}/Blender Foundation/Blender 4.5"), None, None, &bases), Some(older));
        // a base this computer has none of; a folder that is not there
        assert_eq!(installed_where(&place("{programs}/Blender Foundation/Blender *"), None, None, &Bases::default()), None);
        assert_eq!(installed_where(&place("{home}/Elsewhere/*"), None, None, &bases), None);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_macos_app_located_stands_for_the_program_inside_it() {
        let base = temp();
        let app = base.join("Blender.app");
        let inside = program_file(&app.join("Contents").join("MacOS"), "Blender");
        let decl = Installed { name: "blender".into(), file: "Blender".into(), path: vec![], env: vec![], places: vec![], label: "x".into(), version: None, beside: vec![] };
        assert_eq!(installed_where(&decl, app.to_str(), None, &Bases::default()), Some(inside));
        // an app that holds no such program
        let other = base.join("Other.app");
        fs::create_dir_all(&other).unwrap();
        assert_eq!(installed_where(&decl, other.to_str(), None, &Bases::default()), None);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn reads_how_a_program_says_its_version() {
        let m = serde_json::json!({"installed": [{"name": "blender", "label": "Blender", "files": {"linux": "blender"}, "version": {"args": ["--version"], "after": "Blender ", "least": "5.0"}}]});
        let decl = installed_named(&m, "blender", "linux").unwrap().unwrap();
        assert_eq!(decl.label, "Blender");
        assert_eq!(decl.version, Some(VersionRule { args: vec!["--version".into()], after: "Blender ".into(), least: "5.0".into() }));
        // (an option, never a file or a path; something to find; a version)
        let one = |v: serde_json::Value| installed_named(&serde_json::json!({"installed": [{"name": "p", "files": {"linux": "p"}, "version": v}]}), "p", "linux");
        for bad in [
            serde_json::json!({"args": ["scene.blend"], "after": "P ", "least": "1"}),
            serde_json::json!({"args": ["--python=/tmp/x.py"], "after": "P ", "least": "1"}),
            serde_json::json!({"args": [], "after": "P ", "least": "1"}),
            serde_json::json!({"args": ["-v"], "after": "", "least": "1"}),
            serde_json::json!({"args": ["-v"], "after": "P ", "least": "five"}),
        ] {
            assert!(one(bad.clone()).is_err(), "{bad}");
        }
    }

    #[test]
    fn reads_and_compares_versions() {
        let rule = VersionRule { args: vec!["--version".into()], after: "Blender ".into(), least: "5.0".into() };
        assert_eq!(version_in("Blender 5.2.2 LTS\n\tbuild date: 2026-09-15\n", &rule), Some("5.2.2".into()));
        assert_eq!(version_in("Read prefs\n  Blender 4.1.1\n", &rule), Some("4.1.1".into()));
        assert_eq!(version_in("Blender\nno version\n", &rule), None);
        assert!(version_cmp("5.2.2", "5.0").is_gt());
        assert!(version_cmp("5.0", "5.0.0").is_eq());
        assert!(version_cmp("4.10", "5.0").is_lt());
        assert!(version_cmp("10.0", "5.2").is_gt());
    }

    #[test]
    fn chooses_the_newest_copy_new_enough_and_says_why_an_old_one_is_not() {
        let base = temp();
        let file = if cfg!(windows) { "blender.exe" } else { "blender" };
        let old = program_file(&base.join("Blender Foundation").join("Blender 4.1"), file);
        let new = program_file(&base.join("Blender Foundation").join("Blender 5.2"), file);
        let newer_unsupported_name = program_file(&base.join("elsewhere"), file);
        // (each copy says its version by where it is: as the probe would run it)
        let said = |p: &Path, _: &VersionRule| -> Option<String> {
            let s = p.to_string_lossy();
            if s.contains("Blender 4.1") { Some("4.1.1".into()) } else if s.contains("Blender 5.2") { Some("5.2.2".into()) } else { None }
        };
        let decl = |places: Vec<String>| Installed {
            name: "blender".into(),
            file: file.into(),
            path: vec![],
            env: vec![],
            places,
            label: "Blender".into(),
            version: Some(VersionRule { args: vec!["--version".into()], after: "Blender ".into(), least: "5.0".into() }),
            beside: vec![],
        };
        let bases = Bases { home: None, programs: Some(base.clone()) };
        let everywhere = decl(vec!["{programs}/Blender Foundation/Blender *".into()]);
        // the newest new enough, of those found
        let c = installed_choice(&everywhere, None, None, &bases, false, &said).unwrap();
        assert_eq!((PathBuf::from(&c.path), c.version.as_deref(), c.why.as_deref()), (new.clone(), Some("5.2.2"), None));
        // one too old, located: passed over for one new enough; asked of alone (Locate), why it will not do
        let c = installed_choice(&everywhere, old.to_str(), None, &bases, false, &said).unwrap();
        assert_eq!(PathBuf::from(&c.path), new);
        let c = installed_choice(&everywhere, old.to_str(), None, &bases, true, &said).unwrap();
        assert_eq!(c.why.as_deref(), Some("Meno needs Blender 5.0 or later; this one is 4.1.1"));
        // only one too old there: it, and why
        let only_old = decl(vec!["{programs}/Blender Foundation/Blender 4.1".into()]);
        let c = installed_choice(&only_old, None, None, &bases, false, &said).unwrap();
        assert_eq!((PathBuf::from(&c.path), c.why.as_deref()), (old.clone(), Some("Meno needs Blender 5.0 or later; this one is 4.1.1")));
        // one that says no version it can be read by
        let c = installed_choice(&only_old, newer_unsupported_name.to_str(), None, &bases, true, &said).unwrap();
        assert!(c.why.unwrap().contains("cannot tell which version"));
        // none there: none
        assert_eq!(installed_choice(&decl(vec![]), None, None, &Bases::default(), false, &said), None);
        let _ = fs::remove_dir_all(base);
    }

    #[cfg(unix)]
    #[test]
    fn asks_a_program_its_version_once_for_each_file_as_it_is() {
        let base = temp();
        let p = program_file(&base, "blender");
        fs::write(&p, "#!/bin/sh\necho \"Blender 5.2.2 LTS\"\n").unwrap();
        let rule = VersionRule { args: vec!["--version".into()], after: "Blender ".into(), least: "5.0".into() };
        assert_eq!(version_of(&p, &rule), Some("5.2.2".into()));
        // (one that says nothing it can be read by)
        let q = program_file(&base.join("other"), "blender");
        fs::write(&q, "#!/bin/sh\necho hello\n").unwrap();
        assert_eq!(version_of(&q, &rule), None);
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn compares_names_as_a_person_reads_them() {
        let mut names = vec!["Blender 4.5", "Blender 10.0", "Blender 5.2", "Blender 5.10"];
        names.sort_by(|a, b| natural(a, b));
        assert_eq!(names, vec!["Blender 4.5", "Blender 5.2", "Blender 5.10", "Blender 10.0"]);
    }
}
