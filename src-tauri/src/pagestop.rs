//! The main window's page stopped under Meno - the system took its process
//! away, or it ended of itself (docs/ARCHITECTURE.md, *When the page
//! stops*): one line in Meno's log, and the page started again in the same
//! window, the workspace files that were open opened again from their files
//! and the chemist told, once, in Meno's own notice, what came of their work
//! (`page_came_back`). A page that stops again soon after it was started
//! again (`SOON`) is not started a third time, nor is one whose window can
//! show no page any more: then a native message says it, and Meno closes as
//! a quit closes it.
//!
//! What the back end cannot know by itself the page tells it as it goes:
//! the workspace file being saved, by its name (`page_saving`, which gives
//! that save a token its write is sent with) and the files its tabs hold
//! (`page_files`). A save's bytes are written here, apart from the page
//! (savefile.rs), so a page that stops during a save may leave the file as
//! saved. The write is followed by its token, its end marked however it
//! ends (`Mark`); a save the stopped page had not yet handed over is never
//! written after it. The file being saved is opened again only once its
//! write has ended - the rest of the page comes back at once - and only
//! then is said what it is (`page_came_back_later`); past `REOPEN_WAIT` it
//! is said that its save has not ended, and it is not opened.
//!
//! macOS: Tauri's `on_web_content_process_terminate`. Windows: WebView2's
//! `ProcessFailed`, whose kind says whether the page's process ended, the
//! page stopped answering (logged once, nothing more: it may answer again),
//! or the web view's own process ended (no page can be shown). Linux: not
//! handled - nothing in Tauri tells it there.

use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// How soon after the page was started again its stopping again closes Meno
/// rather than starting it a third time: long enough for the files opened
/// again to be read and the first moments of work - a file that stops the
/// page as it opens stops it again within this - short enough that a
/// stop an hour later is taken as one of its own.
pub const SOON: Duration = Duration::from_secs(120);

/// How long a save being written as the page stopped is waited for before
/// its file is opened again: as long as a large workspace's file takes to
/// a slow disk; the page is back meanwhile.
pub const REOPEN_WAIT: Duration = Duration::from_secs(600);

/// How long it is waited for before Meno closes: the window shows nothing
/// meanwhile, so not long.
pub const CLOSE_WAIT: Duration = Duration::from_secs(30);

/// How the page stopped, as far as the system says.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// The page's process ended: the page can be started again.
    Ended,
    /// The page stopped answering, not ended (Windows tells this apart).
    NotAnswering,
    /// The web view's own process ended: no page can be shown in the window (Windows).
    Gone,
}

/// How far a save the page told of had come.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Written {
    /// Its bytes not yet here.
    NotYet,
    /// Being written.
    Writing,
    /// Written: the file is as saved.
    Done,
    /// Not written: the file is as it was.
    Failed,
    /// Its write ended without saying how (it panicked): the file is whole, one way or the other.
    Unknown,
    /// Not yet here as the page stopped: never written after it.
    Shut,
}

/// A save the page told of: the file's name, the token its write comes with, and - once its write has begun - the
/// file it writes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Saving {
    pub name: String,
    pub token: u64,
    pub written: Written,
    pub target: Option<PathBuf>,
}

/// What is done with a page that stopped.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Then {
    StartAgain,
    /// It stopped again soon after it was started again.
    CloseAgain,
    /// No page can be shown.
    CloseGone,
}

/// Started again where it was not, or not soon after the last start; else closed.
pub fn then(kind: Kind, started_again: Option<Instant>, now: Instant) -> Then {
    match kind {
        Kind::Gone => Then::CloseGone,
        _ if started_again.is_some_and(|at| now.saturating_duration_since(at) < SOON) => Then::CloseAgain,
        _ => Then::StartAgain,
    }
}

/// The line in Meno's log: no file's name.
pub fn log_line(kind: Kind, saving: bool, then: Then) -> String {
    let how = match kind {
        Kind::Ended => "its process ended",
        Kind::NotAnswering => "it stopped answering",
        Kind::Gone => "the web view's own process ended",
    };
    let during = if saving { "a save was under way" } else { "no save was under way" };
    let then = match then {
        Then::StartAgain => "started again",
        Then::CloseAgain => "it stopped again soon after it was started again: Meno closes",
        Then::CloseGone => "no page can be shown: Meno closes",
    };
    format!("the window's page stopped ({how}); {during}; {then}")
}

/// What is said of a save under way as the page stopped, by how far it came: `written` as it is when it is said
/// (`Writing`: its end not seen); `closing`, where Meno closes after it.
pub fn save_said(name: &str, written: Written, closing: bool) -> String {
    match written {
        Written::Done => format!("{name} was being saved, and the save was finished: {name} is as saved."),
        Written::Failed | Written::Shut | Written::NotYet => format!("{name} was being saved, and that save did not happen: {name} is as it was before."),
        Written::Unknown => format!("{name} was being saved, and Meno cannot tell whether that save was finished: look at {name} before saving over it."),
        Written::Writing if closing => format!("{name} was being saved, and that save had not ended: once Meno is started again, open {name} to see what it holds."),
        Written::Writing => format!("{name} was being saved, and that save has not ended yet: open {name} again later, to see what it holds."),
    }
}

/// What the chemist is told at once: in the page started again, or, where Meno closes, in a native message.
/// `saving`: a save under way, as it is then - where it is still being written as the page comes back, what came
/// of it is said later (`later_said`); `reopened`: whether workspace files are open again now.
pub fn said(then: Then, saving: Option<&Saving>, reopened: bool) -> String {
    let closing = then != Then::StartAgain;
    let mut s = vec![match then {
        Then::StartAgain => "Meno's window stopped working and was started again.".to_string(),
        Then::CloseAgain => "Meno's window stopped working again, soon after it was started again.".to_string(),
        Then::CloseGone => "Meno's window stopped working.".to_string(),
    }];
    s.push("What was not saved is lost.".into());
    if let Some(Saving { name, written, .. }) = saving {
        s.push(if *written == Written::Writing && !closing {
            format!("{name} was being saved: what came of that save is said here once it has ended.")
        } else {
            save_said(name, *written, closing)
        });
    }
    if !closing && reopened {
        s.push("The files that were open are open again, as they were last saved.".into());
    }
    if closing {
        s.push("Meno will close.".into());
    }
    s.join(" ")
}

/// What is said once the save that was being written as the page stopped has ended, or was waited for long enough:
/// `reopened`, its file opened again.
pub fn later_said(saving: &Saving, reopened: bool) -> String {
    let mut s = save_said(&saving.name, saving.written, false);
    if reopened {
        s.push_str(" It is open again.");
    }
    s
}

/// The files to open now, and those held back till the save being written ends: the file it writes, however its
/// path is spelled (savefile.rs `same_file`) - never another of the same name.
pub fn split_files(files: Vec<String>, writing: Option<&Path>) -> (Vec<String>, Vec<String>) {
    files.into_iter().partition(|f| writing.is_none_or(|target| !crate::savefile::same_file(Path::new(f), target)))
}

/// What a stop is to do, as `Held::stopped` finds it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Plan {
    pub then: Then,
    /// The save under way as the page stopped.
    pub saving: Option<Saving>,
    /// The files its tabs held, to open again (the file being saved among them, held back as the page comes back).
    pub now: Vec<String>,
}

/// The file being written as the page stopped, waited for: its save's token, the file it writes, and the paths of
/// that file to open once its write has ended - those its tabs held, and any the chemist opens meanwhile, by any way.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Waiting {
    token: u64,
    target: PathBuf,
    later: Vec<String>,
}

#[derive(Default)]
struct Held {
    /// The file whose save was being written as the page stopped, while it is waited for.
    waiting: Option<Waiting>,
    /// The page whose lists of files are taken, and the last of them (`page_files`): a page that comes back is taken
    /// from its first list, an older list of its own is let be, and a stopped page's - in `gone` - never.
    files_from: Option<String>,
    files_told: u64,
    gone: Vec<String>,
    /// The save the page tells of now.
    saving: Option<Saving>,
    /// The save under way as the page last stopped.
    left: Option<Saving>,
    /// The token the next save is given.
    tokens: u64,
    /// The workspace files its tabs hold.
    files: Vec<String>,
    /// When the page was last started again.
    started_again: Option<Instant>,
    /// Whether Meno closes: nothing more is done of a stop.
    closing: bool,
    /// What the page started again is to be told at once, and once the save being written has ended: each till it is asked.
    now_said: Option<String>,
    later_said: Option<String>,
    /// Whether its not answering is said already, since it was last started.
    unanswered: bool,
}

impl Held {
    /// The page stopped as `kind` says, at `now`: what is done; none where nothing is.
    fn stopped(&mut self, kind: Kind, now: Instant) -> Option<Plan> {
        if kind == Kind::NotAnswering || self.closing {
            return None;
        }
        let then = then(kind, self.started_again, now);
        let mut saving = self.saving.take();
        if let Some(s) = saving.as_mut().filter(|s| s.written == Written::NotYet) {
            s.written = Written::Shut;
        }
        self.left = saving.clone();
        self.now_said = None;
        self.later_said = None;
        // (the page that stopped: no list of its own taken after this)
        if let Some(page) = self.files_from.take() {
            self.gone.push(page);
        }
        self.files_told = 0;
        let files = if then == Then::StartAgain { std::mem::take(&mut self.files) } else { Vec::new() };
        self.waiting = saving
            .as_ref()
            .filter(|s| s.written == Written::Writing && then == Then::StartAgain)
            .and_then(|s| Some(Waiting { token: s.token, target: s.target.clone()?, later: Vec::new() }));
        if then == Then::StartAgain {
            self.started_again = Some(now);
            self.unanswered = false;
        } else {
            self.closing = true;
        }
        Some(Plan { then, saving, now: files })
    }

    /// A list of files from `page`, its `told`-th: taken where it is the newest of the page now, or the first of a
    /// page come back; never a stopped page's. Whether it was.
    fn files_told(&mut self, page: &str, told: u64, files: Vec<String>) -> bool {
        if self.gone.iter().any(|g| g == page) {
            return false;
        }
        if self.files_from.as_deref() == Some(page) && told <= self.files_told {
            return false;
        }
        self.files_from = Some(page.to_string());
        self.files_told = told;
        self.files = files;
        true
    }
}

/// The page's stops, and what it tells of as it goes.
#[derive(Default)]
pub struct PageStop {
    held: Mutex<Held>,
    /// Told as a save's write ends.
    ended: Condvar,
}

/// A save's write, its end marked however the write ends - written, failed, or its task gone without saying (a
/// panic): marked as it is dropped.
pub struct Mark {
    end: Option<Box<dyn FnOnce(Written) + Send>>,
    ok: Option<bool>,
}

impl Mark {
    pub fn new(end: impl FnOnce(Written) + Send + 'static) -> Self {
        Mark { end: Some(Box::new(end)), ok: None }
    }

    /// The write ended: written, or not.
    pub fn ended(&mut self, ok: bool) {
        self.ok = Some(ok);
    }
}

impl Drop for Mark {
    fn drop(&mut self) {
        if let Some(end) = self.end.take() {
            end(match self.ok {
                Some(true) => Written::Done,
                Some(false) => Written::Failed,
                None => Written::Unknown,
            });
        }
    }
}

impl PageStop {
    fn held(&self) -> MutexGuard<'_, Held> {
        self.held.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// A save begins: its token.
    fn saving(&self, name: String) -> u64 {
        let mut held = self.held();
        held.tokens += 1;
        let token = held.tokens;
        held.saving = Some(Saving { name, token, written: Written::NotYet, target: None });
        token
    }

    /// The save of `token` ended, as the page saw it.
    fn saved(&self, token: u64) {
        let mut held = self.held();
        if held.saving.as_ref().is_some_and(|s| s.token == token) {
            held.saving = None;
        }
    }

    /// A document is to be written with `token`, the save it is of: where it is the save the page tells of now,
    /// its writing begun - the token given back, to mark its end with; refused where it is the stopped page's
    /// save, not yet handed over as it stopped; anything else written as it is.
    pub fn write_begins(&self, token: Option<u64>, target: &Path) -> Result<Option<u64>, String> {
        let Some(token) = token else { return Ok(None) };
        let mut held = self.held();
        if let Some(s) = held.saving.as_mut().filter(|s| s.token == token && s.written == Written::NotYet) {
            s.written = Written::Writing;
            s.target = Some(target.to_path_buf());
            return Ok(Some(token));
        }
        if held.left.as_ref().is_some_and(|s| s.token == token && s.written == Written::Shut) {
            return Err("the window that asked for this save had stopped".into());
        }
        Ok(None)
    }

    /// The write of `token` ended as `written` says.
    pub fn write_ends(&self, token: u64, written: Written) {
        let mut held = self.held();
        let Held { saving, left, .. } = &mut *held;
        for s in [saving, left].into_iter().flatten().filter(|s| s.token == token && s.written == Written::Writing) {
            s.written = written;
        }
        drop(held);
        self.ended.notify_all();
    }

    /// The file waited for, by its token, where one is.
    fn waited(&self) -> Option<(u64, PathBuf)> {
        self.held().waiting.as_ref().map(|w| (w.token, w.target.clone()))
    }

    /// Of `paths`, those to open now; the rest - the file waited for, however its path is spelled - kept to open once
    /// its write has ended. (The files are looked at with the lock let go: a folder gone must not hold the rest.)
    pub fn hold_opens(&self, paths: Vec<String>) -> Vec<String> {
        let Some((token, target)) = self.waited() else { return paths };
        let (now, later) = split_files(paths, Some(&target));
        self.keep_for_later(token, later);
        now
    }

    /// `later` kept to open once the write of `token` has ended - where it is still waited for; else opened now, so
    /// that nothing is lost.
    fn keep_for_later(&self, token: u64, later: Vec<String>) -> Vec<String> {
        let mut held = self.held();
        match held.waiting.as_mut().filter(|w| w.token == token) {
            Some(w) => {
                for p in later {
                    if !w.later.contains(&p) {
                        w.later.push(p);
                    }
                }
                Vec::new()
            }
            None => later,
        }
    }

    /// A document to be written to `target` - by the save of `token`, if it is one - once the write of the stopped
    /// page's save of that same file has ended, so that the two never interleave and what is said of the first stays
    /// true: at most `limit`; refused past it. Another file of the same name is not that file, and is written at once.
    pub fn write_after_left(&self, target: &Path, token: Option<u64>, limit: Duration) -> Result<(), String> {
        let first = {
            let held = self.held();
            held.left.clone().filter(|s| s.written == Written::Writing && Some(s.token) != token)
        };
        let Some(first) = first else { return Ok(()) };
        // (looked at with the lock let go)
        if !first.target.as_deref().is_some_and(|t| crate::savefile::same_file(t, target)) {
            return Ok(());
        }
        let until = Instant::now() + limit;
        let mut held = self.held();
        loop {
            if !held.left.as_ref().is_some_and(|s| s.token == first.token && s.written == Written::Writing) {
                return Ok(());
            }
            let now = Instant::now();
            if now >= until {
                return Err(format!("{} is still being written by the save made as Meno's window stopped; save again once that save has ended", first.name));
            }
            held = self.ended.wait_timeout(held, until - now).unwrap_or_else(|e| e.into_inner()).0;
        }
    }

    /// The stopped page's save of `token` once its write has ended, or at most `limit` on: as it is then
    /// (`Writing`, where its end was not seen).
    fn left_after(&self, token: u64, limit: Duration) -> Option<Saving> {
        let until = Instant::now() + limit;
        let mut held = self.held();
        loop {
            let left = held.left.clone().filter(|s| s.token == token);
            let now = Instant::now();
            if left.as_ref().is_none_or(|s| s.written != Written::Writing) || now >= until {
                return left;
            }
            held = self.ended.wait_timeout(held, until - now).unwrap_or_else(|e| e.into_inner()).0;
        }
    }
}

/// The workspace file the page begins to save, by its name: the token its write is sent with.
#[tauri::command]
pub fn page_saving(state: tauri::State<'_, PageStop>, name: String) -> u64 {
    state.saving(name)
}

/// The save of `token` ended, as the page saw it.
#[tauri::command]
pub fn page_saved(state: tauri::State<'_, PageStop>, token: u64) {
    state.saved(token);
}

/// The workspace files the page's tabs hold: those it may read, which are workspace files, kept to open again -
/// looked at off the window's thread (a folder on a network gone must not hold the window).
#[tauri::command]
pub async fn page_files(app: AppHandle, paths: Vec<String>, told: u64, page: String) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_fs::FsExt;
        let scope = app.try_fs_scope();
        let paths = paths.into_iter().filter(|p| scope.as_ref().is_some_and(|s| s.is_allowed(p)) && crate::opened::is_workspace(Path::new(p))).collect();
        // (each list in its turn: one looked at more slowly never takes a later one's place, nor a stopped page's a
        //  page's come back)
        app.state::<PageStop>().held().files_told(&page, told, paths);
    })
    .await;
}

/// Of the workspace files the page is to open - picked in Open, dropped, double-clicked - those it opens now: the
/// file whose save was being written as the page stopped is held back till that write has ended, and opened then,
/// as saved.
#[tauri::command]
pub async fn page_hold_opens(app: AppHandle, paths: Vec<String>) -> Vec<String> {
    let all = paths.clone();
    tauri::async_runtime::spawn_blocking(move || app.state::<PageStop>().hold_opens(paths)).await.unwrap_or(all)
}

/// What the page, started again after it stopped, is told of it at once - once; none at any other start.
#[tauri::command]
pub fn page_came_back(state: tauri::State<'_, PageStop>) -> Option<String> {
    state.held().now_said.take()
}

/// What it is told once the save being written as it stopped has ended (told, `page-came-back`) - once.
#[tauri::command]
pub fn page_came_back_later(state: tauri::State<'_, PageStop>) -> Option<String> {
    state.held().later_said.take()
}

/// The main window's page stopped as `kind` says: said in the log, and started again - or Meno closed.
pub fn stopped(app: &AppHandle, kind: Kind) {
    let state = app.state::<PageStop>();
    let plan = {
        let mut held = state.held();
        if kind == Kind::NotAnswering {
            if !std::mem::replace(&mut held.unanswered, true) {
                crate::logfile::line("meno", "the window's page stopped answering; left to answer again");
            }
            return;
        }
        held.stopped(kind, Instant::now())
    };
    let Some(plan) = plan else { return };
    crate::logfile::line("meno", &log_line(kind, plan.saving.is_some(), plan.then));
    let app = app.clone();
    // (off the window's thread: the files' paths are looked at - opened.rs - and a save may be waited for)
    std::thread::spawn(move || if plan.then == Then::StartAgain { start_again(&app, plan) } else { close(&app, plan) });
}

/// The page started again: the files opened again now taken by it as it comes up, as files opened from outside are
/// (opened.rs); the file being saved, once its write has ended.
fn start_again(app: &AppHandle, plan: Plan) {
    let reload = || {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.reload();
        }
    };
    let told = || {
        let _ = app.emit("page-came-back", ());
    };
    run_start_again(&app.state::<PageStop>(), plan, REOPEN_WAIT, |files| crate::opened::open(app, files), reload, told);
}

/// `start_again` as it runs, the window's parts given: `open` takes files to open, `reload` starts the page again,
/// `told` tells it there is more to say.
fn run_start_again(state: &PageStop, plan: Plan, limit: Duration, open: impl Fn(Vec<String>), reload: impl FnOnce(), told: impl FnOnce()) {
    // (the file being written held back, the rest opened now - said at once, before the page is there to ask)
    let writing = plan.saving.as_ref().filter(|s| s.written == Written::Writing);
    let (now, later) = split_files(plan.now, writing.and_then(|s| s.target.as_deref()));
    let now = [now, writing.map(|s| state.keep_for_later(s.token, later.clone())).unwrap_or(later)].concat();
    state.held().now_said = Some(said(Then::StartAgain, plan.saving.as_ref(), !now.is_empty()));
    open(now);
    reload();
    let Some(token) = plan.saving.filter(|s| s.written == Written::Writing).map(|s| s.token) else { return };
    let Some(saving) = state.left_after(token, limit) else { return };
    // (its files, those held and those opened meanwhile, taken as the wait ends: an Open from then on opens at once)
    let later = {
        let mut held = state.held();
        match held.waiting.take() {
            Some(w) if w.token == token => w.later,
            other => {
                held.waiting = other;
                Vec::new()
            }
        }
    };
    let reopen = saving.written != Written::Writing && !later.is_empty();
    if reopen {
        open(later);
    }
    state.held().later_said = Some(later_said(&saving, reopen));
    told();
}

/// Meno closed after a native message - a save being written waited for, at most `CLOSE_WAIT` - as a quit closes it
/// (RunEvent::Exit), however the message goes.
fn close(app: &AppHandle, plan: Plan) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let show = |words: String| {
        app.dialog().message(words).title("Meno").kind(MessageDialogKind::Error).buttons(MessageDialogButtons::Ok).blocking_show();
    };
    run_close(&app.state::<PageStop>(), plan, CLOSE_WAIT, show, || app.exit(0));
}

/// `close` as it runs: `show` shows the message, and returns once it is dismissed; then `exit`, whatever it gave.
fn run_close(state: &PageStop, plan: Plan, limit: Duration, show: impl FnOnce(String), exit: impl FnOnce()) {
    let saving = match plan.saving {
        Some(s) if s.written == Written::Writing => state.left_after(s.token, limit).or(Some(s)),
        other => other,
    };
    show(said(plan.then, saving.as_ref(), false));
    exit();
}

/// The main window's page watched for its stopping, on Windows: WebView2's `ProcessFailed`.
#[cfg(windows)]
pub fn watch(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    };
    use webview2_com::ProcessFailedEventHandler;
    let app = window.app_handle().clone();
    window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
            let mut failed = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            if let Some(args) = args {
                args.ProcessFailedKind(&mut failed)?;
            }
            // (the rest - a frame's, the GPU's, a helper's - are not the page's own, and WebView2 sees to them)
            let kind = match failed {
                COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => Kind::Ended,
                COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => Kind::NotAnswering,
                COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => Kind::Gone,
                _ => return Ok(()),
            };
            stopped(&app, kind);
            Ok(())
        }));
        let mut token = 0i64;
        if let Err(e) = core.add_ProcessFailed(&handler, &mut token) {
            crate::logfile::line("meno", &format!("the window's page is not watched for stopping: {e}"));
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn saving(name: &str, token: u64, written: Written) -> Option<Saving> {
        Some(Saving { name: name.into(), token, written, target: None })
    }

    /// A folder of its own for a test, with `files` in it (each a path in it, its folders made).
    fn folder(tag: &str, files: &[&str]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-pagestop-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for f in files {
            let at = dir.join(f);
            std::fs::create_dir_all(at.parent().unwrap()).unwrap();
            std::fs::write(&at, b"PK").unwrap();
        }
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn at(dir: &Path, f: &str) -> String {
        dir.join(f).to_string_lossy().into_owned()
    }

    /// Where the writes of tests that do not look at files go.
    const NOWHERE: &str = "/nowhere/Route.meno";

    /// A write of `token` as savefile.rs makes one: its end marked as its mark is dropped.
    fn mark(state: &Arc<PageStop>, token: u64) -> Mark {
        let state = state.clone();
        Mark::new(move |w| state.write_ends(token, w))
    }

    #[test]
    fn a_page_that_stops_is_started_again_and_a_second_stop_soon_after_closes_meno() {
        let t0 = Instant::now();
        assert_eq!(then(Kind::Ended, None, t0), Then::StartAgain);
        assert_eq!(then(Kind::Ended, Some(t0), t0 + Duration::from_secs(30)), Then::CloseAgain);
        assert_eq!(then(Kind::Ended, Some(t0), t0 + SOON - Duration::from_millis(1)), Then::CloseAgain);
        assert_eq!(then(Kind::Ended, Some(t0), t0 + SOON), Then::StartAgain);
        assert_eq!(then(Kind::Ended, Some(t0), t0 + Duration::from_secs(3600)), Then::StartAgain);
        assert_eq!(then(Kind::Gone, None, t0), Then::CloseGone);
    }

    #[test]
    fn what_is_held_follows_the_stops_and_nothing_is_done_once_meno_closes() {
        let t0 = Instant::now();
        let mut held = Held { files: vec!["/w/a.meno".into()], ..Held::default() };
        assert_eq!(held.stopped(Kind::NotAnswering, t0), None);
        let plan = held.stopped(Kind::Ended, t0).unwrap();
        assert_eq!((plan.then, plan.now), (Then::StartAgain, vec!["/w/a.meno".to_string()]));
        assert_eq!(held.started_again, Some(t0));
        // the second, soon: closed, nothing opened again - and a third, as Meno closes: nothing (one message only)
        let plan = held.stopped(Kind::Ended, t0 + Duration::from_secs(5)).unwrap();
        assert_eq!((plan.then, plan.now.len()), (Then::CloseAgain, 0));
        assert_eq!(held.stopped(Kind::Gone, t0 + Duration::from_secs(6)), None);
        let mut held = Held { started_again: Some(t0), ..Held::default() };
        assert_eq!(held.stopped(Kind::Ended, t0 + SOON + Duration::from_secs(1)).unwrap().then, Then::StartAgain);
    }

    #[test]
    fn the_file_being_saved_is_held_back_however_spelled_and_the_rest_open_again_at_once() {
        let dir = folder("held", &["w/a.meno", "w/Route.meno", "x/Route.meno"]);
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.join("w/Route.meno"), dir.join("w/link.meno")).unwrap();
        let state = PageStop::default();
        let mut files = vec![at(&dir, "w/a.meno"), at(&dir, "w/Route.meno"), at(&dir, "x/Route.meno")];
        #[cfg(unix)]
        files.push(at(&dir, "w/link.meno"));
        state.held().files = files;
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token), &dir.join("w/Route.meno")).unwrap();
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        let opened = Mutex::new(Vec::new());
        run_start_again(&state, plan, Duration::ZERO, |f| opened.lock().unwrap().push(f), || {}, || {});
        let opened = opened.into_inner().unwrap();
        // at once: the others - another file of the same name in another folder among them; the file itself, by a link too, held back
        assert_eq!(opened[0], vec![at(&dir, "w/a.meno"), at(&dir, "x/Route.meno")]);
        assert_eq!(
            state.held().now_said.take().unwrap(),
            "Meno's window stopped working and was started again. What was not saved is lost. Route.meno was being saved: what came of that save is said here once it has ended. The files that were open are open again, as they were last saved."
        );
        // (its end not seen within the limit: not opened, and said so)
        assert_eq!(opened.len(), 1);
        // a save written already, or not to be: every file at once, as it is on disk
        for written in [Written::Done, Written::NotYet] {
            let mut held = Held { files: vec![at(&dir, "w/Route.meno")], saving: saving("Route.meno", 1, written), ..Held::default() };
            assert_eq!(held.stopped(Kind::Ended, Instant::now()).unwrap().now.len(), 1);
            assert!(held.waiting.is_none());
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_page_come_back_is_taken_from_its_first_list_and_a_stopped_page_s_late_list_never() {
        let mut held = Held::default();
        for told in 1..=5 {
            assert!(held.files_told("old", told, vec![format!("/w/{told}.meno")]));
        }
        // an older list of the same page, late: let be
        assert!(!held.files_told("old", 3, vec!["/w/3.meno".into()]));
        held.stopped(Kind::Ended, Instant::now());
        // the page that came back counts from one: taken
        assert!(held.files_told("new", 1, vec!["/w/a.meno".into()]));
        assert_eq!(held.files, vec!["/w/a.meno".to_string()]);
        // the stopped page's late list after that: never
        assert!(!held.files_told("old", 6, vec!["/w/6.meno".into()]));
        assert_eq!(held.files, vec!["/w/a.meno".to_string()]);
        assert!(held.files_told("new", 2, vec!["/w/b.meno".into()]));
        assert_eq!(held.files, vec!["/w/b.meno".to_string()]);
    }

    #[test]
    fn a_write_is_known_by_its_token_and_a_later_save_of_the_same_name_is_its_own() {
        let state = Arc::new(PageStop::default());
        // none told: written as it is
        assert_eq!(state.write_begins(None, Path::new(NOWHERE)), Ok(None));
        let first = state.saving("Route.meno".into());
        assert_eq!(state.write_begins(Some(first), Path::new(NOWHERE)), Ok(Some(first)));
        let write = mark(&state, first);
        // the page stops while it is written
        state.held().stopped(Kind::Ended, Instant::now());
        // the page that came back saves the same file again: its own save, never refused, never taken for the first
        let second = state.saving("Route.meno".into());
        assert_ne!(first, second);
        assert_eq!(state.write_begins(Some(second), Path::new(NOWHERE)), Ok(Some(second)));
        // the first write ends: the stopped page's save is settled, not the new one
        drop(write);
        let written = |token, written| Some(Saving { target: Some(PathBuf::from(NOWHERE)), ..saving("Route.meno", token, written).unwrap() });
        assert_eq!(state.held().left, written(first, Written::Unknown));
        assert_eq!(state.held().saving, written(second, Written::Writing));
        state.write_ends(second, Written::Done);
        state.saved(second);
        assert!(state.held().saving.is_none());
        // a save not yet handed over as the page stopped: never written after it - by its token alone
        let state = PageStop::default();
        let shut = state.saving("Route.meno".into());
        state.held().stopped(Kind::Ended, Instant::now());
        assert!(state.write_begins(Some(shut), Path::new(NOWHERE)).is_err());
        let again = state.saving("Route.meno".into());
        assert_eq!(state.write_begins(Some(again), Path::new(NOWHERE)), Ok(Some(again)));
    }

    #[test]
    fn a_write_that_panics_is_marked_ended_and_the_wait_for_it_ends() {
        let state = Arc::new(PageStop::default());
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token), Path::new(NOWHERE)).unwrap();
        state.held().stopped(Kind::Ended, Instant::now());
        let write = mark(&state, token);
        let t = std::thread::spawn(move || {
            let _write = write;
            std::thread::sleep(Duration::from_millis(30));
            panic!("a write that fails as no write should");
        });
        let left = state.left_after(token, Duration::from_secs(10)).unwrap();
        assert!(t.join().is_err());
        assert_eq!(left.written, Written::Unknown);
        assert_eq!(later_said(&left, true), "Route.meno was being saved, and Meno cannot tell whether that save was finished: look at Route.meno before saving over it. It is open again.");
    }

    #[test]
    fn a_write_that_does_not_end_is_waited_for_no_longer_than_the_limit() {
        let state = Arc::new(PageStop::default());
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token), Path::new(NOWHERE)).unwrap();
        state.held().stopped(Kind::Ended, Instant::now());
        let at = Instant::now();
        let left = state.left_after(token, Duration::from_millis(80)).unwrap();
        assert!(at.elapsed() >= Duration::from_millis(80) && at.elapsed() < Duration::from_secs(5));
        assert_eq!(left.written, Written::Writing);
        assert_eq!(later_said(&left, false), "Route.meno was being saved, and that save has not ended yet: open Route.meno again later, to see what it holds.");
        // and where Meno closes after it
        assert_eq!(
            said(Then::CloseAgain, Some(&left), false),
            "Meno's window stopped working again, soon after it was started again. What was not saved is lost. Route.meno was being saved, and that save had not ended: once Meno is started again, open Route.meno to see what it holds. Meno will close."
        );
    }

    #[test]
    fn a_write_that_ends_is_said_as_it_ended_once_it_has() {
        let state = Arc::new(PageStop::default());
        let token = state.saving("a.meno".into());
        state.write_begins(Some(token), Path::new(NOWHERE)).unwrap();
        let mut write = mark(&state, token);
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        assert_eq!(plan.saving.unwrap().written, Written::Writing);
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            write.ended(true);
        });
        let left = state.left_after(token, Duration::from_secs(10)).unwrap();
        t.join().unwrap();
        assert_eq!(later_said(&left, true), "a.meno was being saved, and the save was finished: a.meno is as saved. It is open again.");
        // a write that fails
        let state = Arc::new(PageStop::default());
        let token = state.saving("a.meno".into());
        state.write_begins(Some(token), Path::new(NOWHERE)).unwrap();
        let mut write = mark(&state, token);
        state.held().stopped(Kind::Ended, Instant::now());
        write.ended(false);
        drop(write);
        assert_eq!(later_said(&state.left_after(token, Duration::ZERO).unwrap(), true), "a.meno was being saved, and that save did not happen: a.meno is as it was before. It is open again.");
    }

    #[test]
    fn the_close_path_says_what_the_save_left_within_its_limit() {
        // (the wait `close` makes, with a write that ends and one that does not)
        let state = Arc::new(PageStop::default());
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token), Path::new(NOWHERE)).unwrap();
        state.held().started_again = Some(Instant::now());
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        assert_eq!(plan.then, Then::CloseAgain);
        let mut write = mark(&state, token);
        write.ended(true);
        drop(write);
        let left = state.left_after(token, CLOSE_WAIT).unwrap();
        assert_eq!(
            said(plan.then, Some(&left), false),
            "Meno's window stopped working again, soon after it was started again. What was not saved is lost. Route.meno was being saved, and the save was finished: Route.meno is as saved. Meno will close."
        );
    }

    /// A stop of the page while `name` is being written, its files `files`: the state, the save's token, its write's mark, and the plan.
    /// (in a folder of its own, `tag`'s: `w/<name>` being written, `files` there, the tabs' files as they are named)
    fn stopped_while_writing(tag: &str, name: &str, files: &[&str]) -> (PathBuf, Arc<PageStop>, u64, Mark, Plan) {
        let mut all = files.to_vec();
        let written = format!("w/{name}");
        all.push(&written);
        let dir = folder(tag, &all);
        let state = Arc::new(PageStop::default());
        state.held().files = files.iter().map(|f| at(&dir, f)).collect();
        let token = state.saving(name.into());
        state.write_begins(Some(token), &dir.join(&written)).unwrap();
        let write = mark(&state, token);
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        (dir, state, token, write, plan)
    }

    #[test]
    fn start_again_opens_the_rest_at_once_and_the_file_being_saved_once_its_write_has_ended_an_open_of_it_meanwhile_too() {
        let (dir, state, _, mut write, plan) = stopped_while_writing("reopen", "Route.meno", &["w/a.meno", "w/Route.meno", "w/b.meno", "x/Route.meno"]);
        let done: Arc<Mutex<Vec<String>>> = Arc::default();
        let (runs, said) = (state.clone(), done.clone());
        let run = std::thread::spawn(move || {
            let (open, reload, told) = (said.clone(), said.clone(), said.clone());
            run_start_again(
                &runs,
                plan,
                Duration::from_secs(60),
                move |files| open.lock().unwrap().push(format!("open {}", files.join(" "))),
                move || reload.lock().unwrap().push("reload".into()),
                move || told.lock().unwrap().push("told".into()),
            );
        });
        // the chemist opens the file by hand while its write goes on - from Open, or from outside: held back, not opened now
        // (another of the same name, in another folder, is not it: opened at once)
        assert_eq!(state.hold_opens(vec![at(&dir, "w/Route.meno"), at(&dir, "w/b.meno"), at(&dir, "x/Route.meno")]), vec![at(&dir, "w/b.meno"), at(&dir, "x/Route.meno")]);
        write.ended(true);
        drop(write);
        run.join().unwrap();
        // the rest at once, the page started again, then the file - once, as saved - and the later words told
        let done = done.lock().unwrap().clone();
        assert_eq!(done, [format!("open {} {} {}", at(&dir, "w/a.meno"), at(&dir, "w/b.meno"), at(&dir, "x/Route.meno")), "reload".into(), format!("open {}", at(&dir, "w/Route.meno")), "told".into()]);
        assert_eq!(state.held().later_said.as_deref(), Some("Route.meno was being saved, and the save was finished: Route.meno is as saved. It is open again."));
        // and once the write has ended, an Open of it opens at once
        assert_eq!(state.hold_opens(vec![at(&dir, "w/Route.meno")]), vec![at(&dir, "w/Route.meno")]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn start_again_with_no_save_under_way_opens_every_file_at_once_and_says_nothing_more() {
        let state = PageStop::default();
        state.held().files = vec!["/w/a.meno".into()];
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        let done = Mutex::new(Vec::new());
        run_start_again(&state, plan, Duration::ZERO, |f| done.lock().unwrap().push(f.join(" ")), || done.lock().unwrap().push("reload".into()), || done.lock().unwrap().push("told".into()));
        assert_eq!(*done.lock().unwrap(), ["/w/a.meno", "reload"]);
        assert!(state.held().later_said.is_none());
        assert_eq!(state.hold_opens(vec!["/w/a.meno".into()]), vec!["/w/a.meno".to_string()]);
    }

    #[test]
    fn a_save_over_the_file_being_written_waits_for_that_write_and_is_refused_only_past_the_limit() {
        let (dir, state, first, write, _) = stopped_while_writing("over", "Route.meno", &["x/Route.meno"]);
        let route = dir.join("w/Route.meno");
        let second = state.saving("Route.meno".into());
        assert_eq!(state.write_begins(Some(second), &route), Ok(Some(second)));
        // past the limit, while the first is still being written: refused, in true words
        assert_eq!(
            state.write_after_left(&route, Some(second), Duration::ZERO),
            Err("Route.meno is still being written by the save made as Meno's window stopped; save again once that save has ended".into())
        );
        // the same file reached through a link, or spelled in another case where the volume does not tell case apart: the same
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&route, dir.join("w/link.meno")).unwrap();
            assert!(state.write_after_left(&dir.join("w/link.meno"), None, Duration::ZERO).is_err());
        }
        let other_case = dir.join("w/ROUTE.meno");
        if other_case.exists() {
            assert!(state.write_after_left(&other_case, None, Duration::ZERO).is_err());
        }
        // a file of the same name in another folder, another file, or the first write itself: at once
        assert_eq!(state.write_after_left(&dir.join("x/Route.meno"), Some(second), Duration::ZERO), Ok(()));
        assert_eq!(state.write_after_left(&dir.join("w/Other.meno"), Some(second), Duration::ZERO), Ok(()));
        assert_eq!(state.write_after_left(&route, Some(first), Duration::ZERO), Ok(()));
        // within it: written only after the first write has ended
        let order: Arc<Mutex<Vec<&str>>> = Arc::default();
        let (waits, written, to) = (state.clone(), order.clone(), route.clone());
        let later = std::thread::spawn(move || {
            waits.write_after_left(&to, Some(second), Duration::from_secs(60)).unwrap();
            written.lock().unwrap().push("second written");
        });
        order.lock().unwrap().push("first ended");
        drop(write);
        later.join().unwrap();
        assert_eq!(*order.lock().unwrap(), ["first ended", "second written"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn close_shows_its_message_once_the_save_has_ended_and_then_exits() {
        let (_dir, state, _, mut write, _) = stopped_while_writing("close", "Route.meno", &[]);
        // a second stop soon after: closed
        state.held().started_again = Some(Instant::now());
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token), Path::new(NOWHERE)).unwrap();
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        assert_eq!(plan.then, Then::CloseAgain);
        write.ended(true);
        drop(write);
        let second = mark(&state, token);
        let done: Arc<Mutex<Vec<String>>> = Arc::default();
        let (runs, seen) = (state.clone(), done.clone());
        let run = std::thread::spawn(move || {
            let (show, exit) = (seen.clone(), seen.clone());
            run_close(&runs, plan, Duration::from_secs(60), move |w| show.lock().unwrap().push(w), move || exit.lock().unwrap().push("exit".into()));
        });
        drop(second);
        run.join().unwrap();
        assert_eq!(
            *done.lock().unwrap(),
            [
                "Meno's window stopped working again, soon after it was started again. What was not saved is lost. Route.meno was being saved, and Meno cannot tell whether that save was finished: look at Route.meno before saving over it. Meno will close.".to_string(),
                "exit".to_string()
            ]
        );
        // and past its limit, without waiting longer: said so, and exits all the same
        let (_dir2, state, _, _write, mut plan) = stopped_while_writing("close-past", "Route.meno", &[]);
        plan.then = Then::CloseGone;
        let done = Mutex::new(Vec::new());
        run_close(&state, plan, Duration::ZERO, |w| done.lock().unwrap().push(w), || done.lock().unwrap().push("exit".into()));
        assert_eq!(
            *done.lock().unwrap(),
            [
                "Meno's window stopped working. What was not saved is lost. Route.meno was being saved, and that save had not ended: once Meno is started again, open Route.meno to see what it holds. Meno will close.".to_string(),
                "exit".to_string()
            ]
        );
    }

    #[test]
    fn the_words_say_what_came_of_the_work() {
        assert_eq!(said(Then::StartAgain, None, false), "Meno's window stopped working and was started again. What was not saved is lost.");
        for written in [Written::NotYet, Written::Shut, Written::Failed] {
            assert_eq!(
                said(Then::StartAgain, saving("Route.meno", 1, written).as_ref(), false),
                "Meno's window stopped working and was started again. What was not saved is lost. Route.meno was being saved, and that save did not happen: Route.meno is as it was before."
            );
        }
        assert_eq!(
            said(Then::StartAgain, saving("Route.meno", 1, Written::Done).as_ref(), true),
            "Meno's window stopped working and was started again. What was not saved is lost. Route.meno was being saved, and the save was finished: Route.meno is as saved. The files that were open are open again, as they were last saved."
        );
        assert_eq!(said(Then::CloseGone, None, false), "Meno's window stopped working. What was not saved is lost. Meno will close.");
    }

    #[test]
    fn the_log_line_names_no_file() {
        assert_eq!(log_line(Kind::Ended, true, Then::StartAgain), "the window's page stopped (its process ended); a save was under way; started again");
        assert_eq!(
            log_line(Kind::Ended, false, Then::CloseAgain),
            "the window's page stopped (its process ended); no save was under way; it stopped again soon after it was started again: Meno closes"
        );
        assert_eq!(log_line(Kind::Gone, false, Then::CloseGone), "the window's page stopped (the web view's own process ended); no save was under way; no page can be shown: Meno closes");
    }
}
