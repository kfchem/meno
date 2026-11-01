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
//! only with a script of the plugin's - and reaches no network. Its runner
//! asks the same again of what its folder says (`spec_allowed`), and takes
//! only a folder in Meno's data folder's `jobs`: anything can write a
//! `job.json`, and start Meno's executable with it.

use crate::pixienv;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
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
/// What this computer's jobs may use at once (`Limits`), as Settings says: written beside them, read by every runner.
const LIMITS: &str = ".limits.json";

/// How often a waiting job looks for its turn, and a running one at its program and for a stop.
const WAIT_STEP: Duration = Duration::from_millis(400);
const RUN_STEP: Duration = Duration::from_millis(200);
/// How often they look while what they look for is new - a program just
/// started, a job just at the head of the queue: a quick one seen to end, or
/// its turn seen to come, as soon as it does - for how long, and by when
/// they are back at their steps.
const QUICK_STEP: Duration = Duration::from_millis(50);
const QUICK_FOR: Duration = Duration::from_secs(3);
const EASED_BY: Duration = Duration::from_secs(6);

/// How long to wait before looking again, `young` into what is looked for:
/// `QUICK_STEP` for its first `QUICK_FOR`, then more each time, linearly,
/// until `settled` - the step a look took before - by `EASED_BY`, and from
/// then on. What runs on costs to look at no more than it did.
fn step_at(young: Duration, settled: Duration) -> Duration {
    let quick = QUICK_STEP.min(settled);
    if young <= QUICK_FOR {
        return quick;
    }
    if young >= EASED_BY {
        return settled;
    }
    let f = (young - QUICK_FOR).as_secs_f64() / (EASED_BY - QUICK_FOR).as_secs_f64();
    quick + (settled - quick).mul_f64(f)
}
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
    /// The cores it takes - its plugin given them, its program told (`THREADS`) - as the queue counts it. A program
    /// that runs as processes (`processes`) is given them as its processes, each told one thread.
    #[serde(default = "one_core")]
    pub cores: u32,
    /// Whether its program runs in parallel as processes - one to a core, each a thread (MPI: ORCA's `%pal`) - as its
    /// plugin declares it (`installed[].parallel`): each counted by the queue as a whole core, not one of its threads.
    #[serde(default, skip_serializing_if = "is_false")]
    pub processes: bool,
    /// The memory it takes, in MiB, where its plugin declared it; none declared, nought: counted by its cores alone.
    #[serde(default)]
    pub memory: u64,
    /// When it was asked for, in milliseconds since 1970: the order jobs start in.
    pub created: u64,
    /// What it is called, in words - its entry's, its step's (`water optimise`): its folder named from it, path-safe.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Its key, as Meno worked it out when it asked for it (lib/jobKeys): what Meno checks a job it takes up by.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Programs installed beside its own, run after it in turn where it ended
    /// well - ORCA's orca_2mkl, writing its orbitals as a Molden file - each
    /// in its work folder, given what it was given, what they say kept apart.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub then: Vec<Then>,
    /// Other plugins whose programs it needs, by id (`Need`): only which - what each is, and what it is given as, its
    /// runner works out again from the plugins themselves (`needs_given`), never from here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub needs: Vec<String>,
    /// Preset plugins whose files it was handed, by id (`presets_given`): copied into its work folder, each in
    /// `preset/<id>/`, never listed among its files - what each is, its runner works out again from the plugins.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub presets: Vec<String>,
    /// The files it was given, by their paths in its work folder (`make_job` writes them): what is kept of it where what
    /// its program made is taken out (`trim_made`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub given: Vec<String>,
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

fn one_core() -> u32 {
    1
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// What this computer's jobs may use at once (docs/WORKFLOWS-FOUNDATION.md,
/// *This computer's runner knows its resources*): cores, and memory in MiB.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct Limits {
    pub cores: u32,
    pub memory: u64,
}

/// What this computer has: its cores - each a thread its system runs at once, two to a physical core where it
/// runs two on each - its physical cores (`physical`), and its memory in MiB (nought where it could not be told).
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct Resources {
    pub cores: u32,
    pub physical: u32,
    pub memory: u64,
}

/// This computer's cores, physical cores and memory: its physical cores never more than its cores, and at least one -
/// its cores where the system could not say.
pub fn computer() -> Resources {
    let cores = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1);
    let physical = physical_cores().filter(|&p| p >= 1).map_or(cores, |p| p.min(cores));
    Resources { cores, physical, memory: total_memory() / (1024 * 1024) }
}

/// How many of the queue's cores a job takes: its cores - or, a program running as processes (`JobSpec::processes`),
/// each process a whole physical core: its processes times the threads the computer runs on each (`here`).
fn taken(spec: &JobSpec, here: Resources) -> u32 {
    let cores = spec.cores.max(1);
    if !spec.processes {
        return cores;
    }
    cores.saturating_mul(here.cores.max(1).div_ceil(here.physical.max(1)))
}

/// What jobs may use, Settings unsaid: all the cores, and three quarters of the memory.
fn default_limits() -> Limits {
    let here = computer();
    Limits { cores: here.cores.max(1), memory: here.memory / 4 * 3 }
}

/// What the jobs in `root` may use at once, as last written there; the defaults where nothing is.
fn limits_in(root: &Path) -> Limits {
    fs::read_to_string(root.join(LIMITS))
        .ok()
        .and_then(|t| serde_json::from_str::<Limits>(&t).ok())
        .filter(|l| l.cores >= 1)
        .unwrap_or_else(default_limits)
}

/// Whether a job of `cores` and `memory` may start beside those running, using `used`: none running, always - a
/// job larger than the limits runs alone, never never; else where it fits within what is left. Memory of nought,
/// either way, counts for nothing: a job that declares none, or limits with none (the computer's not told).
fn fits(limits: Limits, used: (u32, u64), running: u32, cores: u32, memory: u64) -> bool {
    running == 0 || (used.0 + cores.max(1) <= limits.cores && (memory == 0 || limits.memory == 0 || used.1 + memory <= limits.memory))
}

/// Why a job of `cores` and `memory` (MiB) cannot run on `here` at all - it asks for more than the computer has,
/// and would only swap or fail inside its program - in plain words; none where it can.
pub fn beyond(here: Resources, cores: u32, memory: u64) -> Option<String> {
    let gb = |mib: u64| format!("{:.1} GB", mib as f64 / 1024.0);
    if cores > here.cores {
        return Some(format!("it asks for {cores} cores, and this computer has {}", here.cores));
    }
    if here.memory > 0 && memory > here.memory {
        return Some(format!("it asks for {} of memory, and this computer has {}", gb(memory), gb(here.memory)));
    }
    None
}

/// How many jobs of `spec`'s size run at once within `limits`: what a waiting one's pace is reckoned by.
fn slots_for(limits: Limits, spec: &JobSpec) -> u32 {
    (limits.cores / taken(spec, computer())).max(1)
}

/// This computer's memory, in bytes: what the system says it has; nought where it could not be asked.
#[cfg(target_os = "macos")]
fn total_memory() -> u64 {
    let mut bytes: u64 = 0;
    let mut size = std::mem::size_of::<u64>();
    let name = c"hw.memsize";
    let ok = unsafe { libc::sysctlbyname(name.as_ptr(), (&mut bytes as *mut u64).cast(), &mut size, std::ptr::null_mut(), 0) };
    if ok == 0 { bytes } else { 0 }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn total_memory() -> u64 {
    // (/proc/meminfo's first line: "MemTotal:  16314764 kB")
    fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|t| t.lines().find(|l| l.starts_with("MemTotal:")).and_then(|l| l.split_whitespace().nth(1)?.parse::<u64>().ok()))
        .map(|kb| kb * 1024)
        .unwrap_or(0)
}

#[cfg(windows)]
fn total_memory() -> u64 {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut status) } != 0 { status.ullTotalPhys } else { 0 }
}

/// This computer's physical cores, as its system says: none where it could not be asked.
#[cfg(target_os = "macos")]
fn physical_cores() -> Option<u32> {
    let mut n: i32 = 0;
    let mut size = std::mem::size_of::<i32>();
    let name = c"hw.physicalcpu";
    let ok = unsafe { libc::sysctlbyname(name.as_ptr(), (&mut n as *mut i32).cast(), &mut size, std::ptr::null_mut(), 0) };
    (ok == 0 && n > 0).then_some(n as u32)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn physical_cores() -> Option<u32> {
    // (each logical CPU's package and core, as the kernel's topology gives them: the distinct pairs are the physical cores)
    let mut cores = std::collections::BTreeSet::new();
    for cpu in fs::read_dir("/sys/devices/system/cpu").ok()?.flatten() {
        let name = cpu.file_name();
        let name = name.to_string_lossy();
        if !name.strip_prefix("cpu").is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())) {
            continue;
        }
        let read = |f: &str| fs::read_to_string(cpu.path().join("topology").join(f)).ok().map(|t| t.trim().to_string());
        if let (Some(package), Some(core)) = (read("physical_package_id"), read("core_id")) {
            cores.insert((package, core));
        }
    }
    (!cores.is_empty()).then_some(cores.len() as u32)
}

#[cfg(windows)]
fn physical_cores() -> Option<u32> {
    use windows_sys::Win32::System::SystemInformation::{GetLogicalProcessorInformationEx, RelationProcessorCore};
    // (a record for each processor core - asked for those alone - each beginning with its kind and its size, in bytes:
    //  asked once for the size of them all, then for them, and counted by their sizes)
    let mut len: u32 = 0;
    unsafe { GetLogicalProcessorInformationEx(RelationProcessorCore, std::ptr::null_mut(), &mut len) };
    if len == 0 {
        return None;
    }
    let mut buf = vec![0u8; len as usize];
    if unsafe { GetLogicalProcessorInformationEx(RelationProcessorCore, buf.as_mut_ptr().cast(), &mut len) } == 0 {
        return None;
    }
    let (mut at, mut n) = (0usize, 0u32);
    while at + 8 <= (len as usize).min(buf.len()) {
        let size = u32::from_ne_bytes(buf[at + 4..at + 8].try_into().ok()?) as usize;
        if size == 0 {
            break;
        }
        n += 1;
        at += size;
    }
    (n > 0).then_some(n)
}

fn read_spec(dir: &Path) -> Option<JobSpec> {
    serde_json::from_str(&fs::read_to_string(dir.join(SPEC)).ok()?).ok()
}

/// The folders in a job's work folder that hold what preset plugins handed it (`presets_given`), one for each its spec
/// names (`preset/<id>/`): never its own files - never kept, nor saved in a workspace.
pub fn handed_folders(dir: &Path) -> Vec<String> {
    read_spec(dir).map(|spec| spec.presets.iter().map(|p| format!("{PRESET_DIR}/{p}/")).collect()).unwrap_or_default()
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

/// What is said of a job's folder holding what it was to run but no record of how it ran (lib's `NO_RECORD`).
const NO_RECORD: &str = "it has no record of how it ran";

/// A job's record as it is now - none where its folder is not a job's (yet).
/// One whose record says it is waiting or running, but whose runner is gone,
/// is gone, and is recorded so; one with no record past its start, gone,
/// saying so (`NO_RECORD`).
pub fn current_record(dir: &Path) -> Option<JobRecord> {
    let created = read_spec(dir)?.created;
    let Some(record) = read_record(dir) else {
        // (its runner starting: waiting, for a while - then a folder with no record, said so: Meno cannot account for it)
        if now_ms().saturating_sub(created) < STARTING_MS {
            return Some(JobRecord::new(JobState::Waiting, created));
        }
        return Some(JobRecord { why: Some(NO_RECORD.into()), ..JobRecord::new(JobState::Gone, created) });
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

/// Whether the job is to stop: asked to (its `stop` file), or its runner asked to go.
fn stop_asked(dir: &Path) -> bool {
    GOING.load(Ordering::SeqCst) || dir.join(STOP).exists()
}

/// Set once the runner is asked to go (macOS, Linux: SIGTERM, SIGINT or
/// SIGHUP - a logout, `kill`, Activity Monitor's Quit): it stops its job as
/// a stop does, and goes.
static GOING: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn asked_to_go(_: libc::c_int) {
    GOING.store(true, Ordering::SeqCst);
}

/// The runner asked to go stops its program and says so, rather than
/// going at once and leaving it running in its group of its own - its job
/// read as gone, its turn free for the next. (On Windows the job object
/// takes the program with the runner, however it goes.)
#[cfg(unix)]
fn listen_for_going() {
    unsafe {
        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = asked_to_go as extern "C" fn(libc::c_int) as libc::sighandler_t;
        action.sa_flags = libc::SA_RESTART;
        libc::sigemptyset(&mut action.sa_mask);
        for signal in [libc::SIGTERM, libc::SIGINT, libc::SIGHUP] {
            libc::sigaction(signal, &action, std::ptr::null_mut());
        }
    }
}

/// Sleeps `long` in slices of `WAIT_STEP` at most, waking as soon as a
/// slice ends with a stop asked: a job far back in the queue, asleep for
/// seconds between its looks, stops as quickly as one near its head.
/// (Only its own folder is looked at, with no lock.)
fn sleep_watching(dir: &Path, long: Duration) {
    let until = Instant::now() + long;
    loop {
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return;
        }
        std::thread::sleep(left.min(WAIT_STEP));
        if stop_asked(dir) {
            return;
        }
    }
}

/// Ask a job to stop: its runner stops its program and everything it started - or, not started yet, lets it go.
pub fn ask_stop(dir: &Path) -> std::io::Result<()> {
    fs::write(dir.join(STOP), b"")
}

/// Meno's executable started as a job's runner (`--job <folder>`): the job
/// run, and what the runner ends with. None where it was started as Meno.
/// A folder that is not a job of Meno's is not run, and nothing is written.
pub fn job_mode() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()? != JOB_FLAG {
        return None;
    }
    let dir = PathBuf::from(args.next()?);
    let (Some(data), Some(plugins)) = (data_dir_here(), plugins_here()) else { return Some(1) };
    // (asked to go, a runner stops its program as if asked to stop)
    #[cfg(unix)]
    listen_for_going();
    Some(runner(&data, &plugins, &dir))
}

/// Run the job in `dir` as its runner does, what it is to run taken as it is
/// (a test's own jobs): asked to go, stopped as if asked to stop.
#[cfg(test)]
pub fn run_as_runner(dir: &Path) -> i32 {
    #[cfg(unix)]
    listen_for_going();
    run_job(dir, &|_| Ok(()))
}

/// What a job's runner does with the folder it was given, Meno's data folder
/// being `data` and its plugins in `plugins`: the job run, where it is one
/// of Meno's (`runner_folder`) and runs what Meno would have it run (`spec_allowed`).
fn runner(data: &Path, plugins: &Path, dir: &Path) -> i32 {
    let Ok(dir) = runner_folder(data, dir) else { return 1 };
    // (checked before its program runs: its work folder holds what was written for it, and nothing else yet)
    run_job(&dir, &|spec| spec_allowed(data, plugins, spec, &work_files(&dir)).and_then(|()| needs_linked(&dir, data, plugins, spec)))
}

/// Run the job in `dir`: wait for its turn, run its program, and write down
/// how it ended - where what it is to run is `allowed`; else it fails, saying why.
pub fn run_job(dir: &Path, allowed: &dyn Fn(&JobSpec) -> Result<(), String>) -> i32 {
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
    // (checked as it was read: what runs is what was checked)
    if let Err(why) = allowed(&spec) {
        let record = JobRecord { ended: Some(now_ms()), why: Some(format!("Meno does not run it: {why}")), ..JobRecord::new(JobState::Failed, spec.created) };
        let _ = write_record(dir, &record);
        return 1;
    }
    let base = JobRecord::new(JobState::Waiting, spec.created);
    let end = |state: JobState, started: Option<u64>, code: Option<i32>, why: Option<String>| {
        let _ = write_record(dir, &JobRecord { state, started, ended: Some(now_ms()), code, why, ..base.clone() });
    };
    if write_record(dir, &base).is_err() {
        return 1;
    }

    // its turn: as many running as fit what jobs may use, those asked for
    // first first - looked for often from when it is at the head of the
    // queue, and at the old step behind it, so that a queue of many costs
    // what it did
    let mut at_head: Option<Instant> = None;
    let slots = dir.parent().map(|root| slots_for(limits_in(root), &spec)).unwrap_or(1);
    let mut unsure = 0;
    loop {
        if stop_asked(dir) {
            end(JobState::Stopped, None, None, None);
            return 0;
        }
        // (its folder taken away, or its record ended by another - written gone, say: no turn to wait for)
        if waits_no_more(&mut unsure, dir.join(SPEC).is_file(), read_record(dir).as_ref()) {
            return 1;
        }
        match take_turn(dir, &spec, &base) {
            Ok(Turn::Taken) => break,
            Ok(Turn::Next) => sleep_watching(dir, step_at(at_head.get_or_insert_with(Instant::now).elapsed(), WAIT_STEP)),
            Ok(Turn::Behind(ahead)) => {
                // (how long it has been near the head, not how long it has waited: one that came there from far back is new to it)
                let near = if near_head(ahead, slots) {
                    at_head.get_or_insert_with(Instant::now).elapsed()
                } else {
                    at_head = None;
                    Duration::ZERO
                };
                sleep_watching(dir, behind_step(ahead, slots, near))
            }
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
    let begun = Instant::now();
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
        // (often while it is young: a quick program seen to end as soon as it does)
        std::thread::sleep(step_at(begun.elapsed(), RUN_STEP));
    };
    program.stop(true);
    (status, stopping.is_some())
}

/// Whether a waiting runner is to wait no more, its job's spec `there` or
/// not and its record as read (`record`): where its record says it is no
/// longer waiting - ended by another - at once; where its folder or its
/// record cannot be found or read, only the second time running (`unsure`,
/// counted here), since another program may hold a file a moment - an
/// antivirus on Windows - and a waiting job is not given up on for that.
fn waits_no_more(unsure: &mut u32, there: bool, record: Option<&JobRecord>) -> bool {
    match (there, record) {
        (true, Some(r)) => {
            *unsure = 0;
            r.state != JobState::Waiting
        }
        _ => {
            *unsure += 1;
            *unsure >= 2
        }
    }
}

/// A waiting job's turn, as it looks: taken; next - the first waiting, its
/// turn to come as one running ends; or behind others waiting, so many of
/// them before it.
#[derive(Debug, PartialEq)]
enum Turn {
    Taken,
    Next,
    Behind(u32),
}

/// Whether a job `ahead` places back in a queue running `slots` at once is
/// near enough its head to look as the head does: its turn may come with
/// the next to end, or the one after. (Only the head takes a turn; so where
/// jobs end quickly, the one behind it is the head within moments.)
fn near_head(ahead: u32, slots: u32) -> bool {
    ahead < 2 * slots.max(1)
}

/// How long a waiting job sleeps behind `ahead` others waiting before it,
/// its queue running `slots` at once: as the head of the queue does near
/// it (`near_head`; `at_head` how long it has been there, `step_at`); at
/// `WAIT_STEP` among the next few (`NEAR_EACH` a slot, and `NEAR_MORE`);
/// further back, `PLACE_STEP` more for each place beyond, shared among the
/// slots - never longer than the queue takes to come so far, a job a third
/// of a second at the quickest - up to `BEHIND_MOST`. A queue of hundreds, each
/// runner looking at every job's folder under one lock every step, kept
/// that lock all but always held, and its head waiting on it: 150 jobs of
/// 0.06 s took 130 s to run one after another. (Timed from its first look,
/// not from when it came near the head, the head's quick step was long
/// over by then: the next started a quarter of a second after one ended.)
fn behind_step(ahead: u32, slots: u32, at_head: Duration) -> Duration {
    if near_head(ahead, slots) {
        return step_at(at_head, WAIT_STEP);
    }
    let slots = slots.max(1);
    let near = NEAR_EACH * slots + NEAR_MORE;
    if ahead < near {
        return WAIT_STEP;
    }
    (PLACE_STEP * (ahead - near + 1) / slots).min(BEHIND_MOST)
}

/// The places behind the head of the queue that look at the step of old, for each slot and besides; and the longest one further back sleeps.
const NEAR_EACH: u32 = 4;
const NEAR_MORE: u32 = 4;
const BEHIND_MOST: Duration = Duration::from_secs(10);
const PLACE_STEP: Duration = Duration::from_millis(300);

/// Whether it is this job's turn - the first waiting, and fitting beside
/// those running within what jobs may use (`fits`): a job never starts
/// ahead of one asked for before it, however small - and, where it is, the
/// job recorded running. Asked by one runner at a time.
fn take_turn(dir: &Path, spec: &JobSpec, base: &JobRecord) -> std::io::Result<Turn> {
    let root = dir.parent().ok_or_else(|| std::io::Error::other("a job's folder has no parent"))?;
    let queue = OpenOptions::new().create(true).truncate(false).write(true).open(root.join(QUEUE_LOCK))?;
    // (a runner asked to go takes its wait up again of itself - its signals
    // are heard with SA_RESTART, `listen_for_going` - so Unix gives no
    // Interrupted here; one given, on a system that does, is waited again)
    while let Err(e) = queue.lock() {
        if e.kind() != std::io::ErrorKind::Interrupted {
            return Err(e);
        }
    }
    let mut running = 0u32;
    let mut used = (0u32, 0u64);
    // (this computer's cores and physical cores, asked once: what a job running as processes is counted by)
    let here = computer();
    let mut first: Option<(u64, PathBuf)> = None;
    // (those waiting before it: asked for before it, or at once and by name)
    let mine_key = (base.created, dir.to_path_buf());
    let mut ahead = 0u32;
    for entry in fs::read_dir(root)?.flatten() {
        let other = entry.path();
        // (one being taken away is none of the queue's, whatever is left of it)
        if !other.is_dir() || entry.file_name().to_string_lossy().starts_with(TAKEN) {
            continue;
        }
        // (a finished job - most, after a few runs - as its own record says: nothing more read of it)
        if read_record(&other).is_some_and(|r| r.state.finished()) {
            continue;
        }
        let Some(record) = current_record(&other) else { continue };
        match record.state {
            JobState::Running => {
                running += 1;
                // (one whose spec cannot be read counted as a core: what any job takes at least)
                let (cores, memory) = read_spec(&other).map(|s| (taken(&s, here), s.memory)).unwrap_or((1, 0));
                used = (used.0 + cores, used.1 + memory);
            }
            JobState::Waiting => {
                let key = (record.created, other);
                if key < mine_key && key.1.file_name() != dir.file_name() {
                    ahead += 1;
                }
                if first.as_ref().is_none_or(|f| key < *f) {
                    first = Some(key);
                }
            }
            _ => {}
        }
    }
    let mine = first.is_some_and(|(_, p)| p.file_name() == dir.file_name());
    if !mine {
        return Ok(Turn::Behind(ahead));
    }
    if !fits(limits_in(root), used, running, taken(spec, here), spec.memory) {
        return Ok(Turn::Next);
    }
    write_record(dir, &JobRecord { state: JobState::Running, started: Some(now_ms()), ..base.clone() })?;
    Ok(Turn::Taken)
}

/// A running program, and the group - or job object - it and what it starts are in.
struct Program {
    child: std::process::Child,
    #[cfg(windows)]
    job: JobObject,
}

/// A job object, closed when this goes - and with it whatever is still in it
/// (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`): on every way out, never left open.
#[cfg(windows)]
struct JobObject(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for JobObject {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
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
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.job.0, 1);
        }
        let _ = self.child.kill();
    }
}

/// A program started in the job's work folder, given `env`, reading
/// `stdin` (a file in that folder) or nothing, what it says going to the
/// job's file `log`.
fn spawn_program(dir: &Path, program: &str, args: &[String], env: &BTreeMap<String, String>, stdin: Option<&str>, log: &str) -> std::io::Result<Program> {
    let log = OpenOptions::new().create(true).append(true).open(dir.join(log))?;
    let input = match stdin {
        None => Stdio::null(),
        // (as a file of the job's is read: by a path of no link, inside its work folder)
        Some(name) => Stdio::from(File::open(work_file(dir, name).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?)?),
    };
    let mut cmd = Command::new(program);
    // (a Python run reads and writes UTF-8, whatever the system's code page - where its spec says nothing else)
    crate::python_in_utf8(&mut cmd);
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
    #[cfg(unix)]
    let child = cmd.spawn()?;
    // (Windows: started held, put in its job object, then let go - so that
    // nothing it starts at once is started outside the job, and stays when
    // the job is stopped; one that cannot be let go is ended, its job object
    // closed with it)
    #[cfg(windows)]
    let (mut child, job) = start_held(&mut cmd)?;
    #[cfg(windows)]
    if !let_go(child.id()) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(std::io::Error::other("it could not be let go once started"));
    }
    Ok(Program {
        #[cfg(windows)]
        job,
        child,
    })
}

/// A process started held (CREATE_SUSPENDED) let go: each of its threads
/// resumed. Whether one was.
#[cfg(windows)]
fn let_go(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32};
    use windows_sys::Win32::System::Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME};
    unsafe {
        let threads = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if threads == INVALID_HANDLE_VALUE || threads.is_null() {
            return false;
        }
        let mut entry: THREADENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        let mut resumed = false;
        let mut more = Thread32First(threads, &mut entry) != 0;
        while more {
            if entry.th32OwnerProcessID == pid {
                let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                if !thread.is_null() {
                    resumed |= ResumeThread(thread) != u32::MAX;
                    CloseHandle(thread);
                }
            }
            more = Thread32Next(threads, &mut entry) != 0;
        }
        CloseHandle(threads);
        resumed
    }
}

/// A program started held - with no window, nothing of it run yet - and
/// put in a job object of its own. Where it cannot be put in one it is
/// ended, never having run: what it started would outlive Stop and the
/// runner.
#[cfg(windows)]
fn start_held(cmd: &mut Command) -> std::io::Result<(std::process::Child, JobObject)> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_SUSPENDED: u32 = 0x0000_0004;
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
    let mut child = cmd.spawn()?;
    match job_object_for(&child) {
        Ok(job) => Ok((child, job)),
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(std::io::Error::other(format!("it could not be put in a job object of its own: {e}")))
        }
    }
}

/// A job object holding the program - and so what it starts - which takes
/// them with it when it closes: when the runner goes, however it goes.
#[cfg(windows)]
fn job_object_for(child: &std::process::Child) -> std::io::Result<JobObject> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            return Err(std::io::Error::last_os_error());
        }
        // (closed on any way out from here)
        let job = JobObject(handle);
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            &info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            return Err(std::io::Error::last_os_error());
        }
        if AssignProcessToJobObject(job.0, child.as_raw_handle()) == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(job)
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

/// Whether the arguments `args` of a program installed separately - or of
/// one beside it - name no file but those written for its job (`written`),
/// or one of them by its name without its extension, as ORCA's orca_2mkl
/// takes `input` for `input.gbw`. Besides those, an argument may be an
/// option (`-nt`, `--silent`) or a number (`4`, `-1`, `0.5`), and nothing else.
pub fn names_only_written(args: &[String], written: &[String]) -> Result<(), String> {
    let option = |a: &str| {
        let name = a.strip_prefix("--").or_else(|| a.strip_prefix('-')).unwrap_or_default();
        name.starts_with(|c: char| c.is_ascii_alphabetic()) && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    };
    let number = |a: &str| {
        let digits = a.strip_prefix('-').unwrap_or(a);
        let (whole, part) = digits.split_once('.').unwrap_or((digits, "0"));
        !whole.is_empty() && !part.is_empty() && whole.chars().chain(part.chars()).all(|c| c.is_ascii_digit())
    };
    let file = |a: &str| inside_name(a) && written.iter().any(|w| w == a || Path::new(w).with_extension("") == Path::new(a));
    match args.iter().find(|a| !(option(a) || number(a) || file(a))) {
        Some(a) => Err(format!("{a} is not a file written for it")),
        None => Ok(()),
    }
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
    /// Whether it runs in parallel as processes, each a thread (`Installed::processes`).
    pub processes: bool,
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
    // (never a shell, by its name's stem: `cmd.exe` and `bash.exe` as `cmd` and `bash`)
    let single = Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name);
    let never = |n: &str| Path::new(n).file_stem().and_then(|s| s.to_str()).is_some_and(|s| NEVER.contains(&s.to_ascii_lowercase().as_str()));
    if !single || !inside_name(name) || never(name) {
        return Err(format!("not a program a job runs: {name}"));
    }
    let manifest = fs::read_to_string(plugin_dir.join("manifest.json")).map_err(|e| format!("{id}'s manifest: {e}"))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest).map_err(|e| format!("{id}'s manifest: {e}"))?;
    if !programs_named(&manifest).iter().any(|p| p == name) {
        return Err(format!("{id} names no program {name}"));
    }
    // (Meno's own copy, fetched as the plugin was set up)
    if let Some(program) = crate::plugfiles::provided(data, &manifest, id, name)? {
        return Ok(Found { program, activation: None, env: Vec::new(), beside: Vec::new(), processes: false });
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
    Ok(Found { program, activation, env: Vec::new(), beside: Vec::new(), processes: false })
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
    /// Whether it runs in parallel as processes (`parallel`: "processes" - MPI, ORCA's `%pal`), each process a core
    /// and a thread; else, "threads" or unsaid, as threads of one process.
    pub processes: bool,
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
    // (a group of its own, so that what it leaves running is ended with it)
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().ok()?;
    let mut out = child.stdout.take()?;
    // (what it prints read apart, so that a full pipe never holds it - and
    // waited for no longer than the program: a child it left holding the
    // pipe would hold the read for good; read as near as it can be where it is
    // not UTF-8: a banner in the system's code page lost the version with it)
    let (said, heard) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = out.read_to_end(&mut bytes);
        let _ = said.send(String::from_utf8_lossy(&bytes).into_owned());
    });
    let start = std::time::Instant::now();
    let ended = loop {
        match child.try_wait() {
            Ok(Some(_)) => break true,
            Ok(None) if start.elapsed() < VERSION_WAIT => std::thread::sleep(std::time::Duration::from_millis(30)),
            _ => break false,
        }
    };
    let end_group = |child: &mut std::process::Child| {
        #[cfg(unix)]
        // SAFETY: the group made for it above, by its id; ended, it is ended again to no effect.
        unsafe {
            libc::killpg(child.id() as libc::pid_t, libc::SIGKILL);
        }
        let _ = child.kill();
        let _ = child.wait();
    };
    if !ended {
        end_group(&mut child);
    }
    let grace = std::time::Duration::from_millis(500);
    let printed = match heard.recv_timeout(grace) {
        Ok(text) => text,
        Err(_) => {
            // (ended, but what it left holds its output open: ended too, and what it said taken)
            end_group(&mut child);
            heard.recv_timeout(grace).unwrap_or_default()
        }
    };
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
    let processes = match decl.get("parallel") {
        None => false,
        Some(serde_json::Value::String(p)) if p == "threads" => false,
        Some(serde_json::Value::String(p)) if p == "processes" => true,
        Some(p) => return Err(format!("not a way {name} runs in parallel: {p}")),
    };
    Ok(Some(Installed { name: name.to_string(), file: file.to_string(), path, env, places: usual, label, version, beside, processes }))
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
    let Some(decl) = installed_decl(plugin_dir, id, name)? else {
        return Ok(None);
    };
    let path_var = std::env::var_os("PATH");
    let chosen = installed_choice(&decl, located, path_var.as_deref(), &Bases::here(), false, &version_of).ok_or_else(|| format!("{name} is not found"))?;
    // (one too old for Meno: said, not run)
    if let Some(why) = chosen.why {
        return Err(why);
    }
    installed_at(&decl, PathBuf::from(chosen.path), path_var.as_deref()).map(Some)
}

/// The program `name` of plugin `id` installed separately, as its manifest
/// declares it, where one of its steps names it. None, where the manifest
/// declares no such program.
fn installed_decl(plugin_dir: &Path, id: &str, name: &str) -> Result<Option<Installed>, String> {
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
    Ok(Some(decl))
}

/// A program installed separately, at `program`: what it is given, and
/// where the programs beside it would be.
fn installed_at(decl: &Installed, program: PathBuf, path_var: Option<&std::ffi::OsStr>) -> Result<Found, String> {
    let env = installed_env(decl, &program, path_var)?;
    let folder = program.parent().map(Path::to_path_buf).unwrap_or_default();
    let beside = decl.beside.iter().map(|(n, f)| (n.clone(), folder.join(f))).collect();
    Ok(Found { program, activation: None, env, beside, processes: decl.processes })
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
    // (named from its label, with a short id of its own - one there already, named again)
    fs::create_dir_all(root).map_err(|e| format!("a job's folder could not be made: {e}"))?;
    let (id, dir) = (0..8)
        .find_map(|_| {
            let id = job_id(spec.label.as_deref().unwrap_or(""));
            let dir = root.join(&id);
            match fs::create_dir(&dir) {
                Ok(()) => Some(Ok((id, dir))),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => None,
                Err(e) => Some(Err(format!("a job's folder could not be made: {e}"))),
            }
        })
        .unwrap_or_else(|| Err("a job's folder could not be named".into()))?;
    let work = dir.join(WORK);
    fs::create_dir_all(&work).map_err(|e| format!("a job's folder could not be made: {e}"))?;
    for f in files {
        let path = work.join(&f.name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", f.name))?;
        }
        fs::write(&path, &f.text).map_err(|e| format!("{} could not be written: {e}", f.name))?;
    }
    // (written last: a folder without it is not a job yet - saying what it was given)
    let spec = JobSpec { given: files.iter().map(|f| f.name.replace('\\', "/")).collect(), ..spec.clone() };
    let text = serde_json::to_string_pretty(&spec).map_err(|e| e.to_string())?;
    fs::write(dir.join(SPEC), text).map_err(|e| format!("a job could not be written: {e}"))?;
    Ok((id, dir))
}

/// The programs a job needs of other plugins (`Need`), each linked in its
/// work folder under its own name, as `need_value` names it - on Windows,
/// where its path is given, none.
pub fn link_needed(dir: &Path, needed: &[(String, PathBuf)]) -> Result<(), String> {
    #[cfg(unix)]
    for (name, program) in needed {
        std::os::unix::fs::symlink(program, dir.join(WORK).join(name)).map_err(|e| format!("{name} could not be given to the job: {e}"))?;
    }
    #[cfg(not(unix))]
    let _ = (dir, needed);
    Ok(())
}

/// A job made (`make_job`), given each program it needs (`link_needed`)
/// and each file a preset plugin hands it, copied into its work folder where
/// it goes (`presets_given`) - or, where one cannot be given it, no job at
/// all: its folder taken away again, never left as one to run without what
/// it needs.
pub fn make_handed_job(root: &Path, spec: &JobSpec, files: &[JobFile], needed: &[(String, PathBuf)], handed: &[(String, PathBuf)]) -> Result<(String, PathBuf), String> {
    let (id, dir) = make_job(root, spec, files)?;
    let given = link_needed(&dir, needed).and_then(|()| copy_handed(&dir, handed));
    if let Err(e) = given {
        let _ = fs::remove_dir_all(&dir);
        return Err(e);
    }
    Ok((id, dir))
}

/// Each file a preset plugin hands a job (`presets_given`) copied into its work folder, where it goes.
fn copy_handed(dir: &Path, handed: &[(String, PathBuf)]) -> Result<(), String> {
    for (rel, from) in handed {
        let to = dir.join(WORK).join(rel);
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{rel}: {e}"))?;
        }
        fs::copy(from, &to).map_err(|e| format!("{rel} could not be given to the job: {e}"))?;
    }
    Ok(())
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

/// How large a file of a job's Meno reads at most (`read_work_file`): one
/// larger it says it will not read, by its size.
const WORK_FILE_MOST: u64 = 256 * 1024 * 1024;

/// A job's file `name` in its work folder, where it is one of its own: by
/// a path of no link - a link its program left there, to a file of the
/// chemist's anywhere, is not followed - a file inside that folder.
fn work_file(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !inside_name(name) {
        return Err(format!("not a file of the job's: {name}"));
    }
    let work = dir.join(WORK);
    let mut at = work.clone();
    for part in Path::new(name).components() {
        at.push(part);
        let meta = fs::symlink_metadata(&at).map_err(|e| format!("{name}: {e}"))?;
        if meta.file_type().is_symlink() {
            return Err(format!("not a file of the job's: {name} is a link"));
        }
    }
    let inside = match (at.canonicalize(), work.canonicalize()) {
        (Ok(file), Ok(work)) => file.starts_with(work) && file.is_file(),
        _ => false,
    };
    if !inside {
        return Err(format!("not a file of the job's: {name}"));
    }
    Ok(at)
}

/// A file a job wrote in its work folder, as text: a file of its own
/// (`work_file`), of no more than 256 MB.
pub fn read_work_file(dir: &Path, name: &str) -> Result<String, String> {
    read_work_file_within(dir, name, WORK_FILE_MOST)
}

/// `read_work_file`, of a file of no more than `most` bytes.
fn read_work_file_within(dir: &Path, name: &str, most: u64) -> Result<String, String> {
    let at = work_file(dir, name)?;
    let too_large = |size: u64| format!("{name} is too large to read: {} MB, past {} MB", size.div_ceil(1 << 20), most >> 20);
    let file = File::open(&at).map_err(|e| format!("{name}: {e}"))?;
    let size = file.metadata().map_err(|e| format!("{name}: {e}"))?.len();
    if size > most {
        return Err(too_large(size));
    }
    // (read no further than allowed, should it have grown since)
    let mut bytes = Vec::with_capacity(size as usize);
    file.take(most + 1).read_to_end(&mut bytes).map_err(|e| format!("{name}: {e}"))?;
    if bytes.len() as u64 > most {
        return Err(too_large(bytes.len() as u64));
    }
    // (as it is where it is text, as it is: copied only where it is not)
    Ok(String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned()))
}

/// How deep in a job's work folder its files are looked for, and how many files and folders are looked at most.
const WORK_DEEPEST: usize = 32;
const WORK_MOST: usize = 10_000;

/// The files in a job's work folder, by their paths inside it.
pub fn work_files(dir: &Path) -> Vec<String> {
    files_within(&dir.join(WORK), WORK_DEEPEST, WORK_MOST)
}

/// The files in `base`, by their paths inside it: no link followed, nor
/// listed - a link to a folder above it would never end - at most `deepest`
/// folders down, and no more than `most` files and folders looked at - a
/// program making folders by the thousand is not walked for good.
fn files_within(base: &Path, deepest: usize, most: usize) -> Vec<String> {
    fn walk(base: &Path, at: &Path, left: usize, most: usize, seen: &mut usize, out: &mut Vec<String>) {
        let Ok(entries) = fs::read_dir(at) else { return };
        for e in entries.flatten() {
            if *seen >= most {
                return;
            }
            *seen += 1;
            // (what it is itself, as `symlink_metadata` says: a link is neither)
            let Ok(kind) = e.file_type() else { continue };
            let p = e.path();
            if kind.is_dir() {
                if left > 0 {
                    walk(base, &p, left - 1, most, seen, out);
                }
            } else if kind.is_file() {
                if let Ok(rel) = p.strip_prefix(base) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(base, base, deepest, most, &mut 0, &mut out);
    out.sort();
    out
}

/// A job's runner started apart from Meno - a process group of its own,
/// with no console and nothing to say to Meno - so that it outlives it.
fn start_runner(exe: &Path, dir: &Path) -> std::io::Result<()> {
    let mut cmd = Command::new(exe);
    // (in the jobs' folder: never Meno's, which it would otherwise hold - on
    // Windows a folder a process is in cannot be taken away, nor the drive
    // it is on put away - nor its own job's, which is taken away as soon as
    // the job is over, while the runner may still be on its way out; the
    // jobs' folder never is)
    cmd.arg(JOB_FLAG).arg(dir).current_dir(dir.parent().unwrap_or(dir)).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
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

// --- what a job's runner takes -----------------------------------------------

/// What a job's program is given: its environment's activation - or,
/// installed separately, its folders and variables - a network that refuses
/// it (the proxy on `port`, with no task's: while Meno is open, it says so),
/// and the cores it may use: as threads, or - a program running as processes
/// (`Found::processes`), each a core - one thread each.
fn given_env(found: &Found, port: u16, cores: Option<u32>) -> BTreeMap<String, String> {
    let mut given = Command::new(&found.program);
    if let Some(activation) = &found.activation {
        pixienv::activate(&mut given, activation);
    }
    given.envs(found.env.iter().map(|(k, v)| (k, v)));
    crate::net::route_nowhere_at(&mut given, port);
    if let Some(cores) = cores {
        let threads = if found.processes { 1 } else { cores.clamp(1, 1024) };
        for key in THREADS {
            given.env(key, threads.to_string());
        }
    }
    given
        .get_envs()
        .filter_map(|(k, v)| Some((k.to_str()?.to_string(), v?.to_str()?.to_string())))
        .collect()
}

/// The proxy's port a job was pointed at, as `given_env` points it: none, where it was not.
fn proxy_port_of(env: &BTreeMap<String, String>) -> Option<u16> {
    let (_, proxy) = env.iter().find(|(k, _)| k.eq_ignore_ascii_case("HTTPS_PROXY"))?;
    let port = proxy.strip_prefix("http://127.0.0.1:")?;
    port.bytes().all(|b| b.is_ascii_digit()).then_some(port)?.parse().ok()
}

/// The program a job's spec names, found again as `job_start` found it: one
/// its plugin declares installed separately, at the path the spec gives - a
/// copy of it by its file's name, as where the chemist located it is taken -
/// or else one in the plugin's environment, at that path and no other.
fn found_again(data: &Path, plugin_dir: &Path, spec: &JobSpec) -> Result<Found, String> {
    let program = Path::new(&spec.program);
    if let Some(decl) = installed_decl(plugin_dir, &spec.plugin, &spec.name)? {
        let copy = installed_found(&decl, Some(&spec.program), None, &Bases::default(), true);
        if copy.first().map(PathBuf::as_path) != Some(program) {
            return Err(format!("{} is not {}", spec.program, spec.name));
        }
        return installed_at(&decl, program.to_path_buf(), std::env::var_os("PATH").as_deref());
    }
    let found = plugin_program(data, plugin_dir, &spec.plugin, &spec.name, &spec.args)?;
    if found.program != program {
        return Err(format!("{} is not {}'s {}", spec.program, spec.plugin, spec.name));
    }
    Ok(found)
}

/// Whether a job's runner may run what `spec` says (`job.json`, which
/// anything could have written): only what `job_start` makes - a program
/// its plugin names, from the plugin's environment or installed separately,
/// those beside it it declares, and given what `job_start` gives, nothing
/// else; one installed separately, and those beside it, naming no file but
/// those in its work folder as it was made (`written`) - Meno's data folder
/// `data`, and the plugins it carries in `plugins`.
pub fn spec_allowed(data: &Path, plugins: &Path, spec: &JobSpec, written: &[String]) -> Result<(), String> {
    if !plugin_id(&spec.plugin) {
        return Err(format!("not a plugin: {}", spec.plugin));
    }
    let plugin_dir = plugins.join(&spec.plugin);
    let found = found_again(data, &plugin_dir, spec)?;
    if installed_decl(&plugin_dir, &spec.plugin, &spec.name)?.is_some() {
        names_only_written(&spec.args, written)?;
        spec.then.iter().try_for_each(|t| names_only_written(&t.args, written))?;
    }
    let asked: Vec<ThenAsk> = spec.then.iter().map(|t| ThenAsk { program: t.name.clone(), args: t.args.clone() }).collect();
    if then_of(&found, &spec.name, &asked)? != spec.then {
        return Err(format!("not the programs beside {}", spec.name));
    }
    let port = proxy_port_of(&spec.env).ok_or("not pointed at Meno's network")?;
    // (its cores, where it was told any: as threads, they must be what it was told - as processes, it was told one thread)
    if spec.processes != found.processes {
        return Err(format!("not how {} runs in parallel", spec.name));
    }
    let cores = spec.env.contains_key(THREADS[0]).then_some(spec.cores);
    // (and, where it needs another plugin's program, what Meno gives it for that - worked out again here, from the plugins
    //  themselves: a value taken from the spec would let whatever wrote it choose the program run)
    let (needed_env, needed) = needs_given(data, &manifest_of(&plugin_dir, &spec.plugin)?, &spec.plugin, &spec.needs, &|p| Ok(plugins.join(p)))?;
    if given_env(&found, port, cores).into_iter().chain(needed_env).collect::<BTreeMap<_, _>>() != spec.env {
        return Err(format!("{} given what Meno does not give it", spec.name));
    }
    let _ = needed;
    // (and, where preset plugins handed it files, those plugins as they must be - worked out again here, from the plugins)
    presets_given(&manifest_of(&plugin_dir, &spec.plugin)?, &spec.plugin, &spec.presets, &|p| Ok(plugins.join(p)))?;
    Ok(())
}

/// Whether each program of another plugin a job in folder `dir` needs is linked in its work folder under its name to
/// that program - found again from the plugins themselves (`needs_given`) - and to nothing else: what its runner checks
/// besides `spec_allowed`, before its program runs. On Windows, where none is linked, nothing to check.
pub fn needs_linked(dir: &Path, data: &Path, plugins: &Path, spec: &JobSpec) -> Result<(), String> {
    if spec.needs.is_empty() || cfg!(not(unix)) {
        return Ok(());
    }
    let (_, needed) = needs_given(data, &manifest_of(&plugins.join(&spec.plugin), &spec.plugin)?, &spec.plugin, &spec.needs, &|p| Ok(plugins.join(p)))?;
    for (name, program) in &needed {
        if fs::read_link(dir.join(WORK).join(name)).ok().as_deref() != Some(program.as_path()) {
            return Err(format!("{name} in its folder is not the program it needs"));
        }
    }
    Ok(())
}

/// A job's folder as its runner takes it (`--job <folder>`): one in `data`'s
/// `jobs`, by an id Meno gives - links and `..` followed first, so that
/// neither leads out - and holding what it is to run. Where it is there.
pub fn runner_folder(data: &Path, dir: &Path) -> Result<PathBuf, String> {
    let refused = || format!("not a job of Meno's: {}", dir.display());
    // (in one of Meno's jobs' folders - its own, or the working folder chosen, as Meno's data folder says, never as
    //  the runner is told)
    let roots: Vec<PathBuf> = jobs_roots(data).iter().filter_map(|r| r.canonicalize().ok()).collect();
    let real = dir.canonicalize().map_err(|_| refused())?;
    let id = real.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    if !real.parent().is_some_and(|p| roots.iter().any(|r| r == p)) || !job_id_ok(id) || !real.is_dir() || !real.join(SPEC).is_file() {
        return Err(refused());
    }
    // (the folder checked, and no other found again by its name: on Windows,
    // as Meno names it - a canonical path, `\\?\C:\...`, is one programs may not take as their folder)
    Ok(plain(real))
}

/// A canonical path as programs take it: on Windows, a drive's (`\\?\C:\x`)
/// without its `\\?\` where that leads to the same place; any other as it is.
fn plain(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\").filter(|r| r.as_bytes().get(1) == Some(&b':')) {
            let short = PathBuf::from(rest);
            if short.canonicalize().is_ok_and(|c| c == path) {
                return short;
            }
        }
    }
    path
}

/// Meno's local data folder as Tauri finds it (`app_local_data_dir`, as
/// folders.rs has it), where Meno makes jobs (lib.rs `local_data_dir`) - for
/// a job's runner, which has no window to ask. On a Mac and on Linux it is
/// the data folder itself; on Windows the local one, not the roaming one.
fn data_dir_here() -> Option<PathBuf> {
    crate::folders::local_data_dir()
}

/// The plugins Meno carries, where Tauri finds its resources - for a job's runner, as for its data folder.
fn plugins_here() -> Option<PathBuf> {
    let info = tauri::PackageInfo {
        name: "Meno".into(),
        version: env!("CARGO_PKG_VERSION").parse().ok()?,
        authors: env!("CARGO_PKG_AUTHORS"),
        description: env!("CARGO_PKG_DESCRIPTION"),
        crate_name: env!("CARGO_PKG_NAME"),
    };
    let resources = tauri::utils::platform::resource_dir(&info, &tauri::Env::default()).ok()?;
    Some(resources.join("resources").join("plugins"))
}

// --- Meno's commands ---------------------------------------------------------

/// The jobs' folder in Meno's local data folder `data`: where Meno makes them, and the only one their runner takes them from.
fn jobs_in(data: &Path) -> PathBuf {
    data.join("jobs")
}

/// Where the working folder chosen for jobs is kept: in Meno's own data folder, read by Meno and by every runner -
/// never from what a runner is given.
const WORKING_FOLDER: &str = "jobs-folder.json";
/// The folder Meno makes jobs in, inside the working folder chosen: its own, beside whatever else is there.
const IN_CHOSEN: &str = "meno-jobs";

#[derive(Serialize, Deserialize)]
struct WorkingFolder {
    path: String,
}

/// The working folder chosen for jobs in Settings, where one is - there or not: a drive not connected, say, is
/// still the one chosen, and no job is made anywhere else until the chemist chooses again. None, Meno's own.
fn chosen_folder(data: &Path) -> Option<PathBuf> {
    let chosen: WorkingFolder = serde_json::from_str(&fs::read_to_string(data.join(WORKING_FOLDER)).ok()?).ok()?;
    let path = PathBuf::from(chosen.path);
    path.is_absolute().then_some(path)
}

/// Why no job can be made in the working folder chosen: it is not there.
fn missing_folder(chosen: &Path) -> String {
    format!(
        "The folder chosen for jobs is not there: {}. Connect it, or choose another in Settings, Calculations, Jobs",
        chosen.display()
    )
}

/// The folder new jobs are made in (`jobs_roots`' first) - never another where the working folder chosen is not
/// there: said instead.
fn new_jobs_root(data: &Path) -> Result<PathBuf, String> {
    if let Some(chosen) = chosen_folder(data).filter(|c| !c.is_dir()) {
        return Err(missing_folder(&chosen));
    }
    Ok(jobs_roots(data).remove(0))
}

/// The jobs' folders: the one new jobs are made in - the working folder chosen, its `meno-jobs`, else Meno's own -
/// first; and Meno's own besides, where another is chosen, so that jobs made there before are still found.
fn jobs_roots(data: &Path) -> Vec<PathBuf> {
    let own = jobs_in(data);
    match chosen_folder(data).map(|c| c.join(IN_CHOSEN)) {
        Some(chosen) if chosen != own => vec![chosen, own],
        _ => vec![own],
    }
}

fn jobs_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = new_jobs_root(&crate::local_data_dir(app)?)?;
    fs::create_dir_all(&root).map_err(|e| format!("the jobs' folder: {e}"))?;
    Ok(root)
}

/// Every jobs' folder there is, the one new jobs are made in first.
pub(crate) fn all_roots(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    Ok(jobs_roots(&crate::local_data_dir(app)?))
}

/// The working folder jobs are made in, whether it is Meno's own, and whether it is not there (Settings,
/// *Calculations*, *Jobs*).
#[derive(Serialize)]
pub struct JobsFolder {
    pub path: String,
    pub own: bool,
    pub missing: bool,
}

#[tauri::command]
pub fn jobs_folder(app: AppHandle) -> Result<JobsFolder, String> {
    let data = crate::local_data_dir(&app)?;
    let chosen = chosen_folder(&data);
    let path = chosen.clone().unwrap_or_else(|| jobs_in(&data));
    Ok(JobsFolder { path: path.to_string_lossy().into_owned(), own: chosen.is_none(), missing: chosen.is_some_and(|c| !c.is_dir()) })
}

/// The working folder jobs are made in, chosen (`path`), or Meno's own again (none): a folder that is there, that
/// Meno can write in; changed only while no job waits or runs - those under way stay where they are, and one
/// queue never spans two folders. What jobs may use goes with it.
#[tauri::command]
pub fn jobs_folder_choose(app: AppHandle, path: Option<String>) -> Result<JobsFolder, String> {
    let data = crate::local_data_dir(&app)?;
    choose_folder(&data, path.as_deref())?;
    jobs_folder(app)
}

fn choose_folder(data: &Path, path: Option<&str>) -> Result<(), String> {
    let roots = jobs_roots(data);
    let busy: u32 = roots.iter().map(|r| under_way(r)).sum();
    if busy > 0 {
        return Err(format!("{busy} job{} wait or run: the folder is changed once they have ended", if busy == 1 { "" } else { "s" }));
    }
    let limits = limits_in(&roots[0]);
    match path {
        None => {
            let _ = fs::remove_file(data.join(WORKING_FOLDER));
        }
        Some(path) => {
            let folder = PathBuf::from(path);
            if !folder.is_absolute() || !folder.is_dir() {
                return Err(format!("not a folder: {path}"));
            }
            let jobs = folder.join(IN_CHOSEN);
            fs::create_dir_all(&jobs).map_err(|e| format!("Meno cannot make its folder there: {e}"))?;
            // (written in, as a job's files will be)
            let probe = jobs.join(format!(".probe-{}", std::process::id()));
            fs::write(&probe, b"").map_err(|e| format!("Meno cannot write there: {e}"))?;
            let _ = fs::remove_file(probe);
            let text = serde_json::to_string(&WorkingFolder { path: folder.to_string_lossy().into_owned() }).map_err(|e| e.to_string())?;
            fs::write(data.join(WORKING_FOLDER), text).map_err(|e| e.to_string())?;
        }
    }
    write_limits(&jobs_roots(data)[0], limits).map_err(|e| e.to_string())
}

/// Whether `id` is a job's id, as Meno gives them: a UUID, as Meno writes one.
pub fn job_id_ok(id: &str) -> bool {
    // (as Meno names them now - its label, path-safe, and a short id - or as it did, a UUID alone)
    let named = id.len() <= SLUG_MOST + 9
        && id.rsplit_once('-').is_some_and(|(slug, tail)| tail.len() == 8 && tail.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) && slug_ok(slug));
    named || uuid::Uuid::parse_str(id).is_ok_and(|u| u.hyphenated().to_string() == id)
}

/// The most characters of a label a job's folder is named by.
const SLUG_MOST: usize = 40;

/// A label made safe for a folder's name on every system (docs/WORKFLOWS-FOUNDATION.md, *The working directory
/// is scratch*): small ASCII letters, digits and hyphens only, no hyphen at either end nor two together, at most
/// `SLUG_MOST` long - a workspace, step or entry named with spaces or in Japanese gives what ASCII it has; none,
/// "job".
pub fn slug_of(label: &str) -> String {
    let mut out = String::new();
    for c in label.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
        if out.len() >= SLUG_MOST {
            break;
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "job".into() } else { out }
}

fn slug_ok(slug: &str) -> bool {
    !slug.is_empty() && slug.len() <= SLUG_MOST && slug.split('-').all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

/// A new job's id - its folder's name: its label, path-safe, and eight characters of a UUID of its own.
fn job_id(label: &str) -> String {
    format!("{}-{}", slug_of(label), &uuid::Uuid::new_v4().simple().to_string()[..8])
}

/// Whether `dir` is a job's folder: one whose spec has been written (`make_job` writes it last).
pub fn is_job(dir: &Path) -> bool {
    dir.join(SPEC).is_file()
}

/// A job's folder, by its id - which is only ever one Meno made.
fn job_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !job_id_ok(id) {
        return Err(format!("no job {id}"));
    }
    job_in(&all_roots(app)?, id).ok_or_else(|| format!("no job {id}"))
}

/// The folder of the job `id` in whichever of the jobs' folders `roots` holds it: none where none does.
pub(crate) fn job_in(roots: &[PathBuf], id: &str) -> Option<PathBuf> {
    roots.iter().map(|r| r.join(id)).find(|d| is_job(d))
}

/// What a plugin asks to run (docs/WORKFLOWS.md, `prepare`): its program, by
/// its name, with arguments; the files to write for it; the cores it takes,
/// from Settings, and the memory its plugin declares.
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
    pub cores: Option<u32>,
    /// The memory it takes, in MiB, as its plugin declared it.
    #[serde(default)]
    pub memory: Option<u64>,
    /// Where the chemist located its program, where it is one installed separately.
    #[serde(default)]
    pub path: Option<String>,
    /// Programs installed beside its own to run after it (`JobSpec::then`), by their names there.
    #[serde(default)]
    pub then: Vec<ThenAsk>,
    /// What it is called, in words: its folder named from it, path-safe (`JobSpec::label`).
    #[serde(default)]
    pub label: Option<String>,
    /// Its key (`JobSpec::key`): 64 hex digits, or none.
    #[serde(default)]
    pub key: Option<String>,
    /// The files of its work folder its plugin reads back once it is done: kept, with what it was given, where its step keeps no raw outputs (keptjobs.rs).
    #[serde(default)]
    pub reads: Vec<String>,
    /// Other plugins whose programs it needs, by id: each one its plugin's manifest declares (`needs`).
    #[serde(default)]
    pub needs: Vec<String>,
    /// Preset plugins whose files it is handed, by id (`JobSpec::presets`).
    #[serde(default)]
    pub presets: Vec<String>,
}

/// A program of another plugin a plugin's jobs may need, as its manifest
/// declares it (`depends`, docs/PLUGINS.md *Depends*): that plugin, the
/// versions of it it works with, its program by the name that plugin's
/// manifest gives it, and the variable the job is told where it is in.
#[derive(Debug, Clone, PartialEq)]
pub struct Need {
    pub plugin: String,
    pub versions: String,
    pub program: String,
    pub env: String,
}

/// A version as numbers - "0.1.4", [0, 1, 4]; none, where it is not one (as lib/plugins/depends `versionParts`).
fn version_parts(v: &str) -> Option<Vec<u64>> {
    let parts: Vec<&str> = v.split('.').collect();
    if parts.is_empty() || parts.len() > 4 || parts.iter().any(|p| p.is_empty() || p.len() > 6 || !p.bytes().all(|b| b.is_ascii_digit())) {
        return None;
    }
    Some(parts.iter().map(|p| p.parse().unwrap_or(0)).collect())
}

/// Which of two versions comes first ("1.2" is "1.2.0").
fn version_order(a: &[u64], b: &[u64]) -> std::cmp::Ordering {
    (0..a.len().max(b.len())).map(|i| a.get(i).unwrap_or(&0).cmp(b.get(i).unwrap_or(&0))).find(|o| o.is_ne()).unwrap_or(std::cmp::Ordering::Equal)
}

/// Versions as a manifest writes them - `>=A`, or `>=A <B`, each of three numbers, B after A - read (as lib/plugins/depends `rangeOf`).
fn range_of(text: &str) -> Option<(Vec<u64>, Option<Vec<u64>>)> {
    let semver = |v: &str| version_parts(v).filter(|p| p.len() == 3);
    let rest = text.trim().strip_prefix(">=")?;
    let mut words = rest.split(' ');
    let from = semver(words.next()?)?;
    let before = match words.next() {
        None => None,
        Some(w) => Some(semver(w.strip_prefix('<')?)?),
    };
    if words.next().is_some() || before.as_ref().is_some_and(|b| version_order(&from, b).is_ge()) {
        return None;
    }
    Some((from, before))
}

/// Whether a plugin of `version` is one a range of versions takes; one that is no version is in none.
pub fn in_versions(version: &str, versions: &str) -> bool {
    let (Some(v), Some((from, before))) = (version_parts(version), range_of(versions)) else { return false };
    version_order(&v, &from).is_ge() && before.is_none_or(|b| version_order(&v, &b).is_lt())
}

/// What a manifest declares its jobs may need of other plugins' programs, from the plugins it uses (`depends`) - all as they must be, or none.
pub fn needs_declared(manifest: &serde_json::Value, id: &str) -> Result<Vec<Need>, String> {
    let Some(list) = manifest.get("depends") else { return Ok(Vec::new()) };
    let list = list.as_array().ok_or_else(|| format!("{id}'s plugins it uses are not a list"))?;
    let mut out: Vec<Need> = Vec::new();
    let mut plugins: Vec<String> = Vec::new();
    for d in list {
        let field = |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or_default().to_string();
        let (plugin, versions) = (field(d, "plugin"), field(d, "versions"));
        let optional_ok = d.get("optional").is_none_or(|o| o.is_boolean());
        if !plugin_id(&plugin) || plugin == id || range_of(&versions).is_none() || plugins.contains(&plugin) || !optional_ok {
            return Err(format!("{id} declares a plugin it uses that Meno cannot give: {d}"));
        }
        plugins.push(plugin.clone());
        let programs = match d.get("programs") {
            None => Vec::new(),
            Some(p) => p.as_array().ok_or_else(|| format!("{id} declares a plugin it uses that Meno cannot give: {d}"))?.clone(),
        };
        for p in programs {
            let need = Need { plugin: plugin.clone(), versions: versions.clone(), program: field(&p, "program"), env: field(&p, "env") };
            let single = Path::new(&need.program).file_name().and_then(|f| f.to_str()) == Some(need.program.as_str());
            if !single || !inside_name(&need.program) || NEVER.contains(&need.program.to_ascii_lowercase().as_str()) || !env_name_ok(&need.env) || out.iter().any(|o| o.env == need.env) {
                return Err(format!("{id} declares a plugin it uses that Meno cannot give: {d}"));
            }
            out.push(need);
        }
    }
    Ok(out)
}

/// What a job's variable for a program it needs (`Need`) is set to, the
/// program found at `found`: on macOS and Linux, a link to it put in the
/// job's work folder - where the job runs - by its own name (`./xtb`), for a
/// path with a space in it is never given, and a program may take one as two
/// words (ORCA 6.1.1 on macOS takes "~/Library/Application Support/..." as
/// no file); on Windows, where no link is made, its path, refused where it
/// has a space, never quoted.
pub fn need_value(found: &Path, windows: bool) -> Result<String, String> {
    if windows {
        // (one separator throughout: an environment's folders may be given with "/", as pixi's activation gives Library/bin)
        let path = found.to_string_lossy().replace('/', "\\");
        if path.chars().any(char::is_whitespace) {
            return Err(format!("{path} has a space in it, which the program it is given to may not take: it cannot be given"));
        }
        return Ok(path);
    }
    let name = found.file_name().and_then(|n| n.to_str()).ok_or("a program with no name")?;
    Ok(format!("./{name}"))
}

/// The variables a job is given for the programs of other plugins it needs, and each program with the name it is linked under.
pub type NeedsGiven = (BTreeMap<String, String>, Vec<(String, PathBuf)>);

/// What a job of plugin `id` (its manifest `manifest`) is given for the
/// programs of other plugins it `needs`, by their ids: each one its manifest
/// declares (`needs_declared`), found again as that plugin's own jobs find it
/// (`plugin_program`, its folder by `dir_of`) - the variables, each with the
/// value `need_value` gives it, and each program with the name it is linked
/// under. Worked out the same way as the job is made and as its runner checks
/// it: nothing of it is taken from what a job's spec says but which plugins.
/// That plugin not set up, why, as the step says it.
pub fn needs_given(data: &Path, manifest: &serde_json::Value, id: &str, needs: &[String], dir_of: &dyn Fn(&str) -> Result<PathBuf, String>) -> Result<NeedsGiven, String> {
    let mut env = BTreeMap::new();
    let mut links = Vec::new();
    if needs.is_empty() {
        return Ok((env, links));
    }
    let declared = needs_declared(manifest, id)?;
    for other in needs {
        let of: Vec<&Need> = declared.iter().filter(|n| &n.plugin == other).collect();
        if of.is_empty() {
            return Err(format!("{id} declares no program of {other} that it uses"));
        }
        if needs.iter().filter(|n| *n == other).count() > 1 {
            return Err(format!("{id} needs {other} twice"));
        }
        let other_dir = dir_of(other)?;
        let other_manifest = manifest_of(&other_dir, other).ok();
        let name = other_manifest.as_ref().and_then(|m| m.get("name").and_then(|v| v.as_str()).map(str::to_string)).unwrap_or_else(|| other.clone());
        // (of a version it works with, as its manifest says - read from that plugin's own folder, never from the spec)
        let version = other_manifest.as_ref().and_then(|m| m.get("version").and_then(|v| v.as_str()).map(str::to_string)).unwrap_or_default();
        if !in_versions(&version, &of[0].versions) {
            return Err(format!("{id} needs {name} {}; {} is here", of[0].versions, if version.is_empty() { "no version of it" } else { &version }));
        }
        for need in of {
            let found = plugin_program(data, &other_dir, &need.plugin, &need.program, &[]).map_err(|_| format!("The {name} plugin is needed for this: add it in Settings, Plugins"))?;
            let file = found.program.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
            env.insert(need.env.clone(), need_value(&found.program, cfg!(windows))?);
            links.push((file, found.program));
        }
    }
    Ok((env, links))
}

/// The folder in a job's work folder the files preset plugins hand it go in, each plugin's in one of its own (`preset/<id>/`).
pub const PRESET_DIR: &str = "preset";
/// The most files preset plugins may hand a job, all told, and the most bytes.
const PRESET_FILES_MOST: usize = 64;
const PRESET_BYTES_MOST: u64 = 16 * 1024 * 1024;

/// Whether `f` is a file a preset may name (docs/PLUGINS.md, *Presets*): a path inside its plugin's folder - at most four
/// names, each plain - and neither the manifest nor the worker Meno reads (as lib/plugins/manifest `presetFileOk`).
pub fn preset_file_ok(f: &str) -> bool {
    let parts: Vec<&str> = f.split('/').collect();
    let plain = |p: &&str| {
        let b = p.as_bytes();
        !b.is_empty() && b.len() <= 64 && b[0].is_ascii_alphanumeric() && b.iter().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(c))
    };
    f.len() <= 200 && parts.len() <= 4 && parts.iter().all(plain) && f != "manifest.json" && f != "worker.py"
}

/// The files a job of plugin `id` (its manifest `manifest`) is handed by the preset plugins `presets`, by their ids
/// (docs/PLUGINS.md, *Presets*): each one a plugin that uses `id` through an interface `id` declares, and brings its
/// presets through it - `id` and that interface of versions it works with, each read from its own folder (`dir_of`),
/// never from a job's spec; every file its presets name, a file in its folder and by no link, with where it goes in the
/// job's work folder (`preset/<its id>/<file>`). Worked out the same way as the job is made and as its runner checks it.
/// One not so, why.
pub fn presets_given(manifest: &serde_json::Value, id: &str, presets: &[String], dir_of: &dyn Fn(&str) -> Result<PathBuf, String>) -> Result<Vec<(String, PathBuf)>, String> {
    let text = |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or_default().to_string();
    let listed = |v: &serde_json::Value, k: &str| v.get(k).and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let version = text(manifest, "version");
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    let mut bytes = 0u64;
    for (i, from) in presets.iter().enumerate() {
        if !plugin_id(from) || from == id || presets[..i].contains(from) {
            return Err(format!("not a plugin that brings {id} presets: {from}"));
        }
        let dir = dir_of(from)?;
        let theirs = manifest_of(&dir, from)?;
        let name = theirs.get("name").and_then(|v| v.as_str()).unwrap_or(from).to_string();
        let presets_decl = theirs.get("presets").filter(|p| p.is_object()).ok_or_else(|| format!("{name} brings no presets"))?;
        let interface = text(presets_decl, "interface");
        // (of `id`, through an interface it declares - each of a version the preset plugin works with)
        let uses = listed(&theirs, "depends").into_iter().find(|d| text(d, "plugin") == id).ok_or_else(|| format!("{name} does not use {id}"))?;
        if !in_versions(&version, &text(&uses, "versions")) {
            return Err(format!("{name} works with {id} {}; {} is here", text(&uses, "versions"), if version.is_empty() { "no version of it" } else { &version }));
        }
        let wanted = listed(&uses, "interfaces").into_iter().find(|x| text(x, "id") == interface).ok_or_else(|| format!("{name} does not use {id}'s {interface} interface"))?;
        let has = listed(manifest, "interfaces").into_iter().find(|x| text(x, "id") == interface).map(|x| text(&x, "version"));
        match has {
            Some(v) if in_versions(&v, &text(&wanted, "versions")) => {}
            Some(v) => return Err(format!("{name} works with {id}'s {interface} interface {}; {v} is here", text(&wanted, "versions"))),
            None => return Err(format!("{id} declares no {interface} interface")),
        }
        // (every file its presets name, once: each a path inside its folder, by no link, a file)
        let mut files: Vec<String> = ["looks", "studios", "motions"].iter().flat_map(|k| listed(presets_decl, k)).map(|x| text(&x, "file")).collect();
        files.extend(listed(presets_decl, "files").iter().map(|f| f.as_str().unwrap_or_default().to_string()));
        files.sort();
        files.dedup();
        for f in files {
            if !preset_file_ok(&f) {
                return Err(format!("{name} names a file it cannot hand over: {f}"));
            }
            let mut at = dir.clone();
            for part in f.split('/') {
                at.push(part);
                let meta = fs::symlink_metadata(&at).map_err(|_| format!("{f} of {name} is not there"))?;
                if meta.file_type().is_symlink() {
                    return Err(format!("{f} of {name} is a link, which it cannot hand over"));
                }
            }
            let meta = fs::metadata(&at).map_err(|e| format!("{f} of {name}: {e}"))?;
            if !meta.is_file() {
                return Err(format!("{f} of {name} is not a file"));
            }
            bytes += meta.len();
            out.push((format!("{PRESET_DIR}/{from}/{f}"), at));
        }
    }
    if out.len() > PRESET_FILES_MOST || bytes > PRESET_BYTES_MOST {
        return Err(format!("the presets hand over more than a job takes: {} files, {} MB", out.len(), bytes.div_ceil(1 << 20)));
    }
    Ok(out)
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
    // (looked for off the commands' threads: a program installed separately is asked its version, which may take seconds)
    let installed = {
        let (dir, plugin, program, path) = (plugin_dir.clone(), payload.plugin.clone(), payload.program.clone(), payload.path.clone());
        tauri::async_runtime::spawn_blocking(move || installed_program(&dir, &plugin, &program, path.as_deref()))
            .await
            .map_err(|e| e.to_string())??
    };
    let found = match installed {
        Some(found) => {
            // (a program installed separately, and those beside it, given the job's own files alone - none of the chemist's elsewhere)
            let written: Vec<String> = payload.files.iter().map(|f| f.name.clone()).collect();
            names_only_written(&payload.args, &written)?;
            payload.then.iter().try_for_each(|t| names_only_written(&t.args, &written))?;
            found
        }
        None => plugin_program(&data, &plugin_dir, &payload.plugin, &payload.program, &payload.args)?,
    };
    let then = then_of(&found, &payload.program, &payload.then)?;
    // (another plugin's program it needs: one its manifest declares, found as that plugin's own jobs find it - that plugin
    //  not set up, nothing is made, saying so - and named in the job's work folder, never as a path with a space in it)
    let (needed_env, needed) = needs_given(&data, &manifest_of(&plugin_dir, &payload.plugin)?, &payload.plugin, &payload.needs, &|p| {
        crate::resource_path(&app, &Path::new("resources/plugins").join(p))
    })?;
    if let Some((name, _)) = needed.iter().find(|(name, _)| payload.files.iter().any(|f| &f.name == name)) {
        return Err(format!("a job's file is named {name}, as the program it needs is"));
    }
    // (the files preset plugins hand it: each of a plugin that uses it through an interface it declares, copied into its
    //  work folder unread - in a folder of their own, which none of its own files may be in)
    let handed = presets_given(&manifest_of(&plugin_dir, &payload.plugin)?, &payload.plugin, &payload.presets, &|p| {
        crate::resource_path(&app, &Path::new("resources/plugins").join(p))
    })?;
    if !handed.is_empty() {
        if let Some(f) = payload.files.iter().find(|f| Path::new(&f.name).components().next().is_some_and(|c| c.as_os_str() == PRESET_DIR)) {
            return Err(format!("a job's file is in {PRESET_DIR}, where the presets it is handed go: {}", f.name));
        }
    }
    // (one asking for more than the computer has never starts: refused, saying so)
    if let Some(why) = beyond(computer(), payload.cores.unwrap_or(1), payload.memory.unwrap_or(0)) {
        return Err(format!("It cannot run on this computer: {why}"));
    }

    let spec = JobSpec {
        plugin: payload.plugin.clone(),
        name: payload.program.clone(),
        program: found.program.to_string_lossy().into_owned(),
        args: payload.args,
        stdin: payload.stdin,
        env: given_env(&found, net.proxy_port(), payload.cores).into_iter().chain(needed_env).collect(),
        cores: payload.cores.unwrap_or(1).clamp(1, 1024),
        processes: found.processes,
        memory: payload.memory.unwrap_or(0).min(MEMORY_MOST),
        created: now_ms(),
        label: payload.label.map(|l| l.chars().take(200).collect()),
        key: payload.key.filter(|k| k.len() == 64 && k.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())),
        then,
        needs: payload.needs.clone(),
        presets: payload.presets.clone(),
        given: vec![],
    };
    // (each program it needs, linked in its work folder: a link there is never listed, kept or saved - keptjobs `kept_files`)
    let (id, dir) = make_handed_job(&jobs_root(&app)?, &spec, &payload.files, &needed, &handed)?;
    // (what it was given and what is read back of it, for a workspace that keeps no raw outputs of it: without it, every file is taken as raw)
    let inputs = payload.files.iter().map(|f| f.name.clone()).collect();
    let reads = payload.reads.into_iter().filter(|n| inside_name(n)).collect();
    if let Err(e) = crate::keptjobs::write_roles(&dir, inputs, reads) {
        crate::logfile::line("meno", &format!("a job's kept.json could not be written: {e}"));
    }
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
    /// Its key, as it was asked for with one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(flatten)]
    pub record: JobRecord,
}

fn listed(id: &str, dir: &Path) -> Option<JobListed> {
    let spec = read_spec(dir)?;
    Some(JobListed { id: id.to_string(), plugin: spec.plugin, program: spec.name, key: spec.key, record: current_record(dir)? })
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
    all_roots(app).map(|roots| roots.iter().map(|r| under_way(r)).sum()).unwrap_or(0)
}

/// Every job in Meno's data folder, those asked for first first.
#[tauri::command]
pub async fn jobs_list(app: AppHandle) -> Result<Vec<JobListed>, String> {
    Ok(listed_in(&all_roots(&app)?))
}

/// Every job in the jobs' folders `roots`, those asked for first first - each id once, from the first folder that
/// holds it, as `job_in` finds it: never another's state in its place.
fn listed_in(roots: &[PathBuf]) -> Vec<JobListed> {
    let mut seen = std::collections::HashSet::new();
    let mut jobs: Vec<JobListed> = roots
        .iter()
        .filter_map(|root| fs::read_dir(root).ok())
        .flat_map(|dir| dir.flatten())
        .filter_map(|e| {
            let id = e.file_name().to_str()?.to_string();
            // (one being taken away, or left of one: no job; nor anything not named as a job is)
            if id.starts_with(TAKEN) || !job_id_ok(&id) {
                return None;
            }
            listed(&id, &e.path())
        })
        .filter(|j| seen.insert(j.id.clone()))
        .collect();
    jobs.sort_by_key(|j| j.record.created);
    jobs
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

/// What a job gave, as one digest: the SHA-256 of its log and of every file in its work folder, each by its name -
/// a file changed since, added or taken away gives another. Kept with the run that read it, and compared when the
/// job is taken up again (docs/WORKFLOWS.md, *Job keys*).
fn digest_of(dir: &Path) -> std::io::Result<String> {
    let mut sum = Sha256::new();
    let mut one = |label: &str, path: &Path| -> std::io::Result<()> {
        sum.update(label.as_bytes());
        sum.update([0]);
        match File::open(path) {
            Ok(mut f) => {
                sum.update(f.metadata()?.len().to_le_bytes());
                std::io::copy(&mut f, &mut sum)?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => sum.update(b"none"),
            Err(e) => return Err(e),
        }
        Ok(())
    };
    one("log", &dir.join(LOG))?;
    let mut names: Vec<String> = work_files(dir).into_iter().filter(|n| !os_metadata(n)).collect();
    names.sort();
    for name in names {
        one(&format!("work/{name}"), &dir.join(WORK).join(&name))?;
    }
    Ok(sum.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Whether a file in a job's folder is one the system writes there itself - Finder's `.DS_Store` and `._` files,
/// Explorer's `Thumbs.db` and `desktop.ini` - as *Show files* opens it: no output of the job's, left out of its
/// digest, so that looking at a job's files never makes it one Meno cannot account for.
fn os_metadata(name: &str) -> bool {
    let base = name.rsplit('/').next().unwrap_or(name);
    base == ".DS_Store" || base.starts_with("._") || base.eq_ignore_ascii_case("Thumbs.db") || base.eq_ignore_ascii_case("desktop.ini")
}

/// What a job gave, as one digest (`digest_of`): read off Meno's way, its files however large - each streamed
/// through the hash, never held whole.
#[tauri::command]
pub async fn job_digest(app: AppHandle, id: String) -> Result<String, String> {
    let dir = job_dir(&app, &id)?;
    tauri::async_runtime::spawn_blocking(move || digest_of(&dir))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("job {id}'s files could not be read: {e}"))
}

/// A program installed separately as it is now, for a job's key: where it is, its size, and when it was last
/// written - a program replaced, though it says the same version, or none, gives another key.
fn stamp_of(path: &Path) -> Result<String, String> {
    let real = path.canonicalize().map_err(|e| format!("{}: {e}", path.display()))?;
    let meta = fs::metadata(&real).map_err(|e| format!("{}: {e}", real.display()))?;
    let written = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).ok_or_else(|| format!("{}: no time written", real.display()))?;
    Ok(format!("{}\n{}\n{}", real.display(), meta.len(), written.as_nanos()))
}

#[tauri::command]
pub async fn program_stamp(path: String) -> Result<String, String> {
    stamp_of(Path::new(&path))
}

#[tauri::command]
pub async fn job_stop(app: AppHandle, id: String) -> Result<(), String> {
    ask_stop(&job_dir(&app, &id)?).map_err(|e| e.to_string())
}

/// What a job's folder taken away is named first: no job's id.
const TAKEN: &str = ".taken-";

/// A finished job's folder taken away: moved out of the jobs' way first,
/// under a name no job has - so that one a program still holds a file in
/// (Windows) is never left half there, a job no longer whole - then
/// removed. Where it could not be moved, it is left as it was; what could
/// not be removed goes the next time finished jobs are cleared.
fn take_away(dir: &Path) -> std::io::Result<()> {
    let taken = dir.with_file_name(format!("{TAKEN}{}", uuid::Uuid::new_v4().simple()));
    fs::rename(dir, &taken)?;
    let _ = fs::remove_dir_all(&taken);
    Ok(())
}

/// A finished job's folder taken away; one waiting or running is not.
#[tauri::command]
pub async fn job_remove(app: AppHandle, id: String) -> Result<(), String> {
    let dir = job_dir(&app, &id)?;
    if !current_record(&dir).is_some_and(|r| r.state.finished()) {
        return Err(format!("job {id} has not finished: stop it first"));
    }
    take_away(&dir).map_err(|e| format!("job {id}'s files could not be taken away: {e}"))
}

/// Every finished job's folder in `root` taken away - and what was left of
/// those taken away before: how many.
fn clear_finished(root: &Path) -> Result<u32, String> {
    let mut cleared = 0;
    for e in fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        let dir = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        // (nothing but what Meno named: a folder chosen for jobs may hold others' - left as they are)
        if name.starts_with(TAKEN) {
            let _ = fs::remove_dir_all(&dir);
        } else if job_id_ok(&name) && dir.is_dir() && current_record(&dir).is_some_and(|r| r.state.finished()) && take_away(&dir).is_ok() {
            cleared += 1;
        }
    }
    Ok(cleared)
}

/// Every finished job's folder taken away: how many.
#[tauri::command]
pub async fn jobs_clear_finished(app: AppHandle) -> Result<u32, String> {
    all_roots(&app)?.iter().filter(|r| r.is_dir()).map(|r| clear_finished(r)).sum()
}

/// The most memory a job may say it takes, in MiB: 64 TiB.
const MEMORY_MOST: u64 = 64 * 1024 * 1024;

/// This computer's cores and memory, for Settings to say what jobs may use of them.
#[tauri::command]
pub fn computer_resources() -> Resources {
    computer()
}

/// What this computer's jobs may use at once, as Settings says (`Limits`): written beside the jobs, where every
/// runner reads it as it looks for its turn - those waiting take it up at once. At least a core; memory within what
/// the computer has, nought counting none.
#[tauri::command]
pub fn jobs_limits(app: AppHandle, cores: u32, memory: u64) -> Result<(), String> {
    let root = jobs_root(&app)?;
    write_limits(&root, Limits { cores: cores.clamp(1, 1024), memory: memory.min(MEMORY_MOST) }).map_err(|e| e.to_string())
}

/// Limits written whole: a runner never reads half of them.
fn write_limits(root: &Path, limits: Limits) -> std::io::Result<()> {
    fs::create_dir_all(root)?;
    let tmp = root.join(format!("{LIMITS}.{}.tmp", std::process::id()));
    fs::write(&tmp, serde_json::to_string(&limits).map_err(std::io::Error::other)?)?;
    fs::rename(tmp, root.join(LIMITS))
}

/// What a finished job's program made taken out of its folder - every file in its work folder it was not given (a failed
/// render's frames, which it can make again) and the folders that leaves empty - its log, its record and what it was
/// given kept, to be read. How many bytes that freed.
fn trim_made(dir: &Path) -> Result<u64, String> {
    if !current_record(dir).is_some_and(|r| r.state.finished()) {
        return Err("it has not finished: stop it first".into());
    }
    let spec = read_spec(dir).ok_or("it is not a job")?;
    let work = dir.join(WORK);
    let mut freed = 0;
    for name in work_files(dir) {
        if spec.given.contains(&name) {
            continue;
        }
        let path = work.join(&name);
        if let Ok(m) = fs::symlink_metadata(&path) {
            if m.is_file() && fs::remove_file(&path).is_ok() {
                freed += m.len();
            }
        }
    }
    // (the folders left empty, deepest first: one still holding a file stays)
    fn empty(at: &Path, left: usize) {
        let Ok(entries) = fs::read_dir(at) else { return };
        for e in entries.flatten() {
            if left > 0 && e.file_type().is_ok_and(|k| k.is_dir()) {
                empty(&e.path(), left - 1);
                let _ = fs::remove_dir(e.path());
            }
        }
    }
    empty(&work, WORK_DEEPEST);
    Ok(freed)
}

/// What a finished job's program made taken out of its folder, its log and what it was given kept: the bytes freed.
#[tauri::command]
pub async fn job_trim(app: AppHandle, id: String) -> Result<u64, String> {
    trim_made(&job_dir(&app, &id)?).map_err(|e| format!("job {id}: {e}"))
}

/// How many bytes the folders of the finished jobs in `root` hold: every file in each, as far down as its work folder
/// is looked at.
fn finished_bytes(root: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(root) else { return 0 };
    entries
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with(TAKEN))
        .map(|e| e.path())
        .filter(|dir| current_record(dir).is_some_and(|r| r.state.finished()))
        .map(|dir| files_within(&dir, WORK_DEEPEST + 1, WORK_MOST).iter().filter_map(|n| fs::symlink_metadata(dir.join(n)).ok()).map(|m| m.len()).sum::<u64>())
        .sum()
}

/// How many bytes the finished jobs' folders hold, all together - in every jobs' folder.
#[tauri::command]
pub async fn jobs_finished_bytes(app: AppHandle) -> Result<u64, String> {
    Ok(all_roots(&app)?.iter().map(|r| finished_bytes(r)).sum())
}

#[cfg(test)]
mod tests {
    use super::*;

    // (a quick step shows done as quickly as it ran; what runs on costs no more to watch)
    #[test]
    fn looks_often_while_young_then_eases_back_to_its_old_step() {
        let ms = Duration::from_millis;
        assert_eq!(step_at(ms(0), RUN_STEP), QUICK_STEP);
        assert_eq!(step_at(QUICK_FOR, WAIT_STEP), QUICK_STEP);
        // (half way through the easing, half way between)
        let half = step_at(ms(4_500), RUN_STEP);
        assert!((half.as_secs_f64() - 0.125).abs() < 1e-6, "{half:?}");
        assert_eq!(step_at(EASED_BY, RUN_STEP), RUN_STEP);
        assert_eq!(step_at(Duration::from_secs(600), WAIT_STEP), WAIT_STEP);
        // (never longer than the old step, nor ever shorter than the quick one; a step already quicker kept)
        for t in (0..8000).step_by(250) {
            let s = step_at(ms(t), WAIT_STEP);
            assert!(s >= QUICK_STEP && s <= WAIT_STEP);
        }
        assert_eq!(step_at(ms(0), ms(20)), ms(20));
    }

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-jobs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A job running a script of the system's shell, of a core, in a queue whose jobs may use `slots` cores in all:
    /// so many at once.
    fn shell(root: &Path, script: &str, slots: u32) -> PathBuf {
        write_limits(root, Limits { cores: slots, memory: 0 }).unwrap();
        sized(root, script, 1, 0)
    }

    /// A job running a script of the system's shell, taking `cores` and `memory` MiB.
    fn sized(root: &Path, script: &str, cores: u32, memory: u64) -> PathBuf {
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
            cores,
            processes: false,
            memory,
            created: now_ms(),
            label: None,
            key: None,
            then: vec![],
            needs: vec![],
            presets: vec![],
            given: vec![],
        };
        make_job(root, &spec, &[JobFile { name: "input.txt".into(), text: "input".into() }]).unwrap().1
    }

    /// A job run as its runner runs one, what it is to run taken as it is.
    fn run_job(dir: &Path) -> i32 {
        super::run_job(dir, &|_| Ok(()))
    }

    #[test]
    fn a_waiting_job_is_next_at_the_head_of_the_queue_and_behind_after_it() {
        let root = temp();
        let mk = || {
            std::thread::sleep(Duration::from_millis(3));
            shell(&root, "true", 1)
        };
        let (running, head, after) = (mk(), mk(), mk());
        // (each with its runner there, holding its lock)
        let held: Vec<_> = [&running, &head, &after]
            .iter()
            .map(|dir| {
                let lock = OpenOptions::new().create(true).truncate(false).write(true).open(dir.join(RUNNER_LOCK)).unwrap();
                lock.lock().unwrap();
                lock
            })
            .collect();
        let base = |dir: &Path| JobRecord::new(JobState::Waiting, read_spec(dir).unwrap().created);
        write_record(&running, &JobRecord { state: JobState::Running, ..base(&running) }).unwrap();
        write_record(&head, &base(&head)).unwrap();
        write_record(&after, &base(&after)).unwrap();
        // (the one slot taken: the head of the queue next, the other behind it)
        assert_eq!(take_turn(&head, &read_spec(&head).unwrap(), &base(&head)).unwrap(), Turn::Next);
        assert_eq!(take_turn(&after, &read_spec(&after).unwrap(), &base(&after)).unwrap(), Turn::Behind(1));
        // (the slot free: the head's turn taken, and it recorded running)
        write_record(&running, &JobRecord { state: JobState::Done, ..base(&running) }).unwrap();
        assert_eq!(take_turn(&head, &read_spec(&head).unwrap(), &base(&head)).unwrap(), Turn::Taken);
        assert_eq!(current_record(&head).unwrap().state, JobState::Running);
        assert_eq!(take_turn(&after, &read_spec(&after).unwrap(), &base(&after)).unwrap(), Turn::Next);
        drop(held);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_job_asleep_far_back_in_the_queue_wakes_to_a_stop_within_a_step() {
        let dir = temp();
        let asleep = Instant::now();
        let stop = {
            let dir = dir.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(150));
                ask_stop(&dir).unwrap();
            })
        };
        sleep_watching(&dir, BEHIND_MOST);
        stop.join().unwrap();
        // (woken by the stop, not by the end of its ten seconds: a bound half of them, which a slow runner's scheduling does not reach)
        assert!(asleep.elapsed() < BEHIND_MOST / 2, "{:?}", asleep.elapsed());
        // (asked nothing, it sleeps all it was to)
        let dir = temp();
        let asleep = Instant::now();
        sleep_watching(&dir, Duration::from_millis(900));
        assert!(asleep.elapsed() >= Duration::from_millis(900));
    }

    #[test]
    fn a_job_far_back_in_the_queue_looks_for_its_turn_seldom_and_one_near_its_head_often() {
        // (one slot: the two next after the head look as the head does, quickly while new there; the next few at the old step; each further back a step more, up to ten seconds)
        assert_eq!(behind_step(0, 1, Duration::ZERO), QUICK_STEP);
        assert_eq!(behind_step(1, 1, Duration::ZERO), QUICK_STEP);
        assert_eq!(behind_step(1, 1, Duration::from_secs(60)), WAIT_STEP);
        assert_eq!(behind_step(2, 1, Duration::ZERO), WAIT_STEP);
        assert_eq!(behind_step(7, 1, Duration::ZERO), WAIT_STEP);
        assert_eq!(behind_step(10, 1, Duration::ZERO), PLACE_STEP * 3);
        assert_eq!(behind_step(500, 1, Duration::ZERO), BEHIND_MOST);
        // (four slots: the eight next after the head might each take one as they come free; further back, the steps shared)
        assert_eq!(behind_step(7, 4, Duration::ZERO), QUICK_STEP);
        assert_eq!(behind_step(8, 4, Duration::ZERO), WAIT_STEP);
        assert_eq!(behind_step(28, 4, Duration::ZERO), PLACE_STEP * 9 / 4);
        // (never asleep past its turn: the queue takes at least a third of a second a job, a slot, to come to it)
        for slots in [1u32, 2, 4, 8] {
            for ahead in 0..2000u32 {
                assert!(behind_step(ahead, slots, Duration::from_secs(60)).as_secs_f64() <= f64::from(ahead.saturating_sub(slots - 1).max(1)) / 3.0 / f64::from(slots) + WAIT_STEP.as_secs_f64(), "{slots} {ahead}");
            }
        }
        // (a thousand waiting look some 150 times a second together, where at one step each they looked 2,500)
        let looks: f64 = (0..1000).map(|k| 1.0 / behind_step(k, 1, Duration::from_secs(60)).as_secs_f64()).sum();
        assert!(looks < 160.0, "{looks}");
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
        let found = |beside: Vec<(String, PathBuf)>| Found { program: PathBuf::from(&program), activation: None, env: vec![], beside, processes: false };
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
        assert!(r.why.unwrap().contains("not a file of the job's"));

        // (nor one through a link in its folder, to a file of the chemist's anywhere)
        #[cfg(unix)]
        {
            let linked = shell(&root, READS, 1);
            let outside = root.join("outside.txt");
            fs::write(&outside, "the chemist's").unwrap();
            std::os::unix::fs::symlink(&outside, linked.join(WORK).join("link.txt")).unwrap();
            let spec = JobSpec { stdin: Some("link.txt".into()), ..read_spec(&linked).unwrap() };
            fs::write(linked.join(SPEC), serde_json::to_string(&spec).unwrap()).unwrap();
            run_job(&linked);
            let r = current_record(&linked).unwrap();
            assert_eq!(r.state, JobState::Failed);
            assert!(r.why.unwrap().contains("is a link"));
            assert!(!read_log(&linked, 0, LOG_MOST).0.contains("the chemist's"));
        }
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
    fn a_waiting_runner_gives_up_on_a_record_it_cannot_read_only_the_second_time_running() {
        let waiting = JobRecord::new(JobState::Waiting, 1);
        let ended = JobRecord::new(JobState::Gone, 1);
        let mut unsure = 0;
        // (held a moment - an antivirus reading it on Windows: waited on)
        assert!(!waits_no_more(&mut unsure, true, None));
        assert!(!waits_no_more(&mut unsure, true, Some(&waiting)));
        assert!(!waits_no_more(&mut unsure, false, Some(&waiting)));
        assert!(!waits_no_more(&mut unsure, true, Some(&waiting)));
        // (twice running: gone)
        assert!(!waits_no_more(&mut unsure, true, None));
        assert!(waits_no_more(&mut unsure, false, None));
        // (said ended: at once)
        let mut fresh = 0;
        assert!(waits_no_more(&mut fresh, true, Some(&ended)));
    }

    #[test]
    fn a_waiting_job_whose_folder_is_taken_away_waits_no_more() {
        let root = temp();
        let first = shell(&root, PAUSE, 1);
        std::thread::sleep(Duration::from_millis(5));
        let second = shell(&root, ECHO, 1);
        let a = {
            let d = first.clone();
            std::thread::spawn(move || run_job(&d))
        };
        wait_for(|| current_record(&first).is_some_and(|r| r.state == JobState::Running));
        let b = {
            let d = second.clone();
            std::thread::spawn(move || run_job(&d))
        };
        wait_for(|| current_record(&second).is_some_and(|r| r.state == JobState::Waiting));
        // (taken away while it waits - cleared, say: its runner goes, never to start it)
        for _ in 0..40 {
            if fs::remove_dir_all(&second).is_ok() || !second.exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let begun = std::time::Instant::now();
        assert_eq!(b.join().unwrap(), 1);
        assert!(begun.elapsed() < Duration::from_secs(3));
        assert!(!second.exists());
        a.join().unwrap();
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

    #[test]
    fn starts_a_job_where_its_cores_and_memory_fit_beside_those_running_and_never_one_ahead_of_its_turn() {
        let l = Limits { cores: 8, memory: 16_000 };
        // (nothing running: any job, a larger one than the limits included, runs alone)
        assert!(fits(l, (0, 0), 0, 32, 64_000));
        assert!(fits(l, (4, 8_000), 1, 4, 8_000));
        assert!(!fits(l, (4, 8_000), 1, 5, 1_000));
        assert!(!fits(l, (4, 8_000), 1, 2, 8_001));
        // (a job that declares no memory is counted by its cores alone; and limits with none - the computer's memory
        //  not told - count none)
        assert!(fits(l, (4, 16_000), 1, 4, 0));
        assert!(fits(Limits { cores: 8, memory: 0 }, (4, 16_000), 1, 4, 8_000));
        // (more than the computer has: refused, in plain words; within it, though over the limits, not)
        let here = Resources { cores: 10, physical: 10, memory: 32 * 1024 };
        assert_eq!(beyond(here, 12, 0).as_deref(), Some("it asks for 12 cores, and this computer has 10"));
        assert_eq!(beyond(here, 4, 40 * 1024).as_deref(), Some("it asks for 40.0 GB of memory, and this computer has 32.0 GB"));
        assert_eq!(beyond(here, 10, 32 * 1024), None);
        assert_eq!(beyond(Resources { cores: 10, physical: 10, memory: 0 }, 4, 40 * 1024), None);
        assert_eq!(slots_for(l, &JobSpec { cores: 3, ..read_spec(&sized(&temp(), "x", 3, 0)).unwrap() }), 2);

        // in the queue: two of 4 cores in 6 - the second waits, though a core-sized job behind it would fit
        let root = temp();
        write_limits(&root, Limits { cores: 6, memory: 0 }).unwrap();
        let first = sized(&root, PAUSE, 4, 0);
        std::thread::sleep(Duration::from_millis(5));
        let second = sized(&root, PAUSE, 4, 0);
        std::thread::sleep(Duration::from_millis(5));
        let small = sized(&root, PAUSE, 1, 0);
        let runners: Vec<_> = [&first, &second, &small]
            .iter()
            .map(|d| {
                let d = (*d).clone();
                std::thread::spawn(move || run_job(&d))
            })
            .collect();
        wait_for(|| current_record(&first).is_some_and(|r| r.state == JobState::Running));
        std::thread::sleep(Duration::from_millis(600));
        assert_eq!(current_record(&second).map(|r| r.state), Some(JobState::Waiting));
        assert_eq!(current_record(&small).map(|r| r.state), Some(JobState::Waiting), "it never jumps the one before it");
        for r in runners {
            r.join().unwrap();
        }
        // (each ran in the end, in the order asked for)
        let started = |d: &Path| current_record(d).and_then(|r| r.started).unwrap();
        assert!(started(&first) <= started(&second) && started(&second) <= started(&small));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn names_a_job_s_folder_from_its_label_path_safe_with_a_short_id_of_its_own() {
        assert_eq!(slug_of("BINOL Optimise"), "binol-optimise");
        assert_eq!(slug_of("  (R)-BINOL / opt #3 "), "r-binol-opt-3");
        // (a label in Japanese, or nothing ASCII: what ASCII it has; none, "job")
        assert_eq!(slug_of("\u{30d3}\u{30ca}\u{30d5}\u{30c1}\u{30eb} opt"), "opt");
        assert_eq!(slug_of("\u{30d3}\u{30ca}\u{30d5}\u{30c1}\u{30eb}"), "job");
        assert_eq!(slug_of(&"a".repeat(100)).len(), SLUG_MOST);
        assert!(!slug_of(&format!("{} b", "a".repeat(39))).ends_with('-'));
        let root = temp();
        let mut spec = read_spec(&sized(&root, ECHO, 1, 0)).unwrap();
        spec.label = Some("water Optimise".into());
        let (id, dir) = make_job(&root, &spec, &[]).unwrap();
        assert!(id.starts_with("water-optimise-") && id.len() == "water-optimise-".len() + 8, "{id}");
        assert_eq!(dir.file_name().unwrap().to_str(), Some(id.as_str()));
        assert!(job_id_ok(&id));
        // (one made before, as a UUID alone, still one of Meno's; anything else not)
        assert!(job_id_ok("4f1c2a9e-0b7d-4e55-9a3c-2f8e1d6b7a10"));
        for bad in ["../x-1234abcd", "water-optimise", "water optimise-1234abcd", "Water-1234abcd", "-x-1234abcd", "x--y-1234abcd", ".taken-1234abcd", "x-1234ABCD"] {
            assert!(!job_id_ok(bad), "{bad}");
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn makes_jobs_in_the_working_folder_chosen_finds_those_made_before_and_changes_it_only_while_none_is_under_way() {
        let data = temp();
        let scratch = temp();
        assert_eq!(jobs_roots(&data), vec![jobs_in(&data)]);
        write_limits(&jobs_in(&data), Limits { cores: 3, memory: 4096 }).unwrap();
        // (one made in Meno's own before)
        let before = sized(&jobs_in(&data), ECHO, 1, 0);
        write_record(&before, &JobRecord { ended: Some(now_ms()), ..JobRecord::new(JobState::Done, now_ms()) }).unwrap();
        choose_folder(&data, Some(scratch.to_str().unwrap())).unwrap();
        let chosen = scratch.join(IN_CHOSEN);
        assert_eq!(jobs_roots(&data), vec![chosen.clone(), jobs_in(&data)]);
        // (what jobs may use goes with it)
        assert_eq!(limits_in(&chosen), Limits { cores: 3, memory: 4096 });
        // (a job made there: its runner takes it, as one in Meno's own; one elsewhere, never)
        let (_, dir) = make_job(&chosen, &read_spec(&before).unwrap(), &[]).unwrap();
        assert!(runner_folder(&data, &dir).is_ok());
        assert!(runner_folder(&data, &before).is_ok());
        let elsewhere = temp();
        let (_, stray) = make_job(&elsewhere, &read_spec(&before).unwrap(), &[]).unwrap();
        assert!(runner_folder(&data, &stray).is_err());
        // (a job waiting: the folder is not changed)
        write_record(&dir, &JobRecord::new(JobState::Waiting, now_ms())).unwrap();
        let lock = OpenOptions::new().create(true).truncate(false).write(true).open(dir.join(RUNNER_LOCK)).unwrap();
        lock.lock().unwrap();
        assert_eq!(choose_folder(&data, None), Err("1 job wait or run: the folder is changed once they have ended".into()));
        drop(lock);
        write_record(&dir, &JobRecord { ended: Some(now_ms()), ..JobRecord::new(JobState::Done, now_ms()) }).unwrap();
        // (Meno's own again; a folder that is not one, refused)
        choose_folder(&data, None).unwrap();
        assert_eq!(jobs_roots(&data), vec![jobs_in(&data)]);
        assert!(choose_folder(&data, Some("relative/path")).is_err());
        assert!(choose_folder(&data, Some(data.join("not there").to_str().unwrap())).is_err());
        // (one chosen and gone since - a drive not connected: still the one chosen, and no job made in Meno's own
        //  instead - said, until another is chosen)
        let gone = temp();
        choose_folder(&data, Some(gone.to_str().unwrap())).unwrap();
        fs::remove_dir_all(&gone).unwrap();
        assert_eq!(jobs_roots(&data), vec![gone.join(IN_CHOSEN), jobs_in(&data)]);
        assert_eq!(new_jobs_root(&data), Err(missing_folder(&gone)));
        assert!(!gone.exists());
        choose_folder(&data, None).unwrap();
        assert_eq!(new_jobs_root(&data), Ok(jobs_in(&data)));
        for d in [data, scratch, elsewhere] {
            let _ = fs::remove_dir_all(d);
        }
    }

    // (the same job in both jobs' folders - copied by hand, say: listed once, from the chosen one, as job_in finds it)
    #[test]
    fn lists_a_job_in_both_jobs_folders_once_from_the_first() {
        let chosen = temp();
        let own = temp();
        let dir = sized(&own, ECHO, 1, 0);
        write_record(&dir, &JobRecord { ended: Some(now_ms()), ..JobRecord::new(JobState::Failed, now_ms()) }).unwrap();
        let id = dir.file_name().unwrap().to_str().unwrap().to_string();
        let copy = chosen.join(&id);
        fs::create_dir_all(&copy).unwrap();
        fs::copy(dir.join(SPEC), copy.join(SPEC)).unwrap();
        write_record(&copy, &JobRecord { ended: Some(now_ms()), ..JobRecord::new(JobState::Done, now_ms()) }).unwrap();
        let roots = [chosen.clone(), own.clone()];
        let listed = listed_in(&roots);
        assert_eq!(listed.iter().map(|j| (j.id.as_str(), j.record.state)).collect::<Vec<_>>(), [(id.as_str(), JobState::Done)]);
        assert_eq!(job_in(&roots, &id), Some(copy));
        for d in [chosen, own] {
            let _ = fs::remove_dir_all(d);
        }
    }

    #[test]
    fn takes_the_limits_settings_wrote_and_this_computer_s_where_none_are() {
        let root = temp();
        assert_eq!(limits_in(&root), default_limits());
        assert!(default_limits().cores >= 1);
        write_limits(&root, Limits { cores: 3, memory: 2048 }).unwrap();
        assert_eq!(limits_in(&root), Limits { cores: 3, memory: 2048 });
        // (the computer's memory told: three quarters of it, by default)
        let here = computer();
        assert!(here.memory > 0, "{here:?}");
        assert_eq!(default_limits().memory, here.memory / 4 * 3);
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

    /// This test binary, started again by
    /// `a_runner_asked_to_go_stops_its_program_and_says_so`, runs one job as
    /// `Meno --job <folder>` would, then exits. Started as a test, it does nothing.
    #[cfg(unix)]
    #[test]
    fn runner_child() {
        if let Some(dir) = std::env::var_os("MENO_TEST_RUN_JOB") {
            std::process::exit(run_as_runner(Path::new(&dir)));
        }
    }

    /// A runner asked to go (SIGTERM: a logout, `kill`, Activity Monitor's
    /// Quit) stops its program, in its group of its own, and writes the job
    /// stopped - never goes leaving it running, the job read as gone and its
    /// turn free for the next.
    #[cfg(unix)]
    #[test]
    fn a_runner_asked_to_go_stops_its_program_and_says_so() {
        let root = temp();
        let dir = shell(&root, "echo $$ > program.pid; exec sleep 30", 1);
        let mut runner = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "jobs::tests::runner_child", "--test-threads=1"])
            .env("MENO_TEST_RUN_JOB", &dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        wait_for(|| read_work_file(&dir, "program.pid").is_ok_and(|s| s.ends_with('\n')));
        let program: libc::pid_t = read_work_file(&dir, "program.pid").unwrap().trim().parse().unwrap();
        unsafe { libc::kill(runner.id() as libc::pid_t, libc::SIGTERM) };
        let t = Instant::now();
        let _ = runner.wait();
        let took = t.elapsed();
        while unsafe { libc::kill(program, 0) } == 0 && t.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(50));
        }
        let runs_on = unsafe { libc::kill(program, 0) } == 0;
        let state = current_record(&dir).map(|r| r.state);
        // (the test's own clean-up, whatever it found)
        unsafe { libc::killpg(program, libc::SIGKILL) };
        let _ = fs::remove_dir_all(&root);
        assert!(!runs_on, "its program ({program}) runs on, its runner gone");
        assert_eq!(state, Some(JobState::Stopped));
        assert!(took < STOP_GRACE + Duration::from_secs(2), "it took {took:?} to go");
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
        assert_eq!(current_record(&dir).unwrap().why, None);
        // (a folder with what it was to run but no record, past its start: gone, saying it has no record)
        let mut spec = read_spec(&dir).unwrap();
        spec.created = now_ms() - 2 * STARTING_MS;
        let (_, bare) = make_job(&root, &spec, &[]).unwrap();
        assert_eq!(current_record(&bare).map(|r| (r.state, r.why)), Some((JobState::Gone, Some(NO_RECORD.to_string()))));
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

    #[cfg(unix)]
    #[test]
    fn lists_a_job_s_files_without_following_links_however_they_loop() {
        use std::os::unix::fs::symlink;
        let root = temp();
        let dir = shell(&root, ECHO, 1);
        let work = dir.join(WORK);
        for sub in ["x", "y"] {
            fs::create_dir_all(work.join(sub)).unwrap();
        }
        fs::write(work.join("x").join("real.txt"), "").unwrap();
        // a link to its own folder; two folders linking to each other; two links to each other; a link to a file
        symlink(&work, work.join("self")).unwrap();
        symlink(work.join("y"), work.join("x").join("to-y")).unwrap();
        symlink(work.join("x"), work.join("y").join("to-x")).unwrap();
        symlink(work.join("b"), work.join("a")).unwrap();
        symlink(work.join("a"), work.join("b")).unwrap();
        symlink(work.join("input.txt"), work.join("also.txt")).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        {
            let dir = dir.clone();
            std::thread::spawn(move || tx.send(work_files(&dir)));
        }
        let listed = rx.recv_timeout(Duration::from_secs(10)).expect("listed in finite time");
        assert_eq!(listed, vec!["input.txt", "x/real.txt"]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn lists_a_job_s_files_only_so_deep_and_so_many() {
        let base = temp();
        let folders = [base.clone(), base.join("a"), base.join("a").join("b"), base.join("a").join("b").join("c")];
        for (i, at) in folders.iter().enumerate() {
            fs::create_dir_all(at).unwrap();
            fs::write(at.join(format!("f{i}")), "").unwrap();
        }
        assert_eq!(files_within(&base, WORK_DEEPEST, WORK_MOST), ["a/b/c/f3", "a/b/f2", "a/f1", "f0"]);
        assert_eq!(files_within(&base, 1, WORK_MOST), ["a/f1", "f0"]);
        assert_eq!(files_within(&base, 0, WORK_MOST), ["f0"]);
        assert!(files_within(&base, WORK_DEEPEST, 2).len() <= 1);
        let _ = fs::remove_dir_all(base);
        // (folders counted too: fifty folders of a file each, ten looked at - five folders and their files, in whatever order they come)
        let many = temp();
        for i in 0..50 {
            fs::create_dir_all(many.join(format!("d{i}"))).unwrap();
            fs::write(many.join(format!("d{i}")).join("f"), "").unwrap();
        }
        assert_eq!(files_within(&many, WORK_DEEPEST, 10).len(), 5);
        let _ = fs::remove_dir_all(many);
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

    #[test]
    fn a_job_s_digest_is_of_its_log_and_every_file_it_wrote() {
        let root = temp();
        let dir = shell(&root, ECHO, 1);
        let first = digest_of(&dir).unwrap();
        assert_eq!(digest_of(&dir).unwrap(), first);
        assert_eq!(first.len(), 64);
        fs::write(dir.join(LOG), "ran\n").unwrap();
        let logged = digest_of(&dir).unwrap();
        assert_ne!(logged, first);
        fs::write(dir.join(WORK).join("out.txt"), "1.0").unwrap();
        let wrote = digest_of(&dir).unwrap();
        assert_ne!(wrote, logged);
        // (a byte changed; the same bytes under another name)
        fs::write(dir.join(WORK).join("out.txt"), "1.1").unwrap();
        assert_ne!(digest_of(&dir).unwrap(), wrote);
        fs::write(dir.join(WORK).join("out.txt"), "1.0").unwrap();
        assert_eq!(digest_of(&dir).unwrap(), wrote);
        fs::rename(dir.join(WORK).join("out.txt"), dir.join(WORK).join("out2.txt")).unwrap();
        let renamed = digest_of(&dir).unwrap();
        assert_ne!(renamed, wrote);
        // (what the system writes as the folder is looked at - Finder's, Explorer's - no output: left out)
        fs::create_dir_all(dir.join(WORK).join("sub")).unwrap();
        for name in [".DS_Store", "._out2.txt", "Thumbs.db", "desktop.ini", "sub/.DS_Store", "sub/THUMBS.DB"] {
            fs::write(dir.join(WORK).join(name), "seen").unwrap();
        }
        assert_eq!(digest_of(&dir).unwrap(), renamed);
        // (a file of the job's own beginning with a dot is no such file)
        fs::write(dir.join(WORK).join(".hidden-output"), "x").unwrap();
        assert_ne!(digest_of(&dir).unwrap(), renamed);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_program_s_stamp_changes_as_it_is_replaced() {
        let root = temp();
        let program = root.join("prog");
        fs::write(&program, "one").unwrap();
        let first = stamp_of(&program).unwrap();
        assert_eq!(stamp_of(&program).unwrap(), first);
        // (replaced by one as long, later)
        std::thread::sleep(Duration::from_millis(20));
        fs::write(&program, "two").unwrap();
        assert_ne!(stamp_of(&program).unwrap(), first);
        assert!(stamp_of(&root.join("none")).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn takes_finished_jobs_away_out_of_the_way_first_and_what_was_left_of_others() {
        let root = temp();
        let done = shell(&root, ECHO, 1);
        write_record(&done, &JobRecord { ended: Some(3), code: Some(0), ..JobRecord::new(JobState::Done, 1) }).unwrap();
        let failed = shell(&root, ECHO, 1);
        write_record(&failed, &JobRecord { ended: Some(3), code: Some(1), ..JobRecord::new(JobState::Failed, 1) }).unwrap();
        // (waiting: its runner starting - not taken)
        let waiting = shell(&root, ECHO, 1);
        // (left of one taken away before, a file in it held then)
        let left = root.join(format!("{TAKEN}0123"));
        fs::create_dir_all(left.join("work")).unwrap();
        fs::write(left.join(SPEC), fs::read(waiting.join(SPEC)).unwrap()).unwrap();
        // (a folder not named as Meno names jobs - another's, in a working folder chosen - left, finished or not)
        let theirs = root.join("their-results");
        fs::create_dir_all(theirs.join("work")).unwrap();
        fs::copy(done.join(SPEC), theirs.join(SPEC)).unwrap();
        fs::copy(done.join(RECORD), theirs.join(RECORD)).unwrap();
        assert_eq!(clear_finished(&root).unwrap(), 2);
        assert!(!done.exists() && !failed.exists() && !left.exists());
        assert!(waiting.exists() && theirs.exists());
        // (and one alone, by the same way: nothing of it left under its id)
        let one = shell(&root, ECHO, 1);
        write_record(&one, &JobRecord { ended: Some(3), ..JobRecord::new(JobState::Stopped, 1) }).unwrap();
        take_away(&one).unwrap();
        assert!(!one.exists());
        let names: Vec<String> = fs::read_dir(&root).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert!(names.iter().all(|n| !n.starts_with(TAKEN)), "{names:?}");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn takes_out_what_a_finished_job_made_keeping_what_it_was_given_and_its_log() {
        let root = temp();
        let dir = shell(&root, ECHO, 1);
        assert_eq!(read_spec(&dir).unwrap().given, vec!["input.txt".to_string()]);
        // (running: nothing taken)
        assert!(trim_made(&dir).is_err());
        fs::create_dir_all(dir.join(WORK).join("frames/deep")).unwrap();
        fs::write(dir.join(WORK).join("frames/f_0001.png"), vec![0u8; 1000]).unwrap();
        fs::write(dir.join(WORK).join("frames/deep/f_0002.png"), vec![0u8; 24]).unwrap();
        fs::write(dir.join(WORK).join("half.mp4"), vec![0u8; 100]).unwrap();
        fs::write(dir.join(LOG), "TypeError: a stand-in\n").unwrap();
        write_record(&dir, &JobRecord { ended: Some(3), code: Some(1), ..JobRecord::new(JobState::Failed, 1) }).unwrap();
        let before = finished_bytes(&root);
        assert!(before >= 1124, "{before}");
        assert_eq!(trim_made(&dir).unwrap(), 1124);
        assert_eq!(work_files(&dir), vec!["input.txt".to_string()]);
        assert!(!dir.join(WORK).join("frames").exists());
        assert!(dir.join(LOG).exists() && dir.join(SPEC).exists() && dir.join(RECORD).exists());
        assert_eq!(finished_bytes(&root), before - 1124);
        // (a job waiting or running counts for nothing)
        let waiting = shell(&root, ECHO, 1);
        fs::write(waiting.join(WORK).join("big.bin"), vec![0u8; 5000]).unwrap();
        assert_eq!(finished_bytes(&root), before - 1124);
        let _ = fs::remove_dir_all(root);
    }

    /// A job's program is in its job object before it has run at all - held,
    /// it has written nothing - and runs to its end once let go (Windows).
    #[cfg(windows)]
    #[test]
    fn a_program_is_started_in_its_job_object_then_let_go() {
        let root = temp();
        let mark = root.join("ran.txt");
        let (sh, flag) = shell_program();
        let mut cmd = Command::new(&sh);
        // (written by a name in its folder: no quoting for cmd to read otherwise)
        cmd.current_dir(&root).arg(flag).arg("echo ran>ran.txt").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        let (mut child, job) = start_held(&mut cmd).unwrap();
        let mut inside = 0;
        unsafe {
            use std::os::windows::io::AsRawHandle;
            windows_sys::Win32::System::JobObjects::IsProcessInJob(child.as_raw_handle() as _, job.0, &mut inside);
        }
        assert_ne!(inside, 0);
        // (held: nothing of it has run)
        std::thread::sleep(Duration::from_millis(300));
        assert!(!mark.exists());
        assert!(let_go(child.id()));
        assert!(child.wait().unwrap().success());
        assert!(mark.exists());
        // (and a job's program goes the same way)
        let dir = shell(&root, ECHO, 1);
        let mut program = spawn_program(&dir, &sh, &[flag.into(), "ping -n 2 127.0.0.1 >nul".into()], &BTreeMap::new(), None, LOG).unwrap();
        assert!(program.child.wait().unwrap().success());
        let _ = fs::remove_dir_all(root);
    }

    /// One taken away part way - its record gone, its spec left, made a moment
    /// ago - reads as waiting: the queue passes over it, not waiting on it.
    #[test]
    fn a_job_taken_away_part_way_does_not_hold_the_queue() {
        let root = temp();
        let earlier = shell(&root, ECHO, 1);
        std::thread::sleep(Duration::from_millis(5));
        let mine = shell(&root, ECHO, 1);
        let taken = root.join(format!("{TAKEN}4567"));
        fs::rename(&earlier, &taken).unwrap();
        let _ = fs::remove_file(taken.join(RECORD));
        assert_eq!(current_record(&taken).map(|r| r.state), Some(JobState::Waiting));
        let spec = read_spec(&mine).unwrap();
        assert!(matches!(take_turn(&mine, &spec, &JobRecord::new(JobState::Waiting, spec.created)).unwrap(), Turn::Taken));
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
        let (data, dir) = plugin(r#"["xtb", "crest", {"name": "named"}, "bash", "bash.exe", "CMD.EXE"]"#, &[&exe("xtb"), &exe("crest"), &exe("named"), &exe("bash"), &exe("bash.exe"), &exe("CMD.EXE"), &exe("other")]);
        let found = plugin_program(&data, &dir, "demo", "xtb", &["in.xyz".into(), "--opt".into()]).unwrap();
        assert!(found.program.ends_with(exe("xtb")));
        assert!(found.activation.is_none());
        assert!(plugin_program(&data, &dir, "demo", "crest", &[]).is_ok());
        // not named - by name, as the manifest's reader takes them; never a shell, named or not; a name, not a path
        assert!(plugin_program(&data, &dir, "demo", "other", &[]).is_err());
        assert!(plugin_program(&data, &dir, "demo", "named", &[]).is_err());
        assert!(plugin_program(&data, &dir, "demo", "bash", &[]).is_err());
        // (a shell by its stem, with its extension: as Windows finds `cmd.exe`)
        assert!(plugin_program(&data, &dir, "demo", "bash.exe", &[]).unwrap_err().contains("not a program a job runs"));
        assert!(plugin_program(&data, &dir, "demo", "CMD.EXE", &[]).unwrap_err().contains("not a program a job runs"));
        assert!(plugin_program(&data, &dir, "demo", "../xtb", &[]).is_err());
        assert!(plugin_program(&data, &dir, "../demo", "xtb", &[]).is_err());
        // named, but not in its environment
        let (empty, dir2) = plugin(r#"["xtb"]"#, &[]);
        assert!(plugin_program(&empty, &dir2, "demo", "xtb", &[]).unwrap_err().contains("not in"));
        let _ = fs::remove_dir_all(data.parent().unwrap());
        let _ = fs::remove_dir_all(empty.parent().unwrap());
    }

    /// A job's spec as `job_start` makes it, for what was found.
    fn spec_for(plugin: &str, name: &str, found: &Found, args: &[&str]) -> JobSpec {
        JobSpec {
            plugin: plugin.into(),
            name: name.into(),
            program: found.program.to_string_lossy().into_owned(),
            args: args.iter().map(|a| a.to_string()).collect(),
            stdin: None,
            env: given_env(found, 4567, Some(2)),
            cores: 2,
            processes: found.processes,
            memory: 0,
            created: now_ms(),
            label: None,
            key: None,
            then: vec![],
            needs: vec![],
            presets: vec![],
            given: vec![],
        }
    }

    #[test]
    fn a_runner_takes_only_a_folder_in_meno_s_jobs_folder() {
        let base = temp();
        let data = base.join("data");
        let jobs = data.join("jobs");
        // (no jobs' folder yet: nothing is one)
        let elsewhere = shell(&base.join("elsewhere"), ECHO, 1);
        assert!(runner_folder(&data, &elsewhere).is_err());
        let (id, dir) = make_job(&jobs, &read_spec(&elsewhere).unwrap(), &[]).unwrap();
        // (the folder checked, canonical: on Windows, as programs take it)
        let checked = plain(jobs.canonicalize().unwrap().join(&id));
        assert_eq!(runner_folder(&data, &dir), Ok(checked.clone()));
        assert_eq!(runner_folder(&data, &dir.join(WORK).join("..")), Ok(checked.clone()));
        #[cfg(windows)]
        assert!(!checked.to_string_lossy().starts_with(r"\\?\"));
        // outside it, by its path or by `..`; inside one; not by an id Meno gives; holding nothing to run
        let up = jobs.join(&id).join("..").join("..").join("..").join("elsewhere").join(elsewhere.file_name().unwrap());
        let inside = make_job(&dir.join(WORK), &read_spec(&dir).unwrap(), &[]).unwrap().1;
        let named = jobs.join("not-an-id");
        fs::create_dir_all(&named).unwrap();
        fs::copy(dir.join(SPEC), named.join(SPEC)).unwrap();
        let empty = jobs.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&empty).unwrap();
        for bad in [&elsewhere, &up, &inside, &named, &empty, &jobs, &jobs.join(SPEC)] {
            assert!(runner_folder(&data, bad).is_err(), "{}", bad.display());
        }
        // a link in it to a folder outside
        #[cfg(unix)]
        {
            let link = jobs.join(uuid::Uuid::new_v4().to_string());
            std::os::unix::fs::symlink(&elsewhere, &link).unwrap();
            assert!(runner_folder(&data, &link).is_err());
        }
        // and the runner, refusing one, writes nothing and ends saying so
        let empty_plugins = base.join("plugins");
        assert_eq!(runner(&data, &empty_plugins, &elsewhere), 1);
        assert!(!elsewhere.join(RECORD).exists() && !elsewhere.join(RUNNER_LOCK).exists() && !elsewhere.join(LOG).exists());
        assert!(!base.join("elsewhere").join(QUEUE_LOCK).exists());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_runner_runs_only_what_job_start_would_have_it_run() {
        let exe = |n: &str| if cfg!(windows) { format!("{n}.exe") } else { n.to_string() };
        let (data, dir) = plugin(r#"["xtb"]"#, &[&exe("xtb"), &exe("other")]);
        let plugins = dir.parent().unwrap().to_path_buf();
        let found = plugin_program(&data, &dir, "demo", "xtb", &[]).unwrap();
        let good = spec_for("demo", "xtb", &found, &["in.xyz"]);
        assert_eq!(spec_allowed(&data, &plugins, &good, &[]), Ok(()));
        // a program its plugin does not name; another file under a name it names; another plugin's
        let other = Found { program: found.program.with_file_name(exe("other")), ..plugin_program(&data, &dir, "demo", "xtb", &[]).unwrap() };
        assert!(spec_allowed(&data, &plugins, &spec_for("demo", "other", &other, &[]), &[]).unwrap_err().contains("names no program other"));
        let (program, _) = shell_program();
        let elsewhere = JobSpec { program, ..good.clone() };
        assert!(spec_allowed(&data, &plugins, &elsewhere, &[]).is_err());
        for plugin in ["../demo", "absent"] {
            assert!(spec_allowed(&data, &plugins, &JobSpec { plugin: plugin.into(), ..good.clone() }, &[]).is_err(), "{plugin}");
        }
        // given what Meno does not give: code loaded into it, a network of its own, no proxy, programs after it
        let with = |k: &str, v: &str| {
            let mut env = good.env.clone();
            env.insert(k.into(), v.into());
            JobSpec { env, ..good.clone() }
        };
        for (k, v) in [("DYLD_INSERT_LIBRARIES", "/tmp/x.dylib"), ("LD_PRELOAD", "/tmp/x.so"), ("PYTHONPATH", "/tmp"), ("HTTPS_PROXY", "http://example.org:8080"), ("OMP_NUM_THREADS", "lots")] {
            assert!(spec_allowed(&data, &plugins, &with(k, v), &[]).is_err(), "{k}");
        }
        let unrouted = JobSpec { env: BTreeMap::new(), ..good.clone() };
        assert!(spec_allowed(&data, &plugins, &unrouted, &[]).unwrap_err().contains("not pointed at Meno's network"));
        let then = JobSpec { then: vec![Then { name: "sh".into(), program: shell_program().0, args: vec![] }], ..good.clone() };
        assert!(spec_allowed(&data, &plugins, &then, &[]).is_err());

        // and run by the runner: refused, failing, saying why, nothing run; allowed, run
        let jobs = data.join("jobs");
        let refused = make_job(&jobs, &with("LD_PRELOAD", "/tmp/x.so"), &[]).unwrap().1;
        assert_eq!(runner(&data, &plugins, &refused), 1);
        let r = current_record(&refused).unwrap();
        assert_eq!((r.state, r.started), (JobState::Failed, None));
        assert!(r.why.unwrap().contains("Meno does not run it"));
        assert!(!refused.join(LOG).exists());
        #[cfg(unix)]
        {
            fs::write(&found.program, "#!/bin/sh\necho ran\n").unwrap();
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&found.program, fs::Permissions::from_mode(0o755)).unwrap();
            let ran = make_job(&jobs, &good, &[]).unwrap().1;
            assert_eq!(runner(&data, &plugins, &ran), 0);
            assert_eq!(current_record(&ran).unwrap().state, JobState::Done);
            assert_eq!(read_log(&ran, 0, LOG_MOST).0, "ran\n");
        }
        let _ = fs::remove_dir_all(data.parent().unwrap());
    }

    #[test]
    fn a_program_installed_separately_is_given_its_job_s_files_options_and_numbers_alone() {
        let written = ["input.inp".to_string(), "wavefunction.molden".to_string(), "nci.txt".to_string()];
        let ok = |args: &[&str]| names_only_written(&args.iter().map(|a| a.to_string()).collect::<Vec<_>>(), &written);
        // ORCA, orca_2mkl, Multiwfn, Gaussian, as their plugins ask
        assert_eq!(ok(&["input.inp"]), Ok(()));
        assert_eq!(ok(&["input", "-molden"]), Ok(()));
        assert_eq!(ok(&["wavefunction.molden", "-nt", "4", "-silent"]), Ok(()));
        assert_eq!(ok(&[]), Ok(()));
        assert_eq!(ok(&["--chrg", "-1", "0.5"]), Ok(()));
        for bad in ["/etc/hosts", "../input.inp", "./input.inp", "other.inp", "molden", "--in=input.inp", "-", "--", "-1x", ".5", "1.", ""] {
            assert!(ok(&[bad]).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_runner_runs_a_program_installed_separately_only_as_its_plugin_declares_it() {
        let base = temp();
        let plugins = base.join("plugins");
        let plugin = plugins.join("demo");
        fs::create_dir_all(&plugin).unwrap();
        let exe = |n: &str| if cfg!(windows) { format!("{n}.exe") } else { n.to_string() };
        let manifest = serde_json::json!({
            "id": "demo",
            "installed": [{"name": "orca", "files": {system(): exe("orca")}, "path": ["{folder}"], "beside": {"orca_2mkl": {system(): exe("orca_2mkl")}}}],
            "steps": [{"kinds": ["energy"], "programs": ["orca"]}]
        });
        fs::write(plugin.join("manifest.json"), manifest.to_string()).unwrap();
        let orca = program_file(&base.join("orca_6"), &exe("orca"));
        program_file(&base.join("orca_6"), &exe("orca_2mkl"));
        let found = installed_program(&plugin, "demo", "orca", orca.to_str()).unwrap().unwrap();
        let mut good = spec_for("demo", "orca", &found, &["input.inp"]);
        good.then = then_of(&found, "orca", &[ThenAsk { program: "orca_2mkl".into(), args: vec!["input".into()] }]).unwrap();
        let data = base.join("data");
        let written = vec!["input.inp".to_string()];
        assert_eq!(spec_allowed(&data, &plugins, &good, &written), Ok(()));
        // a file of another name where it was located; one beside it it does not declare
        let other = program_file(&base.join("orca_6"), &exe("orcb"));
        assert!(spec_allowed(&data, &plugins, &JobSpec { program: other.to_string_lossy().into_owned(), ..good.clone() }, &written).is_err());
        let mut beside = good.clone();
        beside.then[0].program = other.to_string_lossy().into_owned();
        assert!(spec_allowed(&data, &plugins, &beside, &written).is_err());
        // what its declaration does not give it
        let mut env = good.env.clone();
        env.insert("GAUSS_EXEDIR".into(), base.to_string_lossy().into_owned());
        assert!(spec_allowed(&data, &plugins, &JobSpec { env, ..good.clone() }, &written).is_err());
        // a file not written for it, by its arguments or those of one beside it
        for arg in ["/etc/hosts", "../other/input.inp", "other.inp", "--input=/etc/hosts", "-o/etc/hosts", "C:\\x.inp"] {
            let args = JobSpec { args: vec![arg.into()], ..good.clone() };
            assert!(spec_allowed(&data, &plugins, &args, &written).unwrap_err().contains("is not a file written for it"), "{arg}");
            let mut then = good.clone();
            then.then[0].args = vec![arg.into()];
            assert!(spec_allowed(&data, &plugins, &then, &written).is_err(), "{arg}");
        }
        assert!(spec_allowed(&data, &plugins, &good, &[]).is_err());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_runner_takes_a_job_made_in_the_local_data_folder() {
        // (where the runner looks: the folder Tauri gives as the local one, in which Meno makes jobs - on Windows not the roaming one)
        let here = data_dir_here().unwrap();
        #[cfg(windows)]
        {
            let local = PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap()).join("Meno").join("data");
            assert_eq!(here, local);
            assert!(!here.starts_with(std::env::var_os("APPDATA").unwrap()));
        }
        #[cfg(target_os = "macos")]
        assert_eq!(here, PathBuf::from(std::env::var_os("HOME").unwrap()).join("Library").join("Application Support").join("Meno"));
        // (a job made as job_start makes it, in a local data folder: taken by its runner)
        let base = temp();
        let data = base.join("local");
        let source = shell(&base.join("source"), ECHO, 1);
        let (id, dir) = make_job(&jobs_in(&data), &read_spec(&source).unwrap(), &[]).unwrap();
        assert_eq!(runner_folder(&data, &dir), Ok(plain(jobs_in(&data).canonicalize().unwrap().join(&id))));
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_runner_finds_meno_s_local_data_folder_as_tauri_has_it() {
        let conf: serde_json::Value = serde_json::from_str(&fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json")).unwrap()).unwrap();
        assert_eq!(conf["productName"], "Meno");
        // (the folder the app has as its local one: folders.rs checks that against the config)
        assert_eq!(data_dir_here(), crate::folders::local_data_dir());
        let local = if cfg!(windows) { Path::new("Meno").join("data") } else { PathBuf::from("Meno") };
        assert!(data_dir_here().is_some_and(|d| d.is_absolute() && d.ends_with(&local)));
        assert!(plugins_here().is_some_and(|p| p.ends_with(Path::new("resources").join("plugins"))));
    }

    #[test]
    fn reads_the_port_a_job_was_pointed_at() {
        let env = |v: &str| BTreeMap::from([("HTTPS_PROXY".to_string(), v.to_string())]);
        assert_eq!(proxy_port_of(&env("http://127.0.0.1:4567")), Some(4567));
        assert_eq!(proxy_port_of(&env("http://127.0.0.1:0")), Some(0));
        for bad in ["http://meno:t@127.0.0.1:4567", "http://127.0.0.1:+1", "http://127.0.0.1:70000", "http://10.0.0.1:80", ""] {
            assert_eq!(proxy_port_of(&env(bad)), None, "{bad}");
        }
        assert_eq!(proxy_port_of(&BTreeMap::new()), None);
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
        let decl = Installed { name: "orca".into(), file: "orca".into(), path: vec!["{folder}".into()], env: vec![("ORCA_HOME".into(), vec!["{parent}".into()])], places: vec![], label: "ORCA".into(), version: None, beside: vec![], processes: false };
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
        let decl = Installed { name: "g16".into(), file: "g16".into(), path: vec![], env: vec![], places: vec![], label: "x".into(), version: None, beside: vec![], processes: false };
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
        let place = |t: &str| Installed { name: "blender".into(), file: file.into(), path: vec![], env: vec![], places: vec![t.into()], label: "x".into(), version: None, beside: vec![], processes: false };
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
        let decl = Installed { name: "blender".into(), file: "Blender".into(), path: vec![], env: vec![], places: vec![], label: "x".into(), version: None, beside: vec![], processes: false };
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
            processes: false,
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

    #[cfg(unix)]
    #[test]
    fn hears_a_program_say_its_version_though_it_leaves_one_running_that_holds_its_output() {
        let base = temp();
        let p = program_file(&base, "blender");
        // (it says its version and goes, leaving a child of its own that keeps its output open half a minute)
        fs::write(&p, "#!/bin/sh\necho \"Blender 5.2.2 LTS\"\nsleep 30 &\n").unwrap();
        let rule = VersionRule { args: vec!["--version".into()], after: "Blender ".into(), least: "5.0".into() };
        let begun = std::time::Instant::now();
        assert_eq!(version_of(&p, &rule), Some("5.2.2".into()));
        assert!(begun.elapsed() < std::time::Duration::from_secs(5), "{:?}", begun.elapsed());
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn compares_names_as_a_person_reads_them() {
        let mut names = vec!["Blender 4.5", "Blender 10.0", "Blender 5.2", "Blender 5.10"];
        names.sort_by(|a, b| natural(a, b));
        assert_eq!(names, vec!["Blender 4.5", "Blender 5.2", "Blender 5.10", "Blender 10.0"]);
    }

    #[cfg(unix)]
    #[test]
    fn reads_no_file_through_a_link_a_job_left() {
        let dir = std::env::temp_dir().join(format!("meno-read-{}", uuid::Uuid::new_v4()));
        let work = dir.join(WORK);
        fs::create_dir_all(work.join("sub")).unwrap();
        fs::write(work.join("out.txt"), "mine").unwrap();
        fs::write(work.join("sub/deep.txt"), "deep").unwrap();
        let outside = dir.join("outside.txt");
        fs::write(&outside, "the chemist's").unwrap();
        std::os::unix::fs::symlink(&outside, work.join("link.txt")).unwrap();
        std::os::unix::fs::symlink(&dir, work.join("up")).unwrap();
        assert_eq!(read_work_file(&dir, "out.txt").unwrap(), "mine");
        assert_eq!(read_work_file(&dir, "sub/deep.txt").unwrap(), "deep");
        assert!(read_work_file(&dir, "link.txt").is_err());
        assert!(read_work_file(&dir, "up/outside.txt").is_err());
        assert!(read_work_file(&dir, "../outside.txt").is_err());
        assert!(read_work_file(&dir, "sub").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_no_file_of_a_job_s_past_its_size() {
        let dir = std::env::temp_dir().join(format!("meno-read-{}", uuid::Uuid::new_v4()));
        let work = dir.join(WORK);
        fs::create_dir_all(&work).unwrap();
        fs::write(work.join("small.txt"), "a".repeat(1 << 20)).unwrap();
        fs::write(work.join("large.txt"), "a".repeat((1 << 20) + 1)).unwrap();
        fs::write(work.join("odd.txt"), b"caf\xe9").unwrap();
        assert_eq!(read_work_file_within(&dir, "small.txt", 1 << 20).unwrap().len(), 1 << 20);
        assert_eq!(read_work_file_within(&dir, "large.txt", 1 << 20), Err("large.txt is too large to read: 2 MB, past 1 MB".into()));
        assert_eq!(read_work_file(&dir, "odd.txt").unwrap(), "caf\u{fffd}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_what_a_plugin_declares_its_jobs_need_of_another_plugins_program_and_refuses_what_cannot_be_given() {
        // (ORCA's, as Meno carries it: the xTB plugin's xtb, told in XTBEXE)
        let orca: serde_json::Value = serde_json::from_str(&fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/plugins/orca/manifest.json")).unwrap()).unwrap();
        assert_eq!(needs_declared(&orca, "orca").unwrap(), vec![Need { plugin: "xtb".into(), versions: ">=0.1.4 <0.2.0".into(), program: "xtb".into(), env: "XTBEXE".into() }]);
        assert_eq!(needs_declared(&serde_json::json!({}), "orca").unwrap(), vec![]);
        // (one used only for some of its work: its programs needed by the jobs that say so, as any)
        assert_eq!(needs_declared(&serde_json::json!({"depends": [{"plugin": "xtb", "versions": ">=1.0.0", "optional": true, "programs": [{"program": "xtb", "env": "X"}]}]}), "orca").unwrap().len(), 1);
        // (a plugin used for no program: none of its programs needed)
        assert_eq!(needs_declared(&serde_json::json!({"depends": [{"plugin": "xtb", "versions": ">=1.0.0"}]}), "orca").unwrap(), vec![]);
        let uses = |program: &str, env: &str| serde_json::json!({"plugin": "xtb", "versions": ">=0.1.0 <0.2.0", "programs": [{"program": program, "env": env}]});
        // (itself, versions not as they must be, a shell, a path, a variable that finds or loads programs, one plugin twice, one variable twice: none of them)
        for bad in [
            serde_json::json!([{"plugin": "orca", "versions": ">=0.1.0", "programs": [{"program": "orca", "env": "X"}]}]),
            serde_json::json!([{"plugin": "xtb", "versions": "^0.1.0", "programs": [{"program": "xtb", "env": "X"}]}]),
            serde_json::json!([{"plugin": "xtb", "versions": ">=0.2.0 <0.1.0", "programs": [{"program": "xtb", "env": "X"}]}]),
            serde_json::json!([{"plugin": "xtb", "programs": [{"program": "xtb", "env": "X"}]}]),
            serde_json::json!([uses("sh", "X")]),
            serde_json::json!([uses("bin/xtb", "X")]),
            serde_json::json!([uses("xtb", "PATH")]),
            serde_json::json!([uses("xtb", "DYLD_INSERT_LIBRARIES")]),
            serde_json::json!([uses("xtb", "A"), uses("xtb", "B")]),
            serde_json::json!([{"plugin": "xtb", "versions": ">=0.1.0", "programs": [{"program": "xtb", "env": "A"}, {"program": "other", "env": "A"}]}]),
            serde_json::json!([{"plugin": "xtb", "versions": ">=0.1.0", "optional": "yes"}]),
            serde_json::json!({"plugin": "xtb"}),
        ] {
            assert!(needs_declared(&serde_json::json!({ "depends": bad }), "orca").is_err(), "{bad}");
        }
    }

    #[test]
    fn takes_a_plugins_version_only_within_the_versions_a_plugin_that_uses_it_works_with() {
        assert!(in_versions("0.1.4", ">=0.1.4 <0.2.0"));
        assert!(in_versions("0.1.10", ">=0.1.4 <0.2.0"));
        assert!(!in_versions("0.2.0", ">=0.1.4 <0.2.0"));
        assert!(!in_versions("0.1.3", ">=0.1.4 <0.2.0"));
        assert!(in_versions("3.0.0", ">=0.1.4"));
        assert!(in_versions("1.2", ">=1.2.0 <1.3.0"));
        assert!(!in_versions("", ">=0.1.0"));
        assert!(!in_versions("one", ">=0.1.0"));
        assert!(!in_versions("0.1.5", ">=0.1"));
    }

    #[test]
    fn names_a_needed_program_in_the_jobs_folder_never_by_a_path_with_a_space_in_it() {
        let found = Path::new("/Users/someone/Library/Application Support/Meno/pixi/plugin-xtb/.pixi/envs/default/bin/xtb");
        assert_eq!(need_value(found, false).unwrap(), "./xtb");
        // (on Windows its path, where it has no space - never quoted where it has one)
        assert_eq!(need_value(Path::new(r"C:\Meno\pixi\plugin-xtb\Library\bin\xtb.exe"), true).unwrap(), r"C:\Meno\pixi\plugin-xtb\Library\bin\xtb.exe");
        let err = need_value(Path::new(r"C:\Users\Some One\AppData\Local\Meno\xtb.exe"), true).unwrap_err();
        assert!(err.contains("has a space in it"), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn a_job_runs_a_program_it_needs_linked_in_its_folder_from_a_path_with_a_space_and_never_keeps_it() {
        use std::os::unix::fs::PermissionsExt;
        let root = temp();
        // (another plugin's program, in a folder whose name has a space: as the xTB plugin's xtb is, in Application Support)
        let away = root.join("Application Support").join("bin");
        fs::create_dir_all(&away).unwrap();
        let tool = away.join("tool");
        fs::write(&tool, "#!/bin/sh\necho needed program ran\n").unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o755)).unwrap();
        write_limits(&root, Limits { cores: 1, memory: 0 }).unwrap();
        let spec = JobSpec {
            plugin: "test".into(),
            name: "shell".into(),
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "\"$NEEDED\"".into()],
            stdin: None,
            env: BTreeMap::from([("NEEDED".into(), need_value(&tool, false).unwrap())]),
            cores: 1,
            processes: false,
            memory: 0,
            created: now_ms(),
            label: None,
            key: None,
            then: vec![],
            needs: vec![],
            presets: vec![],
            given: vec![],
        };
        let (_, dir) = make_job(&root, &spec, &[JobFile { name: "input.txt".into(), text: "input".into() }]).unwrap();
        link_needed(&dir, &[("tool".into(), tool.clone())]).unwrap();
        assert_eq!(run_job(&dir), 0);
        assert!(fs::read_to_string(dir.join(LOG)).unwrap().contains("needed program ran"));
        // (the link is never a file the job kept: not listed, so neither kept as a raw output nor saved in a workspace)
        let kept = crate::keptjobs::kept_files(&dir);
        assert!(kept.iter().any(|f| f.name == "work/input.txt"));
        assert!(kept.iter().all(|f| !f.name.contains("tool")), "{:?}", kept.iter().map(|f| &f.name).collect::<Vec<_>>());
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn a_job_that_cannot_be_given_what_it_needs_leaves_no_folder() {
        let root = temp();
        let spec = JobSpec {
            plugin: "test".into(),
            name: "shell".into(),
            program: "/bin/sh".into(),
            args: vec![],
            stdin: None,
            env: BTreeMap::new(),
            cores: 1,
            processes: false,
            memory: 0,
            created: now_ms(),
            label: None,
            key: None,
            then: vec![],
            needs: vec![],
            presets: vec![],
            given: vec![],
        };
        // (a file of its own under the needed program's name: the link cannot be made)
        let err = make_handed_job(&root, &spec, &[JobFile { name: "tool".into(), text: "mine".into() }], &[("tool".into(), "/bin/sh".into())], &[]).unwrap_err();
        assert!(err.contains("tool could not be given to the job"), "{err}");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        // (where it can be, a job, with its link)
        let (_, dir) = make_handed_job(&root, &spec, &[], &[("tool".into(), "/bin/sh".into())], &[]).unwrap();
        assert!(fs::symlink_metadata(dir.join(WORK).join("tool")).unwrap().file_type().is_symlink());
        let _ = fs::remove_dir_all(&root);
    }

    /// Two plugins: `asker`, whose program `main` may need `helper`'s `tool` in the variable TOOLEXE, and `helper` - each
    /// program a script that says what it is and, the asker's, runs what TOOLEXE names; `helper` set up only where asked.
    #[cfg(unix)]
    fn needing(helper_set_up: bool) -> (PathBuf, PathBuf, PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let base = temp();
        let plugins = base.join("plugins");
        // (Meno's data folder with a space in its name, as it has on macOS: never given in a path)
        let data = base.join("Application Support");
        let script = |at: &Path, text: &str| {
            fs::create_dir_all(at.parent().unwrap()).unwrap();
            fs::write(at, text).unwrap();
            fs::set_permissions(at, fs::Permissions::from_mode(0o755)).unwrap();
        };
        fs::create_dir_all(plugins.join("asker")).unwrap();
        fs::write(
            plugins.join("asker").join("manifest.json"),
            r#"{"id": "asker", "steps": [{"kinds": ["optimise"], "programs": ["main"]}], "depends": [{"plugin": "helper", "versions": ">=1.0.0 <2.0.0", "programs": [{"program": "tool", "env": "TOOLEXE"}]}]}"#,
        )
        .unwrap();
        fs::create_dir_all(plugins.join("helper")).unwrap();
        fs::write(plugins.join("helper").join("manifest.json"), r#"{"id": "helper", "name": "Helper", "version": "1.2.0", "steps": [{"kinds": ["energy"], "programs": ["tool"]}]}"#).unwrap();
        script(&data.join("uv/plugin-asker/venv/bin/main"), "#!/bin/sh\necho main ran\n\"$TOOLEXE\"\n");
        if helper_set_up {
            script(&data.join("uv/plugin-helper/venv/bin/tool"), "#!/bin/sh\necho the tool ran\n");
        }
        (base, data, plugins)
    }

    #[cfg(unix)]
    #[test]
    fn gives_no_program_of_a_plugin_of_a_version_the_plugin_that_uses_it_does_not_work_with() {
        let (base, data, plugins) = needing(true);
        let asker = manifest_of(&plugins.join("asker"), "asker").unwrap();
        assert!(needs_given(&data, &asker, "asker", &["helper".to_string()], &|p| Ok(plugins.join(p))).is_ok());
        fs::write(plugins.join("helper").join("manifest.json"), r#"{"id": "helper", "name": "Helper", "version": "2.0.0", "steps": [{"kinds": ["energy"], "programs": ["tool"]}]}"#).unwrap();
        let err = needs_given(&data, &asker, "asker", &["helper".to_string()], &|p| Ok(plugins.join(p))).unwrap_err();
        assert_eq!(err, "asker needs Helper >=1.0.0 <2.0.0; 2.0.0 is here");
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_runner_gives_a_program_another_plugins_only_as_it_works_it_out_again_never_as_its_spec_says() {
        let (base, data, plugins) = needing(true);
        let found = plugin_program(&data, &plugins.join("asker"), "asker", "main", &[]).unwrap();
        let tool = plugin_program(&data, &plugins.join("helper"), "helper", "tool", &[]).unwrap().program;
        let with = |needs: &[&str], extra: &[(&str, &str)]| {
            let mut spec = spec_for("asker", "main", &found, &[]);
            spec.needs = needs.iter().map(|n| n.to_string()).collect();
            spec.env.extend(extra.iter().map(|(k, v)| (k.to_string(), v.to_string())));
            spec
        };
        // (the need, given as Meno gives it: taken)
        assert_eq!(spec_allowed(&data, &plugins, &with(&["helper"], &[("TOOLEXE", "./tool")]), &[]), Ok(()));
        // (another value - a program of the writer's choosing - or the variable missing, or one more besides: refused)
        for bad in [
            with(&["helper"], &[("TOOLEXE", "/bin/sh")]),
            with(&["helper"], &[("TOOLEXE", tool.to_str().unwrap())]),
            with(&["helper"], &[]),
            with(&["helper"], &[("TOOLEXE", "./tool"), ("OTHER", "x")]),
            with(&[], &[("TOOLEXE", "./tool")]),
        ] {
            assert!(spec_allowed(&data, &plugins, &bad, &[]).unwrap_err().contains("given what Meno does not give it"), "{:?}", bad.env);
        }
        // (a need its plugin does not declare, or twice)
        assert!(spec_allowed(&data, &plugins, &with(&["other"], &[("TOOLEXE", "./tool")]), &[]).unwrap_err().contains("declares no program of other that it uses"));
        assert!(spec_allowed(&data, &plugins, &with(&["helper", "helper"], &[("TOOLEXE", "./tool")]), &[]).is_err());
        // (the needed plugin not set up: refused, saying so)
        let (gone, gone_data, gone_plugins) = needing(false);
        let found_gone = plugin_program(&gone_data, &gone_plugins.join("asker"), "asker", "main", &[]).unwrap();
        let mut spec = spec_for("asker", "main", &found_gone, &[]);
        spec.needs = vec!["helper".into()];
        spec.env.insert("TOOLEXE".into(), "./tool".into());
        assert_eq!(spec_allowed(&gone_data, &gone_plugins, &spec, &[]), Err("The Helper plugin is needed for this: add it in Settings, Plugins".into()));
        let _ = fs::remove_dir_all(gone);
        let _ = fs::remove_dir_all(base);
    }

    #[cfg(unix)]
    #[test]
    fn a_runner_runs_a_job_needing_another_plugins_program_linked_in_its_folder_and_no_other_link() {
        let (base, data, plugins) = needing(true);
        let jobs = data.join("jobs");
        write_limits(&jobs, Limits { cores: 1, memory: 0 }).unwrap();
        let found = plugin_program(&data, &plugins.join("asker"), "asker", "main", &[]).unwrap();
        let (env, needed) = needs_given(&data, &manifest_of(&plugins.join("asker"), "asker").unwrap(), "asker", &["helper".into()], &|p| Ok(plugins.join(p))).unwrap();
        assert_eq!(env, BTreeMap::from([("TOOLEXE".to_string(), "./tool".to_string())]));
        let mut spec = spec_for("asker", "main", &found, &[]);
        spec.needs = vec!["helper".into()];
        spec.env.extend(env);
        // (as job_start makes it: its folder, then the link; then its runner, checking both, runs it)
        let (_, dir) = make_job(&jobs, &spec, &[]).unwrap();
        link_needed(&dir, &needed).unwrap();
        assert_eq!(runner(&data, &plugins, &dir), 0);
        let log = fs::read_to_string(dir.join(LOG)).unwrap();
        assert!(log.contains("main ran") && log.contains("the tool ran"), "{log}");
        // (its link pointing elsewhere - another program put under its name: not run)
        let (_, other) = make_job(&jobs, &spec, &[]).unwrap();
        std::os::unix::fs::symlink("/bin/sh", other.join(WORK).join("tool")).unwrap();
        assert_eq!(needs_linked(&other, &data, &plugins, &read_spec(&other).unwrap()), Err("tool in its folder is not the program it needs".into()));
        assert_ne!(runner(&data, &plugins, &other), 0);
        assert!(!fs::read_to_string(other.join(LOG)).unwrap_or_default().contains("main ran"));
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_program_running_as_processes_is_told_one_thread_each_and_taken_by_the_queue_as_whole_cores() {
        // (a program installed separately, running as processes - as ORCA does. On unix it needs another plugin's program
        //  too, as ORCA needs xtb, given as job_start gives it; the helper plugin's program is a script made runnable,
        //  which Windows has no way to be, so there it needs none)
        #[cfg(unix)]
        let (base, data, plugins) = needing(true);
        #[cfg(not(unix))]
        let (base, data, plugins) = {
            let base = temp();
            (base.clone(), base.join("data"), base.join("plugins"))
        };
        let needs: Vec<String> = if cfg!(unix) { vec!["helper".into()] } else { vec![] };
        let exe = |n: &str| if cfg!(windows) { format!("{n}.exe") } else { n.to_string() };
        let ranked = plugins.join("ranked");
        fs::create_dir_all(&ranked).unwrap();
        let declare = |parallel: &str| {
            let needed = if needs.is_empty() { serde_json::json!([]) } else { serde_json::json!([{"plugin": "helper", "versions": ">=1.0.0 <2.0.0", "programs": [{"program": "tool", "env": "TOOLEXE"}]}]) };
            let manifest = serde_json::json!({
                "id": "ranked",
                "installed": [{"name": "orca", "files": {system(): exe("orca")}, "path": ["{folder}"], "parallel": parallel}],
                "depends": needed,
                "steps": [{"kinds": ["energy"], "programs": ["orca"]}]
            });
            fs::write(ranked.join("manifest.json"), manifest.to_string()).unwrap();
        };
        let orca = program_file(&base.join("orca_6"), &exe("orca"));
        let written = vec!["input.inp".to_string()];
        // (a job of 16 cores, made as job_start makes it: what Meno gives it, and what it gives for the program it needs)
        let job = |found: &Found| {
            let (needed, _) = needs_given(&data, &manifest_of(&ranked, "ranked").unwrap(), "ranked", &needs, &|p| Ok(plugins.join(p))).unwrap();
            let mut spec = JobSpec { env: given_env(found, 4567, Some(16)), cores: 16, ..spec_for("ranked", "orca", found, &["input.inp"]) };
            spec.needs = needs.clone();
            spec.env.extend(needed);
            spec
        };
        declare("processes");
        let found = installed_program(&ranked, "ranked", "orca", orca.to_str()).unwrap().unwrap();
        let spec = job(&found);
        // (16 processes, each told one thread - and taken by its runner so)
        assert!(spec.processes);
        for key in THREADS {
            assert_eq!(spec.env.get(*key).map(String::as_str), Some("1"), "{key}");
        }
        assert_eq!(spec_allowed(&data, &plugins, &spec, &written), Ok(()));
        // (each process told the 16 as its threads, or the program taken for one of threads: refused)
        let mut threads = spec.clone();
        for key in THREADS {
            threads.env.insert(key.to_string(), "16".into());
        }
        assert!(spec_allowed(&data, &plugins, &threads, &written).unwrap_err().contains("given what Meno does not give it"));
        assert_eq!(spec_allowed(&data, &plugins, &JobSpec { processes: false, ..spec.clone() }, &written), Err("not how orca runs in parallel".into()));
        // (the queue: each process a whole physical core - two of its cores, where the computer runs two threads on each)
        assert_eq!(taken(&spec, Resources { cores: 32, physical: 16, memory: 0 }), 32);
        assert_eq!(taken(&spec, Resources { cores: 10, physical: 10, memory: 0 }), 16);
        // (one process - ORCA with no MPI to run more, its plugin asking one core: one physical core, ten such side by side)
        assert_eq!(taken(&JobSpec { cores: 1, ..spec.clone() }, Resources { cores: 10, physical: 10, memory: 0 }), 1);
        assert_eq!(taken(&JobSpec { cores: 1, ..spec.clone() }, Resources { cores: 32, physical: 16, memory: 0 }), 2);
        assert_eq!(taken(&JobSpec { processes: false, ..spec.clone() }, Resources { cores: 32, physical: 16, memory: 0 }), 16);

        // the same program declared to run as threads: told its 16 cores, and counted as told
        declare("threads");
        let found = installed_program(&ranked, "ranked", "orca", orca.to_str()).unwrap().unwrap();
        let spec = job(&found);
        assert!(!spec.processes);
        for key in THREADS {
            assert_eq!(spec.env.get(*key).map(String::as_str), Some("16"), "{key}");
        }
        assert_eq!(spec_allowed(&data, &plugins, &spec, &written), Ok(()));
        assert!(spec_allowed(&data, &plugins, &JobSpec { cores: 8, ..spec.clone() }, &written).unwrap_err().contains("given what Meno does not give it"));
        assert_eq!(spec_allowed(&data, &plugins, &JobSpec { processes: true, ..spec.clone() }, &written), Err("not how orca runs in parallel".into()));
        // (a way of running in parallel Meno does not know: the program not taken)
        declare("mpi");
        assert!(installed_program(&ranked, "ranked", "orca", orca.to_str()).unwrap_err().contains("not a way orca runs in parallel"));
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn counts_this_computer_s_physical_cores_never_more_than_its_cores() {
        let here = computer();
        assert!(here.physical >= 1 && here.physical <= here.cores, "{here:?}");
        // (macOS and Linux each say it themselves: asked here as the runner asks)
        #[cfg(any(target_os = "macos", target_os = "linux", windows))]
        assert!(physical_cores().is_some_and(|p| p >= 1));
    }

    #[test]
    fn gives_a_needed_programs_path_on_windows_with_one_separator() {
        assert_eq!(need_value(Path::new(r"C:\Meno\pixi\plugin-xtb\.pixi\envs\default\Library/bin\xtb.exe"), true).unwrap(), r"C:\Meno\pixi\plugin-xtb\.pixi\envs\default\Library\bin\xtb.exe");
    }

    /// A renderer, `render` 0.7.0, declaring its `preset` interface 1.0.0, and a preset plugin, `looks`, that uses it through
    /// that interface and brings a look, a motion and a file they share - each a file in its folder: in a plugins' folder.
    fn presetting(render: serde_json::Value, looks: serde_json::Value) -> PathBuf {
        let plugins = temp();
        for (id, m) in [("render", render), ("looks", looks)] {
            fs::create_dir_all(plugins.join(id)).unwrap();
            fs::write(plugins.join(id).join("manifest.json"), m.to_string()).unwrap();
        }
        fs::create_dir_all(plugins.join("looks").join("looks")).unwrap();
        for f in ["looks/gold.py", "spin.py", "shared.py"] {
            fs::write(plugins.join("looks").join(f), format!("# {f}\n")).unwrap();
        }
        plugins
    }

    fn renderer() -> serde_json::Value {
        serde_json::json!({"id": "render", "name": "Render", "version": "0.7.0", "interfaces": [{"id": "preset", "version": "1.0.0"}]})
    }

    fn preset_plugin() -> serde_json::Value {
        serde_json::json!({
            "id": "looks", "name": "Looks", "version": "1.0.0",
            "depends": [{"plugin": "render", "versions": ">=0.7.0 <0.8.0", "interfaces": [{"id": "preset", "versions": ">=1.0.0 <2.0.0"}]}],
            "presets": {"interface": "preset", "looks": [{"id": "gold", "label": "Gold", "file": "looks/gold.py"}], "motions": [{"id": "spin", "label": "Spin", "file": "spin.py"}], "files": ["shared.py"]}
        })
    }

    #[test]
    fn hands_a_job_every_file_a_preset_plugin_names_copied_into_a_folder_of_its_own_and_never_keeps_one() {
        let plugins = presetting(renderer(), preset_plugin());
        let dir_of = |p: &str| Ok(plugins.join(p));
        let handed = presets_given(&renderer(), "render", &["looks".into()], &dir_of).unwrap();
        assert_eq!(handed.iter().map(|(rel, _)| rel.as_str()).collect::<Vec<_>>(), ["preset/looks/looks/gold.py", "preset/looks/shared.py", "preset/looks/spin.py"]);
        // (none handed, none asked for)
        assert!(presets_given(&renderer(), "render", &[], &dir_of).unwrap().is_empty());
        // (copied into its work folder, unread; listed nowhere it keeps)
        let root = temp();
        let spec = JobSpec {
            plugin: "render".into(),
            name: "shell".into(),
            program: "/bin/sh".into(),
            args: vec![],
            stdin: None,
            env: BTreeMap::new(),
            cores: 1,
            processes: false,
            memory: 0,
            created: now_ms(),
            label: None,
            key: None,
            then: vec![],
            needs: vec![],
            presets: vec!["looks".into()],
            given: vec![],
        };
        let (_, dir) = make_handed_job(&root, &spec, &[JobFile { name: "input.txt".into(), text: "input".into() }], &[], &handed).unwrap();
        assert_eq!(fs::read_to_string(dir.join(WORK).join("preset/looks/looks/gold.py")).unwrap(), "# looks/gold.py\n");
        let kept: Vec<String> = crate::keptjobs::kept_files(&dir).into_iter().map(|f| f.name).collect();
        assert_eq!(kept, ["work/input.txt"]);
        // (one that cannot be copied - gone since - leaves no folder)
        let away = temp();
        let gone = vec![("preset/looks/none.py".to_string(), plugins.join("looks").join("none.py"))];
        assert!(make_handed_job(&away, &spec, &[], &[], &gone).unwrap_err().contains("could not be given to the job"));
        assert_eq!(fs::read_dir(&away).unwrap().count(), 0);
        for d in [plugins, root, away] {
            let _ = fs::remove_dir_all(d);
        }
    }

    #[test]
    fn hands_over_nothing_of_a_plugin_that_is_not_a_preset_plugin_of_the_job_s_as_it_must_be() {
        let refused = |render: serde_json::Value, looks: serde_json::Value, asked: &[&str], why: &str| {
            let plugins = presetting(render.clone(), looks);
            let asked: Vec<String> = asked.iter().map(|a| a.to_string()).collect();
            let err = presets_given(&render, "render", &asked, &|p: &str| Ok(plugins.join(p))).unwrap_err();
            assert!(err.contains(why), "{err} - {why}");
            let _ = fs::remove_dir_all(plugins);
        };
        let with = |k: &str, v: serde_json::Value| {
            let mut m = preset_plugin();
            m[k] = v;
            m
        };
        let presets = |k: &str, v: serde_json::Value| {
            let mut m = preset_plugin();
            m["presets"][k] = v;
            m
        };
        // (the renderer of a version it does not work with, its interface of another, or none)
        refused(serde_json::json!({"id": "render", "version": "0.8.0", "interfaces": [{"id": "preset", "version": "1.0.0"}]}), preset_plugin(), &["looks"], "works with render >=0.7.0 <0.8.0; 0.8.0 is here");
        refused(serde_json::json!({"id": "render", "version": "0.7.1", "interfaces": [{"id": "preset", "version": "2.0.0"}]}), preset_plugin(), &["looks"], "preset interface >=1.0.0 <2.0.0; 2.0.0 is here");
        refused(serde_json::json!({"id": "render", "version": "0.7.0"}), preset_plugin(), &["looks"], "render declares no preset interface");
        // (one that does not use it, or not through that interface, or brings none)
        refused(renderer(), with("depends", serde_json::json!([])), &["looks"], "Looks does not use render");
        refused(renderer(), presets("interface", serde_json::json!("other")), &["looks"], "does not use render's other interface");
        refused(renderer(), with("presets", serde_json::json!(null)), &["looks"], "Looks brings no presets");
        // (a file not inside its folder, the manifest, one not there, a folder - asked for twice, or itself, or no plugin)
        refused(renderer(), presets("files", serde_json::json!(["../render/manifest.json"])), &["looks"], "names a file it cannot hand over");
        refused(renderer(), presets("files", serde_json::json!(["manifest.json"])), &["looks"], "names a file it cannot hand over");
        refused(renderer(), presets("files", serde_json::json!(["/etc/hosts"])), &["looks"], "names a file it cannot hand over");
        refused(renderer(), presets("files", serde_json::json!(["none.py"])), &["looks"], "none.py of Looks is not there");
        refused(renderer(), presets("files", serde_json::json!(["looks"])), &["looks"], "looks of Looks is not a file");
        refused(renderer(), preset_plugin(), &["looks", "looks"], "not a plugin that brings render presets");
        refused(renderer(), preset_plugin(), &["render"], "not a plugin that brings render presets");
        refused(renderer(), preset_plugin(), &["../looks"], "not a plugin that brings render presets");
        // (too many files, all told)
        let many: Vec<String> = (0..70).map(|i| format!("f{i}.py")).collect();
        let plugins = presetting(renderer(), presets("files", serde_json::json!(many)));
        for f in &many {
            fs::write(plugins.join("looks").join(f), "").unwrap();
        }
        let err = presets_given(&renderer(), "render", &["looks".into()], &|p: &str| Ok(plugins.join(p))).unwrap_err();
        assert!(err.contains("more than a job takes"), "{err}");
        let _ = fs::remove_dir_all(plugins);
    }

    #[cfg(unix)]
    #[test]
    fn hands_over_no_file_a_preset_plugin_names_by_a_link() {
        let plugins = presetting(renderer(), preset_plugin());
        fs::remove_file(plugins.join("looks").join("shared.py")).unwrap();
        std::os::unix::fs::symlink("/etc/hosts", plugins.join("looks").join("shared.py")).unwrap();
        let err = presets_given(&renderer(), "render", &["looks".into()], &|p: &str| Ok(plugins.join(p))).unwrap_err();
        assert!(err.contains("is a link"), "{err}");
        // (nor a file in a folder that is one)
        fs::remove_file(plugins.join("looks").join("shared.py")).unwrap();
        fs::write(plugins.join("looks").join("shared.py"), "").unwrap();
        fs::remove_dir_all(plugins.join("looks").join("looks")).unwrap();
        std::os::unix::fs::symlink(plugins.join("render"), plugins.join("looks").join("looks")).unwrap();
        let err = presets_given(&renderer(), "render", &["looks".into()], &|p: &str| Ok(plugins.join(p))).unwrap_err();
        assert!(err.contains("is a link"), "{err}");
        let _ = fs::remove_dir_all(plugins);
    }

    #[test]
    fn takes_a_file_a_preset_names_only_as_a_plain_path_inside_its_folder() {
        for good in ["a.py", "looks/gold.py", "a/b/c/d.txt", "Studio_1.blend"] {
            assert!(preset_file_ok(good), "{good}");
        }
        for bad in ["", "../a.py", "./a.py", "a/../b", "/a.py", "a//b", ".hidden", "a/b/c/d/e", "manifest.json", "worker.py", "a b.py", "a\\b.py", &"x".repeat(65)] {
            assert!(!preset_file_ok(bad), "{bad}");
        }
    }
}
