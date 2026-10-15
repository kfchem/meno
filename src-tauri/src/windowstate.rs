//! The main window's size and place, kept and given back as Meno starts
//! (docs/ARCHITECTURE.md, *The window*): its frame, and whether it was
//! maximized or full screen - never minimized - in `window-state.json` in
//! Meno's data folder, not in the settings. Restored before the window is
//! first shown (the config makes it hidden; `restore` shows it), so it never
//! appears at the default size and moves. Where the frame it was left at is
//! not mostly on a monitor there is now - one unplugged, a resolution or a
//! scale changed - it is brought onto the nearest, its title bar always
//! within reach, or centred at the default size where there is none.
//!
//! Tauri's own window API only (no crate of its own). Its size is kept in
//! logical pixels, which hold across scale factors; its place in physical
//! pixels, the desktop's own, where the monitors are given.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, WebviewWindow, Window};

/// The window the state is of.
pub const LABEL: &str = "main";
/// The size the window has where nothing was kept or it cannot be taken, in logical pixels (tauri.conf.json's).
const DEFAULT: (f64, f64) = (1024.0, 768.0);
/// The least the window is made (tauri.conf.json's minimum), in logical pixels.
const LEAST: (f64, f64) = (640.0, 480.0);
/// How much of the window must be on a monitor to stay where it was.
const SHARE: f64 = 0.5;
/// The part of the title bar that must be on a monitor, from the window's top, in logical pixels.
const BAR: f64 = 40.0;
/// How long after the last move or resize the state is written, in ms.
const SAVE_AFTER_MS: u64 = 600;

/// A frame, in physical pixels of the desktop.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// What is kept.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct State {
    /// The window's place, in physical pixels of the desktop, and its size in logical pixels, as it was not maximized.
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
    /// The scale of the monitor it was on, as it was kept.
    pub scale: f64,
    pub maximized: bool,
    pub fullscreen: bool,
}

/// Where the window goes.
#[derive(Debug, PartialEq)]
pub enum Placement {
    /// At this frame, in physical pixels.
    At(Rect),
    /// Centred, at this size in logical pixels, on the primary monitor.
    Centred { width: f64, height: f64 },
}

fn area(r: &Rect) -> i64 {
    r.w.max(0) as i64 * r.h.max(0) as i64
}

fn overlap(a: &Rect, b: &Rect) -> i64 {
    let w = (a.x + a.w).min(b.x + b.w) - a.x.max(b.x);
    let h = (a.y + a.h).min(b.y + b.h) - a.y.max(b.y);
    if w <= 0 || h <= 0 { 0 } else { w as i64 * h as i64 }
}

/// A monitor as the placing sees it: its frame in physical pixels, its scale.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Screen {
    pub frame: Rect,
    pub scale: f64,
}

/**
 * Where a window kept as `saved` goes among `screens` (the primary one
 * first). On a monitor as it was, mostly: as it was. Else onto the one it
 * overlaps most - or, where it overlaps none, the nearest to its middle -
 * brought within it; where there is none, centred. Its size is its logical
 * size at the scale of the monitor it goes to, never larger than that
 * monitor, never smaller than the least.
 */
pub fn place(saved: &State, screens: &[Screen]) -> Placement {
    let default = Placement::Centred { width: DEFAULT.0, height: DEFAULT.1 };
    if screens.is_empty() || !(saved.width > 0.0 && saved.height > 0.0) || !saved.scale.is_finite() || saved.scale <= 0.0 {
        return default;
    }
    // (its frame as it was kept: its logical size at the scale it was on)
    let kept = Rect { x: saved.x, y: saved.y, w: (saved.width * saved.scale).round() as i32, h: (saved.height * saved.scale).round() as i32 };
    // the monitor it is most on, else the nearest to its middle
    let by_overlap = screens.iter().max_by_key(|s| overlap(&kept, &s.frame)).filter(|s| overlap(&kept, &s.frame) > 0);
    let centre = (kept.x as i64 + kept.w as i64 / 2, kept.y as i64 + kept.h as i64 / 2);
    let on = by_overlap.unwrap_or_else(|| {
        screens
            .iter()
            .min_by_key(|s| {
                let c = (s.frame.x as i64 + s.frame.w as i64 / 2, s.frame.y as i64 + s.frame.h as i64 / 2);
                (c.0 - centre.0).pow(2) + (c.1 - centre.1).pow(2)
            })
            .expect("screens is not empty")
    });
    // its size there: its logical size at this monitor's scale, within the monitor and not under the least
    let w = ((saved.width * on.scale).round() as i32).min(on.frame.w).max(((LEAST.0 * on.scale).round() as i32).min(on.frame.w));
    let h = ((saved.height * on.scale).round() as i32).min(on.frame.h).max(((LEAST.1 * on.scale).round() as i32).min(on.frame.h));
    let shown = Rect { x: kept.x, y: kept.y, w, h };
    // (mostly on the monitor, and its title bar on it: as it was)
    let bar = (BAR * on.scale).round() as i64;
    let top_on = shown.y >= on.frame.y && (shown.y as i64) + bar <= (on.frame.y as i64) + on.frame.h as i64;
    if by_overlap.is_some() && overlap(&shown, &on.frame) as f64 >= SHARE * area(&shown) as f64 && top_on {
        return Placement::At(shown);
    }
    // brought within the monitor, the title bar reachable
    let x = shown.x.clamp(on.frame.x, (on.frame.x + on.frame.w - w).max(on.frame.x));
    let y = shown.y.clamp(on.frame.y, (on.frame.y + on.frame.h - h).max(on.frame.y));
    Placement::At(Rect { x, y, w, h })
}

/// The file the state is kept in.
fn file(data: &Path) -> PathBuf {
    data.join("window-state.json")
}

/// What is kept in `data`, or none: a file that is not there, or does not read.
pub fn load(data: &Path) -> Option<State> {
    let text = std::fs::read_to_string(file(data)).ok()?;
    let s: State = serde_json::from_str(&text).ok()?;
    (s.width.is_finite() && s.height.is_finite() && s.scale.is_finite()).then_some(s)
}

/// The state kept, whole or not at all: written beside and put in its place.
pub fn save(data: &Path, state: &State) -> std::io::Result<()> {
    std::fs::create_dir_all(data)?;
    let tmp = data.join("window-state.json.part");
    std::fs::write(&tmp, serde_json::to_string(state).map_err(std::io::Error::other)?)?;
    std::fs::rename(&tmp, file(data))
}

/// The monitors there are, the primary one first.
fn screens(w: &WebviewWindow) -> Vec<Screen> {
    let mut out = Vec::new();
    let primary = w.primary_monitor().ok().flatten();
    for m in w.available_monitors().unwrap_or_default() {
        let (p, s) = (m.position(), m.size());
        let screen = Screen { frame: Rect { x: p.x, y: p.y, w: s.width as i32, h: s.height as i32 }, scale: m.scale_factor() };
        let is_primary = primary.as_ref().is_some_and(|q| q.position() == m.position() && q.size() == m.size());
        if is_primary { out.insert(0, screen) } else { out.push(screen) }
    }
    out
}

/// The window put where it was left, then shown: before it is first seen, so that it does not appear and move.
pub fn restore(w: &WebviewWindow, data: Option<&Path>) {
    let saved = data.and_then(load);
    match saved.as_ref().map(|s| (place(s, &screens(w)), s)) {
        Some((Placement::At(r), s)) => {
            let _ = w.set_size(tauri::PhysicalSize::new(r.w as u32, r.h as u32));
            let _ = w.set_position(tauri::PhysicalPosition::new(r.x, r.y));
            if s.maximized {
                let _ = w.maximize();
            }
            if s.fullscreen {
                let _ = w.set_fullscreen(true);
            }
        }
        Some((Placement::Centred { width, height }, _)) => {
            let _ = w.set_size(tauri::LogicalSize::new(width, height));
            let _ = w.center();
        }
        None => {}
    }
    let _ = w.show();
}

/// What is kept, and the last of the events that asked to write it.
#[derive(Default)]
pub struct Kept {
    state: Mutex<Option<State>>,
    turn: AtomicU64,
}

/// The window's state now, its frame kept from before where it is maximized, full screen or minimized.
fn snapshot(w: &Window, before: Option<State>) -> Option<State> {
    let mut s = before.unwrap_or_else(|| State { width: DEFAULT.0, height: DEFAULT.1, scale: 1.0, ..State::default() });
    if w.is_minimized().unwrap_or(false) {
        return None;
    }
    s.maximized = w.is_maximized().unwrap_or(false);
    s.fullscreen = w.is_fullscreen().unwrap_or(false);
    if !s.maximized && !s.fullscreen {
        let (p, size, scale) = (w.outer_position().ok()?, w.outer_size().ok()?, w.scale_factor().ok()?);
        if size.width == 0 || size.height == 0 || scale <= 0.0 {
            return None;
        }
        s.x = p.x;
        s.y = p.y;
        s.width = size.width as f64 / scale;
        s.height = size.height as f64 / scale;
        s.scale = scale;
    }
    Some(s)
}

fn write(w: &Window, data: &Path) {
    let kept = w.app_handle().state::<Kept>();
    let before = kept.state.lock().ok().and_then(|s| s.clone()).or_else(|| load(data));
    if let Some(s) = snapshot(w, before) {
        if let Ok(mut held) = kept.state.lock() {
            *held = Some(s.clone());
        }
        let _ = save(data, &s);
    }
}

/// A window event of the main window: its move or resize writes the state a moment after the last of them; its closing, at once.
pub fn on_event(w: &Window, event: &tauri::WindowEvent) {
    if w.label() != LABEL {
        return;
    }
    let Ok(data) = w.app_handle().path().app_data_dir() else { return };
    match event {
        tauri::WindowEvent::CloseRequested { .. } => write(w, &data),
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            let kept = w.app_handle().state::<Kept>();
            let turn = kept.turn.fetch_add(1, Ordering::SeqCst) + 1;
            let w = w.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(SAVE_AFTER_MS));
                if w.app_handle().state::<Kept>().turn.load(Ordering::SeqCst) == turn {
                    write(&w, &data);
                }
            });
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: Screen = Screen { frame: Rect { x: 0, y: 0, w: 1920, h: 1080 }, scale: 1.0 };
    const RIGHT: Screen = Screen { frame: Rect { x: 1920, y: 0, w: 2560, h: 1440 }, scale: 1.0 };
    const RETINA: Screen = Screen { frame: Rect { x: 0, y: 0, w: 2880, h: 1800 }, scale: 2.0 };

    fn saved(x: i32, y: i32, w: f64, h: f64, scale: f64) -> State {
        State { x, y, width: w, height: h, scale, maximized: false, fullscreen: false }
    }

    #[test]
    fn a_window_on_a_monitor_is_where_it_was() {
        let s = saved(100, 80, 1200.0, 800.0, 1.0);
        assert_eq!(place(&s, &[ONE]), Placement::At(Rect { x: 100, y: 80, w: 1200, h: 800 }));
    }

    #[test]
    fn a_window_partly_off_is_brought_within_its_monitor() {
        // (little of it on the monitor: brought in)
        let mostly = saved(1500, 100, 1200.0, 800.0, 1.0);
        assert_eq!(place(&mostly, &[ONE]), Placement::At(Rect { x: 720, y: 100, w: 1200, h: 800 }));
        let barely = saved(1800, 100, 1200.0, 800.0, 1.0);
        assert_eq!(place(&barely, &[ONE]), Placement::At(Rect { x: 720, y: 100, w: 1200, h: 800 }));
    }

    #[test]
    fn a_window_off_every_monitor_goes_to_the_nearest() {
        // (left on a monitor to the right that is gone: the one there is is the nearest)
        let gone = saved(2600, 200, 1200.0, 800.0, 1.0);
        assert_eq!(place(&gone, &[ONE]), Placement::At(Rect { x: 720, y: 200, w: 1200, h: 800 }));
        // (above the monitor, its title bar out of reach: brought down)
        let up = saved(100, -500, 800.0, 600.0, 1.0);
        assert_eq!(place(&up, &[ONE]), Placement::At(Rect { x: 100, y: 0, w: 800, h: 600 }));
    }

    #[test]
    fn a_window_with_its_title_bar_below_the_monitor_is_brought_up() {
        let down = saved(100, 1070, 800.0, 600.0, 1.0);
        let Placement::At(r) = place(&down, &[ONE]) else { panic!("placed") };
        assert!(r.y + 40 <= 1080, "its title bar on the monitor: {r:?}");
    }

    #[test]
    fn the_size_follows_the_scale_of_the_monitor_it_goes_to() {
        // (kept at 1.0, now a monitor of 2.0: the same logical size, twice the pixels)
        let s = saved(100, 100, 1000.0, 700.0, 1.0);
        assert_eq!(place(&s, &[RETINA]), Placement::At(Rect { x: 100, y: 100, w: 2000, h: 1400 }));
        // (kept at 2.0, now on a monitor of 1.0: the same logical size)
        let t = saved(100, 100, 1000.0, 700.0, 2.0);
        assert_eq!(place(&t, &[ONE]), Placement::At(Rect { x: 100, y: 100, w: 1000, h: 700 }));
    }

    #[test]
    fn a_window_larger_than_its_monitor_is_made_to_fit_it_and_not_under_the_least() {
        let big = saved(0, 0, 4000.0, 3000.0, 1.0);
        assert_eq!(place(&big, &[ONE]), Placement::At(Rect { x: 0, y: 0, w: 1920, h: 1080 }));
        let small = saved(10, 10, 100.0, 100.0, 1.0);
        let Placement::At(r) = place(&small, &[ONE]) else { panic!("placed") };
        assert_eq!((r.w, r.h), (640, 480));
    }

    #[test]
    fn a_monitor_gone_and_a_second_one_there_goes_to_the_one_it_was_most_on() {
        // (kept on the second monitor, which is there: where it was)
        let s = saved(2200, 100, 1200.0, 800.0, 1.0);
        assert_eq!(place(&s, &[ONE, RIGHT]), Placement::At(Rect { x: 2200, y: 100, w: 1200, h: 800 }));
        // (the second gone: the first is the nearest)
        let Placement::At(r) = place(&s, &[ONE]) else { panic!("placed") };
        assert!(r.x + r.w <= 1920 && r.x >= 0);
    }

    #[test]
    fn nothing_kept_or_no_monitor_or_nonsense_is_centred_at_the_default_size() {
        assert_eq!(place(&saved(0, 0, 0.0, 0.0, 1.0), &[ONE]), Placement::Centred { width: 1024.0, height: 768.0 });
        assert_eq!(place(&saved(0, 0, 800.0, 600.0, 1.0), &[]), Placement::Centred { width: 1024.0, height: 768.0 });
        assert_eq!(place(&saved(0, 0, 800.0, 600.0, f64::NAN), &[ONE]), Placement::Centred { width: 1024.0, height: 768.0 });
    }

    #[test]
    fn the_state_is_written_whole_and_read_back_and_a_bad_file_is_none() {
        let dir = std::env::temp_dir().join(format!("meno-window-{}", uuid::Uuid::new_v4()));
        assert!(load(&dir).is_none());
        let s = State { x: -20, y: 30, width: 1111.5, height: 777.0, scale: 1.25, maximized: true, fullscreen: false };
        save(&dir, &s).unwrap();
        assert_eq!(load(&dir), Some(s));
        std::fs::write(dir.join("window-state.json"), "{ not json").unwrap();
        assert!(load(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
