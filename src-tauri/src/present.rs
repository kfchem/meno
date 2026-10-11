//! The window given over to a talk (docs/PRESENTING.md): made to cover its
//! screen - on a Mac over the screen where it is, its menu bar and Dock
//! hidden, as slides software plays a talk, not in a space of its own the
//! system slides to; elsewhere the system's full screen - and back.

/// The window made to cover its screen, or back: whether this changed it.
/// One the system already shows full screen is left as it is. On a Mac
/// the keys then go to the page again: the window's own view takes them
/// as its title bar comes and goes (tao), and the first keys of a talk
/// went nowhere until it was clicked.
#[tauri::command]
pub fn present_window(window: tauri::WebviewWindow, on: bool) -> Result<bool, String> {
    if on && window.is_fullscreen().map_err(|e| e.to_string())? {
        return Ok(false);
    }
    window.set_simple_fullscreen(on).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    window
        .with_webview(|w| {
            use objc2_app_kit::{NSView, NSWindow};
            // SAFETY: on the main thread, where with_webview calls this; the
            // pointers are the window's and its WKWebView's, alive while it is.
            unsafe {
                let view = &*(w.inner() as *const NSView);
                let ns_window = &*(w.ns_window() as *const NSWindow);
                ns_window.makeFirstResponder(Some(view));
            }
        })
        .map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(true)
}
