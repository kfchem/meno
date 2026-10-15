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

use tauri::utils::config::{BuildConfig, FrontendDist, WebviewUrl, WindowConfig};
use tauri::Url;
#[cfg(windows)]
use tauri::{AppHandle, WebviewWindowBuilder};
#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings5;
#[cfg(windows)]
use windows_core_62::{Interface, HSTRING};

/// The URL a window's page is loaded from, as Tauri's docs say it resolves
/// a window's `url`: an external one as it is; an app path on the dev
/// server's URL (`devUrl`) while developing, else on `frontendDist` where
/// that is a URL, else on the app's own protocol - `http://tauri.localhost`
/// on Windows, `https` with the window's `useHttpsScheme` - "index.html"
/// being the base itself, as Tauri loads it. None where it is none of these.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn page_url(build: &BuildConfig, window: &WindowConfig, dev: bool) -> Option<Url> {
    let path = match &window.url {
        WebviewUrl::External(url) => return Some(url.clone()),
        WebviewUrl::App(path) => path,
        _ => return None,
    };
    let base = if dev {
        build.dev_url.clone()?
    } else if let Some(FrontendDist::Url(url)) = &build.frontend_dist {
        url.clone()
    } else {
        Url::parse(if window.use_https_scheme { "https://tauri.localhost/" } else { "http://tauri.localhost/" }).ok()?
    };
    if path.to_str() == Some("index.html") {
        Some(base)
    } else {
        base.join(&path.to_string_lossy()).ok()
    }
}

/// The main window made as `config` says, its pinch let through before its page first loads.
#[cfg(windows)]
pub fn open_main(app: &AppHandle, config: &WindowConfig) -> tauri::Result<()> {
    let page = page_url(&app.config().build, config, tauri::is_dev()).ok_or(tauri::Error::InvalidWebviewUrl("the main window's page"))?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn config() -> tauri::Config {
        serde_json::from_str(&std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json")).unwrap()).unwrap()
    }

    #[test]
    fn the_main_window_s_page_is_where_tauri_loads_it_from() {
        let config = config();
        let main = config.app.windows.iter().find(|w| w.label == "main").unwrap();
        // (made in setup, not from the config: pinch.rs on Windows, from_config elsewhere)
        assert!(!main.create);
        // built: the app's own protocol, as Windows has it with Meno's settings - the base, for "index.html"
        assert_eq!(page_url(&config.build, main, false).unwrap().as_str(), "http://tauri.localhost/");
        // developing: the dev server
        assert_eq!(page_url(&config.build, main, true), config.build.dev_url.clone());
        // and as a later setting would have it
        let https = WindowConfig { use_https_scheme: true, ..main.clone() };
        assert_eq!(page_url(&config.build, &https, false).unwrap().as_str(), "https://tauri.localhost/");
        let other = WindowConfig { url: WebviewUrl::App("talk.html".into()), ..main.clone() };
        assert_eq!(page_url(&config.build, &other, false).unwrap().as_str(), "http://tauri.localhost/talk.html");
        let dist = BuildConfig { frontend_dist: Some(FrontendDist::Url(Url::parse("https://example.org/app/").unwrap())), ..config.build.clone() };
        assert_eq!(page_url(&dist, main, false).unwrap().as_str(), "https://example.org/app/");
    }
}
