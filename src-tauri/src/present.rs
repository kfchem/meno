//! The window given over to a talk (docs/PRESENTING.md): made to cover its
//! screen - on a Mac over the screen where it is, its menu bar and Dock
//! hidden, as slides software plays a talk, not in a space of its own the
//! system slides to; elsewhere the system's full screen - and back.

/// The window made to cover its screen, or back: whether this changed it.
/// One the system already shows full screen is left as it is. On a Mac
/// the keys then go to the page again: the window's own view takes them
/// as its title bar comes and goes (tao), and the first keys of a talk
/// went nowhere until it was clicked - nor, once it was over, did any.
#[tauri::command]
pub fn present_window(window: tauri::WebviewWindow, on: bool) -> Result<bool, String> {
    if on && window.is_fullscreen().map_err(|e| e.to_string())? {
        return Ok(false);
    }
    window.set_simple_fullscreen(on).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let later = window.clone();
        window
            .with_webview(move |w| {
                keys_to_page(&w);
                // (going back, tao gives its view the keys on the main queue,
                // after this - so the page takes them again after that)
                dispatch2::DispatchQueue::main().exec_async(move || {
                    let _ = later.with_webview(|w| keys_to_page(&w));
                });
            })
            .map_err(|e| e.to_string())?;
    }
    let _ = window.set_focus();
    Ok(true)
}

/// The window's keys given to its page: its WKWebView made first responder.
#[cfg(target_os = "macos")]
fn keys_to_page(w: &tauri::webview::PlatformWebview) {
    use objc2_app_kit::{NSView, NSWindow};
    // SAFETY: on the main thread, where with_webview calls this; the
    // pointers are the window's and its WKWebView's, alive while it is.
    unsafe {
        let view = &*(w.inner() as *const NSView);
        let ns_window = &*(w.ns_window() as *const NSWindow);
        ns_window.makeFirstResponder(Some(view));
    }
}
