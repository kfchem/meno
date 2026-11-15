//! The app menu's Edit > Undo and Redo, on macOS. Tauri's own items send the
//! system's `undo:` to the web view, which undoes only what the web view
//! itself edits - a text field - and nothing of the workspace, which keeps its
//! history in the page (Cmd+Z and Cmd+Shift+Z reach it as keys). So the two
//! items are Meno's: choosing one tells the page (`edit-menu`, "undo" or
//! "redo"), which does what the key does (src/lib/doc/editMenu.ts), and the
//! page tells the menu which of them has anything to do (`edit_menu_state`),
//! the other greyed. Every other item is Tauri's default menu as it is.
//!
//! Windows and Linux show no app menu: there is nothing here for them, and
//! the command only accepts what the page tells it.

use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuItem, MenuItemBuilder, MenuItemKind},
    Emitter, Manager,
};

/// The id of the Undo item, and of the Redo item.
#[cfg(any(target_os = "macos", test))]
pub const UNDO_ID: &str = "meno-edit-undo";
#[cfg(any(target_os = "macos", test))]
pub const REDO_ID: &str = "meno-edit-redo";

/// The command an item of this menu id is, as the page is told it: none for any other item.
#[cfg(any(target_os = "macos", test))]
pub fn command_of(id: &str) -> Option<&'static str> {
    match id {
        UNDO_ID => Some("undo"),
        REDO_ID => Some("redo"),
        _ => None,
    }
}

/// The two items, kept to be told which can do anything.
#[cfg(target_os = "macos")]
pub struct EditItems {
    undo: MenuItem<tauri::Wry>,
    redo: MenuItem<tauri::Wry>,
}

/// Tauri's default menu, its Edit menu's Undo and Redo taken out for Meno's (at the same places, with the same keys). Left as Tauri has it where the Edit menu is not as it is expected.
#[cfg(target_os = "macos")]
pub fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(app)?;
    for kind in menu.items()? {
        let MenuItemKind::Submenu(edit) = kind else { continue };
        if edit.text()? != "Edit" {
            continue;
        }
        let items = edit.items()?;
        let is = |at: usize, text: &str| matches!(items.get(at), Some(MenuItemKind::Predefined(p)) if p.text().is_ok_and(|t| t == text));
        if !(is(0, "Undo") && is(1, "Redo")) {
            break;
        }
        let undo = MenuItemBuilder::with_id(UNDO_ID, "Undo").accelerator("CmdOrCtrl+Z").build(app)?;
        let redo = MenuItemBuilder::with_id(REDO_ID, "Redo").accelerator("CmdOrCtrl+Shift+Z").build(app)?;
        edit.remove(&items[0])?;
        edit.remove(&items[1])?;
        edit.insert(&undo, 0)?;
        edit.insert(&redo, 1)?;
        app.manage(EditItems { undo, redo });
        break;
    }
    Ok(menu)
}

/// A chosen item of the menu told to the page, if it is Undo or Redo.
#[cfg(target_os = "macos")]
pub fn chosen(app: &AppHandle, id: &str) {
    if let Some(command) = command_of(id) {
        let _ = app.emit_to("main", "edit-menu", command);
    }
}

/// Which of Undo and Redo can do anything, as the page says: the other is greyed. No menu of this kind (not macOS, or Tauri's menu was not as expected): nothing to do.
#[tauri::command]
pub fn edit_menu_state(app: AppHandle, undo: bool, redo: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if let Some(items) = app.try_state::<EditItems>() {
        items.undo.set_enabled(undo).map_err(|e| e.to_string())?;
        items.redo.set_enabled(redo).map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (&app, undo, redo);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_two_items_commands_and_no_other() {
        assert_eq!(command_of(UNDO_ID), Some("undo"));
        assert_eq!(command_of(REDO_ID), Some("redo"));
        assert_eq!(command_of("meno-edit-cut"), None);
        assert_eq!(command_of(""), None);
        assert_ne!(UNDO_ID, REDO_ID);
    }
}
