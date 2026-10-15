//! A pinch the page takes for its own zoom, on Windows (docs/EDITOR-2D.md,
//! *Touch and pinch*): two fingers on a precision touchpad or on a touch
//! screen. WebView2's `IsPinchZoomEnabled` (ICoreWebView2Settings5) is
//! whether the user may pinch at all, and a webview made by Tauri has it
//! off along with its zoom by Ctrl and the wheel or the keys
//! (`IsZoomControlEnabled`, Tauri's `zoomHotkeysEnabled`). A setting takes
//! effect from the next navigation, so the main window is made here, not
//! from tauri.conf.json (its `create` is false: "create it with
//! WebviewWindowBuilder::from_config"), at about:blank and hidden; the
//! pinch is let through, and only then is the page itself loaded - once.
//!
//! The page takes every pinch for itself: a touchpad's comes to it as the
//! wheel with Ctrl held, whose default it prevents everywhere (Chromium: a
//! page that prevents it zooms nothing of its own), and a touch screen's
//! finds no pinch allowed (`touch-action`, App.css and PanZoom2D). Ctrl with
//! the wheel or the keys still zooms nothing.

use tauri::utils::config::{WebviewUrl, WindowConfig};
use tauri::{AppHandle, Url, WebviewWindowBuilder};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;
use windows_core_62::{Interface, HSTRING};

/// Where the page is loaded from: the dev server's URL while developing, else
/// the app's own protocol, `http://tauri.localhost` on Windows (Tauri's
/// `useHttpsScheme`, which Meno leaves off) - at the window's own path.
fn page_url(app: &AppHandle, config: &WindowConfig) -> Option<Url> {
    match &config.url {
        WebviewUrl::External(url) => Some(url.clone()),
        WebviewUrl::App(path) => {
            let base = if tauri::is_dev() { app.config().build.dev_url.clone()? } else { Url::parse("http://tauri.localhost/").ok()? };
            base.join(&path.to_string_lossy()).ok()
        }
        _ => None,
    }
}

/// The main window made as `config` says, its pinch let through before its page first loads.
pub fn open_main(app: &AppHandle, config: &WindowConfig) -> tauri::Result<()> {
    let page = page_url(app, config).ok_or_else(|| tauri::Error::InvalidWebviewUrl("the main window's page"))?;
    let mut blank = config.clone();
    blank.url = WebviewUrl::External(Url::parse("about:blank").expect("about:blank is a URL"));
    blank.visible = false;
    let window = WebviewWindowBuilder::from_config(app, &blank)?.build()?;
    window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        // (the setting first, then the page: the navigation it takes effect from)
        if let Ok(settings5) = core.Settings().and_then(|s| s.cast::<ICoreWebView2Settings5>()) {
            let _ = settings5.SetIsPinchZoomEnabled(true);
        }
        let _ = core.Navigate(&HSTRING::from(page.as_str()));
    })?;
    if config.visible {
        window.show()?;
    }
    Ok(())
}
