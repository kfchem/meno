//! Whether the main window can be seen, as its own state says: not where it
//! is minimised or hidden. The page rests its running marks while it cannot
//! (src/ui/features/Workspace/pageGl/runningTick.ts), but its document is not
//! told of a minimised window on every system - so the back end tells it:
//! `window:seen` (true or false) as it changes, at every resize, move or
//! change of focus of the window (a minimise and a restore come as a resize,
//! or as a focus); and `window_seen` for the state as it is now, which the
//! page asks once as it starts. A window covered by others, or on another
//! desktop, is none of this: the page knows of that only where the system
//! tells it.

use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Emitter, Manager, Window};

/// The window's label, and the event the page is told by.
const LABEL: &str = crate::windowstate::LABEL;
const EVENT: &str = "window:seen";

/// Whether a window may be seen, from what it says: unseen only where it says it is minimised or not visible; seen where it cannot say.
pub fn seen_from(minimized: Option<bool>, visible: Option<bool>) -> bool {
    minimized != Some(true) && visible != Some(false)
}

/// What the page was last told: none yet, seen, or unseen.
#[derive(Default)]
pub struct Told(AtomicU8);

impl Told {
    /// Whether `now` is news: true the first time and at each change, false where it is what was last told.
    pub fn news(&self, now: bool) -> bool {
        let code = if now { 1 } else { 2 };
        self.0.swap(code, Ordering::SeqCst) != code
    }
}

/// A window event of the main window: where it changed whether the window can be seen, the page is told.
pub fn on_event(w: &Window, event: &tauri::WindowEvent) {
    if w.label() != LABEL {
        return;
    }
    if !matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Focused(_)) {
        return;
    }
    let now = seen_from(w.is_minimized().ok(), w.is_visible().ok());
    if w.app_handle().state::<Told>().news(now) {
        let _ = w.app_handle().emit_to(LABEL, EVENT, now);
    }
}

/// Whether the main window can be seen now: asked by the page as it starts (a window started minimised).
#[tauri::command]
pub fn window_seen(app: AppHandle) -> bool {
    let Some(w) = app.get_webview_window(LABEL) else { return true };
    let now = seen_from(w.is_minimized().ok(), w.is_visible().ok());
    app.state::<Told>().news(now);
    now
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_is_unseen_only_where_it_says_it_is_minimised_or_hidden() {
        assert!(seen_from(Some(false), Some(true)));
        assert!(!seen_from(Some(true), Some(true)));
        assert!(!seen_from(Some(false), Some(false)));
        assert!(!seen_from(Some(true), Some(false)));
        // (where it cannot say, it is taken as seen: the page never rests on a guess)
        assert!(seen_from(None, None));
        assert!(!seen_from(Some(true), None));
        assert!(!seen_from(None, Some(false)));
    }

    #[test]
    fn the_page_is_told_the_first_time_and_at_each_change_only() {
        let told = Told::default();
        assert!(told.news(true));
        assert!(!told.news(true));
        assert!(told.news(false));
        assert!(!told.news(false));
        assert!(told.news(true));
        let first_unseen = Told::default();
        assert!(first_unseen.news(false));
    }
}
