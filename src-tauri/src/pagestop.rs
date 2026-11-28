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

use std::path::Path;
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

/// A save the page told of: the file's name, and the token its write comes with.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Saving {
    pub name: String,
    pub token: u64,
    pub written: Written,
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

/// The files to open again as the page comes back, and those held back till the save being written ends: the file
/// of that name.
pub fn split_files(files: Vec<String>, writing: Option<&str>) -> (Vec<String>, Vec<String>) {
    files.into_iter().partition(|f| writing.is_none_or(|name| Path::new(f).file_name().is_none_or(|n| n.to_string_lossy() != name)))
}

/// What a stop is to do, as `Held::stopped` finds it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Plan {
    pub then: Then,
    /// The save under way as the page stopped.
    pub saving: Option<Saving>,
    /// The files opened again as the page comes back, and those once the save being written has ended.
    pub now: Vec<String>,
    pub later: Vec<String>,
}

/// The file being written as the page stopped, waited for: its save's token, its name, and the files of that name
/// to open once its write has ended - those its tabs held, and any the chemist opens meanwhile, by any way.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Waiting {
    token: u64,
    name: String,
    later: Vec<String>,
}

#[derive(Default)]
struct Held {
    /// The file whose save was being written as the page stopped, while it is waited for.
    waiting: Option<Waiting>,
    /// The last list of files the page told (`page_files`), so that an older list taken later is let be.
    files_told: u64,
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
        let (now_files, later) = if then == Then::StartAgain {
            let writing = saving.as_ref().filter(|s| s.written == Written::Writing).map(|s| s.name.as_str());
            split_files(std::mem::take(&mut self.files), writing)
        } else {
            (Vec::new(), Vec::new())
        };
        self.waiting = saving
            .as_ref()
            .filter(|s| s.written == Written::Writing && then == Then::StartAgain)
            .map(|s| Waiting { token: s.token, name: s.name.clone(), later: later.clone() });
        if then == Then::StartAgain {
            self.started_again = Some(now);
            self.unanswered = false;
            self.now_said = Some(said(then, saving.as_ref(), !now_files.is_empty()));
        } else {
            self.closing = true;
        }
        Some(Plan { then, saving, now: now_files, later })
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
        held.saving = Some(Saving { name, token, written: Written::NotYet });
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
    pub fn write_begins(&self, token: Option<u64>) -> Result<Option<u64>, String> {
        let Some(token) = token else { return Ok(None) };
        let mut held = self.held();
        if let Some(s) = held.saving.as_mut().filter(|s| s.token == token && s.written == Written::NotYet) {
            s.written = Written::Writing;
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

    /// Of `paths`, those to open now; the rest - of the name of the file waited for - kept to open once its write has ended.
    pub fn hold_opens(&self, paths: Vec<String>) -> Vec<String> {
        let mut held = self.held();
        let Some(waiting) = held.waiting.as_mut() else { return paths };
        let (now, later) = split_files(paths, Some(&waiting.name));
        for p in later {
            if !waiting.later.contains(&p) {
                waiting.later.push(p);
            }
        }
        now
    }

    /// A document to be written to a file named `name` - by the save of `token`, if it is one - once the write of the
    /// stopped page's save of that file has ended, so that the two never interleave and what is said of the first
    /// stays true: at most `limit`; refused past it.
    pub fn write_after_left(&self, name: &str, token: Option<u64>, limit: Duration) -> Result<(), String> {
        let until = Instant::now() + limit;
        let mut held = self.held();
        loop {
            let before = held.left.as_ref().is_some_and(|s| s.written == Written::Writing && s.name == name && Some(s.token) != token);
            if !before {
                return Ok(());
            }
            let now = Instant::now();
            if now >= until {
                return Err(format!("{name} is still being written by the save made as Meno's window stopped; save again once that save has ended"));
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
pub async fn page_files(app: AppHandle, paths: Vec<String>, told: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_fs::FsExt;
        let scope = app.try_fs_scope();
        let paths = paths.into_iter().filter(|p| scope.as_ref().is_some_and(|s| s.is_allowed(p)) && crate::opened::is_workspace(Path::new(p))).collect();
        let state = app.state::<PageStop>();
        let mut held = state.held();
        // (each list in its turn: one looked at more slowly never takes a later one's place)
        if told > held.files_told {
            held.files_told = told;
            held.files = paths;
        }
    })
    .await;
}

/// Of the workspace files the page is to open - picked in Open, dropped, double-clicked - those it opens now: the
/// file whose save was being written as the page stopped is held back till that write has ended, and opened then,
/// as saved.
#[tauri::command]
pub fn page_hold_opens(state: tauri::State<'_, PageStop>, paths: Vec<String>) -> Vec<String> {
    state.hold_opens(paths)
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
    open(plan.now);
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
        Some(Saving { name: name.into(), token, written })
    }

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
        assert_eq!((plan.then, plan.now, plan.later.len()), (Then::StartAgain, vec!["/w/a.meno".to_string()], 0));
        assert_eq!(held.started_again, Some(t0));
        assert!(held.now_said.as_deref().unwrap().ends_with("The files that were open are open again, as they were last saved."));
        // the second, soon: closed, nothing opened again - and a third, as Meno closes: nothing (one message only)
        let plan = held.stopped(Kind::Ended, t0 + Duration::from_secs(5)).unwrap();
        assert_eq!((plan.then, plan.now.len()), (Then::CloseAgain, 0));
        assert_eq!(held.stopped(Kind::Gone, t0 + Duration::from_secs(6)), None);
        let mut held = Held { started_again: Some(t0), ..Held::default() };
        assert_eq!(held.stopped(Kind::Ended, t0 + SOON + Duration::from_secs(1)).unwrap().then, Then::StartAgain);
    }

    #[test]
    fn the_file_being_saved_is_held_back_and_the_rest_open_again_at_once() {
        let mut held = Held { files: vec!["/w/a.meno".into(), "/w/Route.meno".into(), "/x/b.meno".into()], saving: saving("Route.meno", 1, Written::Writing), ..Held::default() };
        let plan = held.stopped(Kind::Ended, Instant::now()).unwrap();
        assert_eq!(plan.now, vec!["/w/a.meno".to_string(), "/x/b.meno".to_string()]);
        assert_eq!(plan.later, vec!["/w/Route.meno".to_string()]);
        assert_eq!(
            held.now_said.unwrap(),
            "Meno's window stopped working and was started again. What was not saved is lost. Route.meno was being saved: what came of that save is said here once it has ended. The files that were open are open again, as they were last saved."
        );
        // a save written already, or not to be: every file at once, as it is on disk
        for written in [Written::Done, Written::NotYet] {
            let mut held = Held { files: vec!["/w/Route.meno".into()], saving: saving("Route.meno", 1, written), ..Held::default() };
            let plan = held.stopped(Kind::Ended, Instant::now()).unwrap();
            assert_eq!((plan.now.len(), plan.later.len()), (1, 0));
        }
    }

    #[test]
    fn a_write_is_known_by_its_token_and_a_later_save_of_the_same_name_is_its_own() {
        let state = Arc::new(PageStop::default());
        // none told: written as it is
        assert_eq!(state.write_begins(None), Ok(None));
        let first = state.saving("Route.meno".into());
        assert_eq!(state.write_begins(Some(first)), Ok(Some(first)));
        let write = mark(&state, first);
        // the page stops while it is written
        state.held().stopped(Kind::Ended, Instant::now());
        // the page that came back saves the same file again: its own save, never refused, never taken for the first
        let second = state.saving("Route.meno".into());
        assert_ne!(first, second);
        assert_eq!(state.write_begins(Some(second)), Ok(Some(second)));
        // the first write ends: the stopped page's save is settled, not the new one
        drop(write);
        assert_eq!(state.held().left, saving("Route.meno", first, Written::Unknown));
        assert_eq!(state.held().saving, saving("Route.meno", second, Written::Writing));
        state.write_ends(second, Written::Done);
        state.saved(second);
        assert!(state.held().saving.is_none());
        // a save not yet handed over as the page stopped: never written after it - by its token alone
        let state = PageStop::default();
        let shut = state.saving("Route.meno".into());
        state.held().stopped(Kind::Ended, Instant::now());
        assert!(state.write_begins(Some(shut)).is_err());
        let again = state.saving("Route.meno".into());
        assert_eq!(state.write_begins(Some(again)), Ok(Some(again)));
    }

    #[test]
    fn a_write_that_panics_is_marked_ended_and_the_wait_for_it_ends() {
        let state = Arc::new(PageStop::default());
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token)).unwrap();
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
        state.write_begins(Some(token)).unwrap();
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
        state.write_begins(Some(token)).unwrap();
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
        state.write_begins(Some(token)).unwrap();
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
        state.write_begins(Some(token)).unwrap();
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
    fn stopped_while_writing(name: &str, files: &[&str]) -> (Arc<PageStop>, u64, Mark, Plan) {
        let state = Arc::new(PageStop::default());
        state.held().files = files.iter().map(|f| f.to_string()).collect();
        let token = state.saving(name.into());
        state.write_begins(Some(token)).unwrap();
        let write = mark(&state, token);
        let plan = state.held().stopped(Kind::Ended, Instant::now()).unwrap();
        (state, token, write, plan)
    }

    #[test]
    fn start_again_opens_the_rest_at_once_and_the_file_being_saved_once_its_write_has_ended_an_open_of_it_meanwhile_too() {
        let (state, _, mut write, plan) = stopped_while_writing("Route.meno", &["/w/a.meno", "/w/Route.meno"]);
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
        assert_eq!(state.hold_opens(vec!["/w/Route.meno".into(), "/w/b.meno".into(), "/x/Route.meno".into()]), vec!["/w/b.meno".to_string()]);
        write.ended(true);
        drop(write);
        run.join().unwrap();
        // the rest at once, the page started again, then the file - once, as saved - and the later words told
        assert_eq!(*done.lock().unwrap(), ["open /w/a.meno", "reload", "open /w/Route.meno /x/Route.meno", "told"]);
        assert_eq!(state.held().later_said.as_deref(), Some("Route.meno was being saved, and the save was finished: Route.meno is as saved. It is open again."));
        // and once the write has ended, an Open of it opens at once
        assert_eq!(state.hold_opens(vec!["/w/Route.meno".into()]), vec!["/w/Route.meno".to_string()]);
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
        let (state, first, write, _) = stopped_while_writing("Route.meno", &[]);
        let second = state.saving("Route.meno".into());
        assert_eq!(state.write_begins(Some(second)), Ok(Some(second)));
        // past the limit, while the first is still being written: refused, in true words
        assert_eq!(
            state.write_after_left("Route.meno", Some(second), Duration::ZERO),
            Err("Route.meno is still being written by the save made as Meno's window stopped; save again once that save has ended".into())
        );
        // another file, or the first write itself: at once
        assert_eq!(state.write_after_left("Other.meno", Some(second), Duration::ZERO), Ok(()));
        assert_eq!(state.write_after_left("Route.meno", Some(first), Duration::ZERO), Ok(()));
        // within it: written only after the first write has ended
        let order: Arc<Mutex<Vec<&str>>> = Arc::default();
        let (waits, written) = (state.clone(), order.clone());
        let later = std::thread::spawn(move || {
            waits.write_after_left("Route.meno", Some(second), Duration::from_secs(60)).unwrap();
            written.lock().unwrap().push("second written");
        });
        order.lock().unwrap().push("first ended");
        drop(write);
        later.join().unwrap();
        assert_eq!(*order.lock().unwrap(), ["first ended", "second written"]);
    }

    #[test]
    fn close_shows_its_message_once_the_save_has_ended_and_then_exits() {
        let (state, _, mut write, _) = stopped_while_writing("Route.meno", &[]);
        // a second stop soon after: closed
        state.held().started_again = Some(Instant::now());
        let token = state.saving("Route.meno".into());
        state.write_begins(Some(token)).unwrap();
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
        let (state, _, _write, mut plan) = stopped_while_writing("Route.meno", &[]);
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
