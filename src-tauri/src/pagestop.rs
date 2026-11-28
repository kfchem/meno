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
//! the name of the workspace file being saved (`page_saving`) and the files
//! its tabs hold (`page_files`). A save's bytes are written here, apart
//! from the page (savefile.rs), so a page that stops during a save may
//! leave the file as saved: what the file is, is said as it is - waited
//! for while it is being written - and a save the stopped page had not yet
//! handed over is not written after it.
//!
//! macOS: Tauri's `on_web_content_process_terminate`. Windows: WebView2's
//! `ProcessFailed`, whose kind says whether the page's process ended, the
//! page stopped answering (logged once, nothing more: it may answer again),
//! or the web view's own process ended (no page can be shown). Linux: not
//! handled - nothing in Tauri tells it there.

use std::path::Path;
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// How soon after the page was started again its stopping again closes Meno
/// rather than starting it a third time: long enough for the files opened
/// again to be read and the first moments of work - a file that stops the
/// page as it opens stops it again within this - short enough that a
/// stop an hour later is taken as one of its own.
pub const SOON: Duration = Duration::from_secs(120);

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
    /// Not yet here as the page stopped: never written after it.
    Shut,
}

/// A save the page told of: the file's name only.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Saving {
    pub name: String,
    pub written: Written,
}

/// What a stopped page left, for what is said of it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stop {
    pub saving: Option<Saving>,
    /// Workspace files opened again.
    pub reopened: bool,
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

/// What the chemist is told: in the page started again, or, where Meno closes, in a native message.
pub fn said(stop: &Stop, then: Then) -> String {
    let mut s = vec![match then {
        Then::StartAgain => "Meno's window stopped working and was started again.".to_string(),
        Then::CloseAgain => "Meno's window stopped working again, soon after it was started again.".to_string(),
        Then::CloseGone => "Meno's window stopped working.".to_string(),
    }];
    s.push("What was not saved is lost.".into());
    if let Some(Saving { name, written }) = &stop.saving {
        s.push(match written {
            Written::Done => format!("{name} was being saved, and the save was finished: {name} is as saved."),
            _ => format!("{name} was being saved, and that save did not happen: {name} is as it was before."),
        });
    }
    if then == Then::StartAgain && stop.reopened {
        s.push("The files that were open are open again, as they were last saved.".into());
    }
    if then != Then::StartAgain {
        s.push("Meno will close.".into());
    }
    s.join(" ")
}

#[derive(Default)]
struct Held {
    /// The save the page tells of now.
    saving: Option<Saving>,
    /// The workspace files its tabs hold.
    files: Vec<String>,
    /// When the page was last started again.
    started_again: Option<Instant>,
    /// What the page started again is to be told, till it asks.
    came_back: Option<(Stop, Then)>,
    /// Whether its not answering is said already, since it was last started.
    unanswered: bool,
}

impl Held {
    /// The save told of - the page's now, or the stopped page's - named `name`, `path`'s or `target`'s.
    fn saving_of(&mut self, path: &Path, target: &Path) -> Option<&mut Saving> {
        let named = |s: &Saving| [path, target].iter().any(|p| p.file_name().is_some_and(|n| n.to_string_lossy() == s.name.as_str()));
        if self.saving.as_ref().is_some_and(named) {
            return self.saving.as_mut();
        }
        self.came_back.as_mut().and_then(|(stop, _)| stop.saving.as_mut()).filter(|s| named(s))
    }

    /// The page stopped as `kind` says, at `now`: what is done, and what it left; none where nothing is done.
    fn stopped(&mut self, kind: Kind, now: Instant) -> Option<(Stop, Then, Vec<String>)> {
        if kind == Kind::NotAnswering {
            return None;
        }
        let then = then(kind, self.started_again, now);
        let mut saving = self.saving.take();
        if let Some(s) = saving.as_mut().filter(|s| s.written == Written::NotYet) {
            s.written = Written::Shut;
        }
        let files = if then == Then::StartAgain { std::mem::take(&mut self.files) } else { Vec::new() };
        let stop = Stop { saving, reopened: !files.is_empty() };
        if then == Then::StartAgain {
            self.started_again = Some(now);
            self.unanswered = false;
        }
        self.came_back = Some((stop.clone(), then));
        Some((stop, then, files))
    }
}

/// The page's stops, and what it tells of as it goes.
#[derive(Default)]
pub struct PageStop {
    held: Mutex<Held>,
    /// Told as a save told of is written, or not.
    settled: Condvar,
}

impl PageStop {
    fn held(&self) -> MutexGuard<'_, Held> {
        self.held.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// What a stopped page left, once a save of it being written is written or not.
    fn settled(&self, take: impl Fn(&mut Held) -> Option<(Stop, Then)>) -> Option<(Stop, Then)> {
        let mut held = self.held();
        loop {
            let writing = held.came_back.as_ref().is_some_and(|(s, _)| s.saving.as_ref().is_some_and(|s| s.written == Written::Writing));
            if !writing {
                return take(&mut held);
            }
            held = self.settled.wait(held).unwrap_or_else(|e| e.into_inner());
        }
    }

    /// A document is to be written to `path` (`target`, its file): where it is the save told of, its writing begun -
    /// and refused where the page that asked for it has stopped. Whether it is that save.
    pub fn write_begins(&self, path: &Path, target: &Path) -> Result<bool, String> {
        let mut held = self.held();
        match held.saving_of(path, target) {
            Some(s) if s.written == Written::Shut => Err("the window that asked for this save had stopped".into()),
            Some(s) if s.written == Written::NotYet => {
                s.written = Written::Writing;
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    /// The save told of, written to `path` or not.
    pub fn write_ends(&self, path: &Path, target: &Path, ok: bool) {
        let mut held = self.held();
        if let Some(s) = held.saving_of(path, target).filter(|s| s.written == Written::Writing) {
            s.written = if ok { Written::Done } else { Written::Failed };
        }
        drop(held);
        self.settled.notify_all();
    }
}

/// The workspace file the page saves now, by its name; none as the save ends.
#[tauri::command]
pub fn page_saving(state: tauri::State<'_, PageStop>, name: Option<String>) {
    state.held().saving = name.map(|name| Saving { name, written: Written::NotYet });
}

/// The workspace files the page's tabs hold: those it may read, which are workspace files, kept to open again.
#[tauri::command]
pub fn page_files(app: AppHandle, state: tauri::State<'_, PageStop>, paths: Vec<String>) {
    use tauri_plugin_fs::FsExt;
    let scope = app.try_fs_scope();
    let paths = paths.into_iter().filter(|p| scope.as_ref().is_some_and(|s| s.is_allowed(p)) && crate::opened::is_workspace(Path::new(p))).collect();
    state.held().files = paths;
}

/// What the page, started again after it stopped, is told of it - once; none at any other start.
#[tauri::command]
pub async fn page_came_back(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<PageStop>();
        state.settled(|h| h.came_back.take().filter(|(_, then)| *then == Then::StartAgain)).map(|(stop, then)| said(&stop, then))
    })
    .await
    .ok()
    .flatten()
}

/// The main window's page stopped as `kind` says: said in the log, and started again - or Meno closed.
pub fn stopped(app: &AppHandle, kind: Kind) {
    let state = app.state::<PageStop>();
    let done = {
        let mut held = state.held();
        if kind == Kind::NotAnswering {
            if !std::mem::replace(&mut held.unanswered, true) {
                crate::logfile::line("meno", "the window's page stopped answering; left to answer again");
            }
            return;
        }
        held.stopped(kind, Instant::now())
    };
    let Some((stop, then, files)) = done else { return };
    crate::logfile::line("meno", &log_line(kind, stop.saving.is_some(), then));
    if then == Then::StartAgain {
        // (taken by the page as it comes up, as files opened from outside are: opened.rs)
        crate::opened::open(app, files);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.reload();
        }
        return;
    }
    // (said once a save being written is written or not; then closed as a quit closes Meno: RunEvent::Exit)
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<PageStop>();
        let (stop, then) = state.settled(|h| h.came_back.take()).unwrap_or((stop, then));
        use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
        let quit = app.clone();
        app.dialog()
            .message(said(&stop, then))
            .title("Meno")
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::Ok)
            .show(move |_| quit.exit(0));
    });
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
        let _ = core.add_ProcessFailed(&handler, &mut token);
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn saving(name: &str, written: Written) -> Option<Saving> {
        Some(Saving { name: name.into(), written })
    }

    #[test]
    fn a_page_that_stops_is_started_again_and_a_second_stop_soon_after_closes_meno() {
        let t0 = Instant::now();
        // the first stop: started again
        assert_eq!(then(Kind::Ended, None, t0), Then::StartAgain);
        // again within SOON of that start: closed
        assert_eq!(then(Kind::Ended, Some(t0), t0 + Duration::from_secs(30)), Then::CloseAgain);
        assert_eq!(then(Kind::Ended, Some(t0), t0 + SOON - Duration::from_millis(1)), Then::CloseAgain);
        // long after: started again
        assert_eq!(then(Kind::Ended, Some(t0), t0 + SOON), Then::StartAgain);
        assert_eq!(then(Kind::Ended, Some(t0), t0 + Duration::from_secs(3600)), Then::StartAgain);
        // no page to show: closed, first time or not
        assert_eq!(then(Kind::Gone, None, t0), Then::CloseGone);
    }

    #[test]
    fn what_is_held_follows_the_stops() {
        let t0 = Instant::now();
        let mut held = Held { files: vec!["/w/a.meno".into()], ..Held::default() };
        // not answering: nothing done
        assert_eq!(held.stopped(Kind::NotAnswering, t0), None);
        let (stop, then, files) = held.stopped(Kind::Ended, t0).unwrap();
        assert_eq!((then, files, stop.reopened), (Then::StartAgain, vec!["/w/a.meno".to_string()], true));
        assert_eq!(held.started_again, Some(t0));
        // the second, soon: closed, nothing opened again
        let (stop, then, files) = held.stopped(Kind::Ended, t0 + Duration::from_secs(5)).unwrap();
        assert_eq!((then, files.len(), stop.reopened), (Then::CloseAgain, 0, false));
        // and a later one, after a start long before: started again
        let mut held = Held { started_again: Some(t0), ..Held::default() };
        assert_eq!(held.stopped(Kind::Ended, t0 + SOON + Duration::from_secs(1)).unwrap().1, Then::StartAgain);
    }

    #[test]
    fn a_save_told_of_is_followed_and_one_not_yet_handed_over_is_never_written_after_the_page_stops() {
        let (path, target) = (PathBuf::from("/w/link.meno"), PathBuf::from("/w/real.meno"));
        let state = PageStop::default();
        // none told: any document written as it is
        assert_eq!(state.write_begins(&path, &target), Ok(false));
        // told, by the name of the file a link leads to: being written, then written
        state.held().saving = saving("real.meno", Written::NotYet);
        assert_eq!(state.write_begins(&path, &target), Ok(true));
        assert_eq!(state.held().saving, saving("real.meno", Written::Writing));
        state.write_ends(&path, &target, true);
        assert_eq!(state.held().saving, saving("real.meno", Written::Done));
        // another file, as it is saved: not this one
        assert_eq!(state.write_begins(Path::new("/w/b.svg"), Path::new("/w/b.svg")), Ok(false));
        // a page that stops before its save's bytes are here: that save is not written after
        state.held().saving = saving("real.meno", Written::NotYet);
        state.held().stopped(Kind::Ended, Instant::now());
        assert!(state.held().saving.is_none());
        assert!(state.write_begins(&path, &target).is_err());
        // one that stops as it is being written: written, and said so once it is
        let state = PageStop::default();
        state.held().saving = saving("real.meno", Written::NotYet);
        state.write_begins(&path, &target).unwrap();
        state.held().stopped(Kind::Ended, Instant::now());
        state.write_ends(&path, &target, false);
        let (stop, _) = state.settled(|h| h.came_back.take()).unwrap();
        assert_eq!(stop.saving, saving("real.meno", Written::Failed));
    }

    #[test]
    fn what_is_said_waits_for_a_save_being_written() {
        let (path, target) = (PathBuf::from("/w/a.meno"), PathBuf::from("/w/a.meno"));
        let state = std::sync::Arc::new(PageStop::default());
        state.held().saving = saving("a.meno", Written::NotYet);
        state.write_begins(&path, &target).unwrap();
        state.held().stopped(Kind::Ended, Instant::now());
        let writer = state.clone();
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            writer.write_ends(&path, &target, true);
        });
        let (stop, then) = state.settled(|h| h.came_back.take()).unwrap();
        t.join().unwrap();
        assert_eq!(said(&stop, then), "Meno's window stopped working and was started again. What was not saved is lost. a.meno was being saved, and the save was finished: a.meno is as saved.");
        // told once: none the next time it is asked
        assert!(state.settled(|h| h.came_back.take()).is_none());
    }

    #[test]
    fn the_words_say_what_came_of_the_work() {
        let plain = Stop { saving: None, reopened: false };
        assert_eq!(said(&plain, Then::StartAgain), "Meno's window stopped working and was started again. What was not saved is lost.");
        let reopened = Stop { saving: None, reopened: true };
        assert_eq!(
            said(&reopened, Then::StartAgain),
            "Meno's window stopped working and was started again. What was not saved is lost. The files that were open are open again, as they were last saved."
        );
        for written in [Written::NotYet, Written::Shut, Written::Failed] {
            let stop = Stop { saving: saving("Route.meno", written), reopened: false };
            assert_eq!(
                said(&stop, Then::StartAgain),
                "Meno's window stopped working and was started again. What was not saved is lost. Route.meno was being saved, and that save did not happen: Route.meno is as it was before."
            );
        }
        let stop = Stop { saving: saving("Route.meno", Written::Shut), reopened: false };
        assert_eq!(
            said(&stop, Then::CloseAgain),
            "Meno's window stopped working again, soon after it was started again. What was not saved is lost. Route.meno was being saved, and that save did not happen: Route.meno is as it was before. Meno will close."
        );
        assert_eq!(said(&plain, Then::CloseGone), "Meno's window stopped working. What was not saved is lost. Meno will close.");
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
