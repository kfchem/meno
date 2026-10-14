//! A pinch the page takes for its own zoom, on Windows (docs/EDITOR-2D.md,
//! *Touch and pinch*): two fingers on a precision touchpad or on a touch
//! screen. WebView2's `IsPinchZoomEnabled` (ICoreWebView2Settings5) is
//! whether the user may pinch at all; Meno's webview is made with it off,
//! with its zoom by Ctrl and the wheel or the keys (`IsZoomControlEnabled`,
//! Tauri's `zoomHotkeysEnabled`). It is turned on here, and the page loaded
//! again, as a setting changed after a navigation began takes effect only
//! at the next. The page then takes every pinch for itself: a touchpad's
//! comes to it as the wheel with Ctrl held, whose default it prevents
//! everywhere (Chromium: a page that prevents it zooms nothing of its own),
//! and a touch screen's finds no pinch allowed (`touch-action`, App.css and
//! PanZoom2D). Ctrl with the wheel or the keys still zooms nothing.

use tauri::{AppHandle, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;
use windows_core_62::Interface;

/// The pinch let through to the main window's page, and the page loaded again with it.
pub fn start(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        let Ok(settings5) = settings.cast::<ICoreWebView2Settings5>() else { return };
        if settings5.SetIsPinchZoomEnabled(true).is_ok() {
            let _ = core.Reload();
        }
    });
}
