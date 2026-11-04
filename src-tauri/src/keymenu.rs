//! Alt let go on its own, on Windows, kept from the window's menu. Alt is
//! one of the drawing's keys - a click with it held draws a bond - and let
//! go with nothing between, Windows took it as the keyboard's way into the
//! window's menu: no menu was drawn, the next key went to it, and the page
//! answered nothing until Esc or Alt again.
//!
//! So the window does not pass on the menu command the keyboard sends by
//! itself - `WM_SYSCOMMAND`, `SC_KEYMENU` with no key given: Alt let go
//! alone (F10 sends the same). Alt+Space, which gives its key and opens the
//! window's menu, the menu opened by the mouse (`SC_MOUSEMENU`) and Alt+F4
//! (`SC_CLOSE`) are passed on as before.

use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{SC_KEYMENU, WM_SYSCOMMAND};

/// This module's subclass of the window, among any others it has.
const SUBCLASS: usize = 0x4d65_6e6f;

/// Keeps Alt let go alone from the main window's menu.
pub fn start(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    // (Tauri's handle is of the windows crate Tauri is built on: the same window, as a pointer - drop.rs)
    let Ok(hwnd) = window.hwnd() else { return };
    // SAFETY: the main window, of this thread, there as long as the app is;
    // the procedure keeps no data of its own.
    unsafe {
        let _ = SetWindowSubclass(HWND(hwnd.0), Some(window_proc), SUBCLASS, 0);
    }
}

/// Whether a message is the keyboard's own way into the window's menu: no key given with it.
fn keyboard_menu(msg: u32, wparam: WPARAM, lparam: LPARAM) -> bool {
    // (the low four bits of the command are Windows' own)
    msg == WM_SYSCOMMAND && (wparam.0 & 0xFFF0) == SC_KEYMENU as usize && lparam.0 == 0
}

unsafe extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
    if keyboard_menu(msg, wparam, lparam) {
        return LRESULT(0);
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::UI::WindowsAndMessaging::{SC_CLOSE, SC_MOUSEMENU, WM_SYSKEYUP};

    #[test]
    fn keeps_alt_alone_from_the_menu_and_passes_on_the_rest() {
        // Alt let go alone (and F10): no key
        assert!(keyboard_menu(WM_SYSCOMMAND, WPARAM(SC_KEYMENU as usize), LPARAM(0)));
        // (Windows' own low bits set)
        assert!(keyboard_menu(WM_SYSCOMMAND, WPARAM(SC_KEYMENU as usize | 0x3), LPARAM(0)));
        // Alt+Space: the window's menu, its key given
        assert!(!keyboard_menu(WM_SYSCOMMAND, WPARAM(SC_KEYMENU as usize), LPARAM(' ' as isize)));
        // the menu by the mouse, Alt+F4, and the key's own message
        assert!(!keyboard_menu(WM_SYSCOMMAND, WPARAM(SC_MOUSEMENU as usize), LPARAM(0)));
        assert!(!keyboard_menu(WM_SYSCOMMAND, WPARAM(SC_CLOSE as usize), LPARAM(0)));
        assert!(!keyboard_menu(WM_SYSKEYUP, WPARAM(SC_KEYMENU as usize), LPARAM(0)));
    }
}
