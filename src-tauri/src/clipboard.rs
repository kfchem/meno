//! The system clipboard, with the kinds of data a structure travels in -
//! Meno's own, a MOL file, plain text, and the pictures Office takes - under
//! the names each platform and the programs on it know them by. The
//! webview's own clipboard reaches plain text only.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

/// One kind of data, as the page names it: text, or bytes as base64.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ClipItem {
    pub flavor: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base64: Option<String>,
}

/// What goes on the clipboard under one name.
pub enum Payload<'a> {
    Text(&'a str),
    Bytes(Vec<u8>),
}

/// Kinds that are bytes, not text: pictures, and an object Office holds.
fn is_binary(flavor: &str) -> bool {
    matches!(flavor, "gvml" | "png" | "jpeg" | "emf" | "dib" | "object")
}

/// The kinds a copy may put on the clipboard (`object` is only ever read).
const WRITTEN: [&str; 8] = ["meno", "mol", "rxn", "text", "gvml", "emf", "png", "dib"];

/// What the page's kinds are called on this platform, most preferred first.
/// A kind the platform has no name for is left out.
///
/// `gvml` is Office's own clip format: a zip whose picture Word and
/// PowerPoint keep byte for byte, on either system, and hand back when the
/// picture is copied - where a structure carried in it survives.
fn names(flavor: &str) -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        match flavor {
            "meno" => &["com.kfchem.meno.structure"],
            "mol" => &["chemical/x-mdl-molfile"],
            // a reaction, as an RXN file
            "rxn" => &["chemical/x-mdl-rxnfile"],
            "text" => &["public.utf8-plain-text"],
            "gvml" => &["com.microsoft.Art--GVML-ClipFormat"],
            "png" => &["public.png"],
            // a photograph, as a browser may copy one (only ever read)
            "jpeg" => &["public.jpeg"],
            // an object copied in Word or PowerPoint for Mac: its storage, as
            // a compound file (read by the page: src/lib/binary/cfb.ts)
            "object" => &["com.microsoft.Embedded-Object"],
            _ => &[],
        }
    }
    #[cfg(target_os = "windows")]
    {
        match flavor {
            "meno" => &["Meno Structure"],
            // MDLCT is what the chemistry programs on Windows exchange
            "mol" => &["MDLCT", "chemical/x-mdl-molfile"],
            "rxn" => &["chemical/x-mdl-rxnfile"],
            "text" => &["CF_UNICODETEXT"],
            "gvml" => &["Art::GVML ClipFormat"],
            "png" => &["PNG"],
            "jpeg" => &["JFIF"],
            "emf" => &["CF_ENHMETAFILE"],
            "dib" => &["CF_DIB"],
            _ => &[],
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = flavor;
        &[]
    }
}

/// A MOL file as MDLCT has it: each line after a byte giving its length,
/// with no line ends. (Windows only; tested everywhere.)
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn to_mdlct(mol: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(mol.len() + 64);
    for line in mol.trim_end_matches(['\r', '\n']).split('\n') {
        let line = line.trim_end_matches('\r').as_bytes();
        let line = &line[..line.len().min(255)];
        out.push(line.len() as u8);
        out.extend_from_slice(line);
    }
    out
}

/// A MOL file out of MDLCT; None if the bytes do not read as it.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn from_mdlct(bytes: &[u8]) -> Option<String> {
    let mut lines = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let n = bytes[i] as usize;
        let line = bytes.get(i + 1..i + 1 + n)?;
        lines.push(String::from_utf8_lossy(line).into_owned());
        i += 1 + n;
    }
    let mol = lines.join("\n") + "\n";
    mol.contains("M  END").then_some(mol)
}

/// Puts `items` on the clipboard, in place of whatever was there.
#[tauri::command]
pub fn clipboard_write(items: Vec<ClipItem>) -> Result<(), String> {
    let mut entries: Vec<(&'static str, Payload)> = Vec::new();
    for item in &items {
        for name in names(&item.flavor) {
            let payload = match (&item.text, &item.base64) {
                (_, Some(b64)) => Payload::Bytes(STANDARD.decode(b64).map_err(|e| e.to_string())?),
                (Some(text), None) => Payload::Text(text),
                (None, None) => return Err(format!("nothing given for {}", item.flavor)),
            };
            entries.push((name, payload));
        }
    }
    #[cfg(target_os = "windows")]
    embed(&items, &mut entries);
    platform::write(&entries)
}

/// An object for Office to embed, ahead of the pictures, made from the
/// record (the "embed" kind) and the EMF beside it - when Meno is registered
/// to serve one, as Office could do nothing with it otherwise. If it cannot
/// be made, the pictures go without it.
///
/// With the object, Office's clip format and the PNG are left out: Word
/// pastes a PNG, and PowerPoint the clip format, in preference to an object,
/// where a plain paste should give the object - as a copy between Word and
/// PowerPoint does, which carries neither. The EMF and the bitmap stay, for
/// Windows' other programs.
#[cfg(target_os = "windows")]
fn embed(items: &[ClipItem], entries: &mut Vec<(&'static str, Payload)>) {
    let Some(record) = items.iter().find(|i| i.flavor == "embed").and_then(|i| i.text.as_deref()) else {
        return;
    };
    let emf = entries.iter().find_map(|(name, payload)| match (*name, payload) {
        ("CF_ENHMETAFILE", Payload::Bytes(bytes)) => Some(bytes.clone()),
        _ => None,
    });
    let Some(emf) = emf.filter(|_| crate::ole::is_registered()) else {
        return;
    };
    match crate::ole::embed_source(record, &emf) {
        Ok(source) => {
            let at = entries.iter().position(|(n, _)| *n == "Art::GVML ClipFormat").unwrap_or(entries.len());
            let descriptor = crate::ole::object_descriptor(&emf);
            entries.splice(at..at, [("Embed Source", Payload::Bytes(source)), ("Object Descriptor", Payload::Bytes(descriptor))]);
            entries.retain(|(name, _)| !matches!(*name, "Art::GVML ClipFormat" | "PNG"));
        }
        Err(e) => eprintln!("{e}"),
    }
}

/// Meno's record out of an object Office has put on the clipboard - its own
/// copy of one it holds ("Embedded Object"), or Meno's ("Embed Source").
#[cfg(target_os = "windows")]
fn embedded_record() -> Result<Option<String>, String> {
    for name in ["Embedded Object", "Embed Source"] {
        if let Some(record) = platform::read(Board::Clipboard, name)?.and_then(|bytes| crate::ole::record_in_object(&bytes)) {
            return Ok(Some(record));
        }
    }
    Ok(None)
}

/// The kinds a copy on this platform may put on the clipboard, so that the
/// page makes no others: a Windows bitmap on a Mac, or an object for Office
/// where Meno serves none.
#[tauri::command]
pub fn clipboard_takes() -> Vec<String> {
    #[allow(unused_mut)]
    let mut takes: Vec<String> = WRITTEN.iter().filter(|f| !names(f).is_empty()).map(|f| f.to_string()).collect();
    #[cfg(target_os = "windows")]
    if crate::ole::is_registered() {
        takes.push("embed".into());
    }
    takes
}

/// A clipboard format's number, and what its bytes hold as Meno reads them
/// (text as UTF-8): the same for a drag's data as for the clipboard's.
#[cfg(target_os = "windows")]
pub(crate) use platform::{format as clip_format, held};

/// Where data is read from: the clipboard, or what is being dragged.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Board {
    Clipboard,
    Drag,
}

/// The files on the clipboard, copied in the Finder or Explorer, in order:
/// those that are files, not folders.
fn clipboard_files() -> Vec<std::path::PathBuf> {
    platform::files_on(Board::Clipboard).into_iter().filter(|p| p.is_file()).collect()
}

/// The workspace files the clipboard holds, or what was just dropped on the
/// page (`board`: "clipboard" or "drag") - copied or dragged in the Finder
/// or Explorer - opened as a workspace file opened from the system is
/// (opened.rs): the page let read and write each, so that saving it writes
/// it back, and told. How many there were. A drop on Windows names none:
/// the webview keeps a dropped file's path from Meno.
#[tauri::command]
pub fn open_workspaces_from(app: tauri::AppHandle, board: String) -> usize {
    let board = if board == "drag" { Board::Drag } else { Board::Clipboard };
    let paths: Vec<String> = platform::files_on(board)
        .into_iter()
        .filter(|p| crate::opened::is_workspace(p))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    let n = paths.len();
    crate::opened::open(&app, paths);
    n
}

/// The names of the files on the clipboard - copied in the Finder or
/// Explorer - in order; none, where it holds none.
#[tauri::command]
pub fn clipboard_file_names() -> Vec<String> {
    clipboard_files()
        .iter()
        .map(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default())
        .collect()
}

/// The bytes of the `index`th file on the clipboard now, as
/// `clipboard_file_names` named it. Only a file the clipboard holds is read:
/// the page names no path.
#[tauri::command]
pub async fn clipboard_file(index: usize) -> Result<tauri::ipc::Response, String> {
    let files = clipboard_files();
    let path = files.get(index).ok_or("that file is no longer on the clipboard")?;
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// The first of `flavors` the clipboard holds: its text, or its bytes as base64.
#[tauri::command]
pub fn clipboard_read(flavors: Vec<String>) -> Result<Option<ClipItem>, String> {
    read_from(Board::Clipboard, &flavors)
}

/// The first of `flavors` in what was just dropped on the page - a picture
/// or an object dragged out of Word or PowerPoint, say - as `clipboard_read`
/// reads the clipboard. On a Mac it is the drag pasteboard, which keeps what
/// was dragged after the drop; on Windows, what Meno's own window over the
/// page read of the drag (drop.rs) - files and text the webview reads.
#[tauri::command]
pub fn drag_read(flavors: Vec<String>) -> Result<Option<ClipItem>, String> {
    read_from(Board::Drag, &flavors)
}

fn read_from(board: Board, flavors: &[String]) -> Result<Option<ClipItem>, String> {
    for flavor in flavors {
        #[cfg(target_os = "windows")]
        if flavor == "embed" {
            let record = match board {
                Board::Clipboard => embedded_record()?,
                Board::Drag => crate::drop::dragged_record(),
            };
            if let Some(text) = record {
                return Ok(Some(ClipItem { flavor: flavor.clone(), text: Some(text), base64: None }));
            }
        }
        for name in names(flavor) {
            if let Some(bytes) = platform::read(board, name)? {
                let (text, base64) = if is_binary(flavor) {
                    (None, Some(STANDARD.encode(&bytes)))
                } else {
                    (Some(String::from_utf8_lossy(&bytes).into_owned()), None)
                };
                return Ok(Some(ClipItem { flavor: flavor.clone(), text, base64 }));
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{Board, Payload};
    use objc2_app_kit::{NSPasteboard, NSPasteboardNameDrag};
    use objc2_foundation::{NSArray, NSData, NSString, NSURL};

    pub fn write(entries: &[(&str, Payload)]) -> Result<(), String> {
        let names: Vec<_> = entries.iter().map(|(n, _)| NSString::from_str(n)).collect();
        // SAFETY: the general pasteboard may be used from any thread, and
        // every object passed is a live one of the type asked for.
        unsafe {
            let pb = NSPasteboard::generalPasteboard();
            pb.clearContents();
            pb.declareTypes_owner(&NSArray::from_retained_slice(&names), None);
            for ((_, payload), name) in entries.iter().zip(&names) {
                let data = match payload {
                    Payload::Text(text) => NSData::with_bytes(text.as_bytes()),
                    Payload::Bytes(bytes) => NSData::with_bytes(bytes),
                };
                if !pb.setData_forType(Some(&data), name) {
                    return Err(format!("the clipboard would not take {name}"));
                }
            }
        }
        Ok(())
    }

    /// The files on the clipboard, copied in the Finder, or on the drag
    /// pasteboard, dragged from it: each item's file URL - a file reference
    /// URL, as the Finder gives it, read as its path.
    pub fn files_on(board: Board) -> Vec<std::path::PathBuf> {
        // SAFETY: the drag pasteboard is a pasteboard like the general one, named by AppKit.
        let pb = match board {
            Board::Clipboard => NSPasteboard::generalPasteboard(),
            Board::Drag => unsafe { NSPasteboard::pasteboardWithName(NSPasteboardNameDrag) },
        };
        let Some(items) = pb.pasteboardItems() else { return Vec::new() };
        let kind = NSString::from_str("public.file-url");
        items
            .to_vec()
            .iter()
            .filter_map(|item| {
                let written = item.stringForType(&kind)?;
                let url = NSURL::URLWithString(&written)?;
                if !url.isFileURL() {
                    return None;
                }
                Some(std::path::PathBuf::from(url.path()?.to_string()))
            })
            .collect()
    }

    /// What is on the clipboard, or being dragged, under `name`, as it is there.
    pub fn read(board: Board, name: &str) -> Result<Option<Vec<u8>>, String> {
        // SAFETY: as for `write`; the drag pasteboard is a pasteboard like
        // the general one, named by AppKit.
        let data = unsafe {
            let pb = match board {
                Board::Clipboard => NSPasteboard::generalPasteboard(),
                Board::Drag => NSPasteboard::pasteboardWithName(NSPasteboardNameDrag),
            };
            pb.dataForType(&NSString::from_str(name))
        };
        Ok(data.map(|d| d.to_vec()))
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{from_mdlct, to_mdlct, Board, Payload};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{GlobalFree, HANDLE};
    use windows_sys::Win32::Graphics::Gdi::{DeleteEnhMetaFile, SetEnhMetaFileBits};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Ole::{CF_DIB, CF_ENHMETAFILE, CF_UNICODETEXT};

    /// The clipboard, open until this is dropped. Another program may hold
    /// it for a moment, so opening it is tried a few times.
    struct Open;
    impl Open {
        fn new() -> Result<Self, String> {
            for _ in 0..10 {
                // SAFETY: no window owns what is put on it.
                if unsafe { OpenClipboard(null_mut()) } != 0 {
                    return Ok(Open);
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err("the clipboard is in use by another program".into())
        }
    }
    impl Drop for Open {
        fn drop(&mut self) {
            // SAFETY: opened by `new`.
            unsafe { CloseClipboard() };
        }
    }

    pub fn format(name: &str) -> u32 {
        match name {
            "CF_UNICODETEXT" => CF_UNICODETEXT as u32,
            "CF_ENHMETAFILE" => CF_ENHMETAFILE as u32,
            "CF_DIB" => CF_DIB as u32,
            _ => {
                let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
                // SAFETY: a NUL-terminated wide string.
                unsafe { RegisterClipboardFormatW(wide.as_ptr()) }
            }
        }
    }

    /// The bytes a kind is kept in on the clipboard.
    fn stored(name: &str, payload: &Payload) -> Vec<u8> {
        match payload {
            Payload::Bytes(bytes) => bytes.clone(),
            Payload::Text(text) => match name {
                "CF_UNICODETEXT" => text.encode_utf16().chain(Some(0)).flat_map(u16::to_le_bytes).collect(),
                "MDLCT" => to_mdlct(text),
                _ => text.bytes().chain(Some(0)).collect(),
            },
        }
    }

    /// What a kind's bytes on the clipboard hold: text as UTF-8, pictures as they are.
    pub fn held(name: &str, bytes: &[u8]) -> Option<Vec<u8>> {
        match name {
            "CF_UNICODETEXT" => {
                let wide: Vec<u16> = bytes.as_chunks().0.iter().map(|&c| u16::from_le_bytes(c)).collect();
                let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
                Some(String::from_utf16_lossy(&wide[..end]).into_bytes())
            }
            "MDLCT" => from_mdlct(bytes).map(String::into_bytes),
            "Meno Structure" | "chemical/x-mdl-molfile" | "chemical/x-mdl-rxnfile" => {
                let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
                Some(bytes[..end].to_vec())
            }
            _ => Some(bytes.to_vec()),
        }
    }

    pub fn write(entries: &[(&str, Payload)]) -> Result<(), String> {
        // An object for Office goes through OLE's own clipboard (ole.rs),
        // which hands it over as the storage it is, as OLE servers do.
        if entries.iter().any(|(name, _)| *name == "Embed Source") {
            use crate::ole::ClipData;
            let items = entries
                .iter()
                .map(|(name, payload)| {
                    let data = stored(name, payload);
                    let data = match *name {
                        "CF_ENHMETAFILE" => ClipData::Emf(data),
                        "Embed Source" => ClipData::Storage(data),
                        _ => ClipData::Bytes(data),
                    };
                    (format(name) as u16, data)
                })
                .collect();
            return crate::ole::set_clipboard(items);
        }
        let _open = Open::new()?;
        // SAFETY: the clipboard is open; each block is allocated movable,
        // filled while locked, and the clipboard owns it once taken - as it
        // does an enhanced metafile's handle.
        unsafe {
            if EmptyClipboard() == 0 {
                return Err("the clipboard could not be emptied".into());
            }
            for (name, payload) in entries {
                let data = stored(name, payload);
                if *name == "CF_ENHMETAFILE" {
                    let emf = SetEnhMetaFileBits(data.len() as u32, data.as_ptr());
                    if emf.is_null() {
                        return Err("the picture is not an enhanced metafile Windows reads".into());
                    }
                    if SetClipboardData(format(name), emf as HANDLE).is_null() {
                        DeleteEnhMetaFile(emf);
                        return Err("the clipboard would not take the picture".into());
                    }
                    continue;
                }
                let block = GlobalAlloc(GMEM_MOVEABLE, data.len().max(1));
                if block.is_null() {
                    return Err("out of memory for the clipboard".into());
                }
                let at = GlobalLock(block) as *mut u8;
                if at.is_null() {
                    GlobalFree(block);
                    return Err("out of memory for the clipboard".into());
                }
                std::ptr::copy_nonoverlapping(data.as_ptr(), at, data.len());
                GlobalUnlock(block);
                if SetClipboardData(format(name), block as HANDLE).is_null() {
                    GlobalFree(block);
                    return Err(format!("the clipboard would not take {name}"));
                }
            }
        }
        Ok(())
    }

    /// The files on the clipboard, copied in Explorer: its list of them
    /// (CF_HDROP), each by its path. Of a drop, none: the webview keeps
    /// what is dropped from Meno.
    pub fn files_on(board: Board) -> Vec<std::path::PathBuf> {
        if board == Board::Drag {
            return Vec::new();
        }
        use std::os::windows::ffi::OsStringExt;
        use windows_sys::Win32::System::Ole::CF_HDROP;
        use windows_sys::Win32::UI::Shell::DragQueryFileW;
        // SAFETY: asking needs no open clipboard.
        if unsafe { IsClipboardFormatAvailable(CF_HDROP as u32) } == 0 {
            return Vec::new();
        }
        let Ok(_open) = Open::new() else { return Vec::new() };
        // SAFETY: the clipboard is open, and the list it hands out is read
        // only through DragQueryFileW, each name within the length it gives.
        unsafe {
            let list = GetClipboardData(CF_HDROP as u32);
            if list.is_null() {
                return Vec::new();
            }
            let count = DragQueryFileW(list, u32::MAX, null_mut(), 0);
            (0..count)
                .filter_map(|i| {
                    let len = DragQueryFileW(list, i, null_mut(), 0);
                    if len == 0 {
                        return None;
                    }
                    let mut name = vec![0u16; len as usize + 1];
                    let got = DragQueryFileW(list, i, name.as_mut_ptr(), len + 1);
                    name.truncate(got as usize);
                    Some(std::path::PathBuf::from(std::ffi::OsString::from_wide(&name)))
                })
                .collect()
        }
    }

    /// What is on the clipboard under `name`: text as UTF-8, pictures as they are.
    pub fn read(board: Board, name: &str) -> Result<Option<Vec<u8>>, String> {
        // (what a drag carried, as Meno's own window over the page read it:
        // WebView2 keeps it from the page and from Meno - drop.rs)
        if board == Board::Drag {
            return Ok(crate::drop::dragged(name));
        }
        // (Office hands an enhanced metafile back drawn afresh, without what
        // was carried in it: the picture is read out of its own clip format)
        if name == "CF_ENHMETAFILE" {
            return Ok(None);
        }
        let fmt = format(name);
        // SAFETY: asking needs no open clipboard.
        if unsafe { IsClipboardFormatAvailable(fmt) } == 0 {
            return Ok(None);
        }
        let _open = Open::new()?;
        // SAFETY: the clipboard is open, and the block it hands out is
        // read only while locked, within its size.
        unsafe {
            let block = GetClipboardData(fmt);
            if block.is_null() {
                return Ok(None);
            }
            let at = GlobalLock(block) as *const u8;
            if at.is_null() {
                return Ok(None);
            }
            let data = std::slice::from_raw_parts(at, GlobalSize(block)).to_vec();
            GlobalUnlock(block);
            Ok(held(name, &data))
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::{Board, Payload};
    pub fn write(_: &[(&str, Payload)]) -> Result<(), String> {
        Err("the clipboard is not reached on this platform".into())
    }
    pub fn read(_: Board, _: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(None)
    }
    pub fn files_on(_: Board) -> Vec<std::path::PathBuf> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mdlct_is_each_line_after_its_length() {
        let mol = "\n  Meno\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n";
        let ct = to_mdlct(mol);
        assert_eq!(&ct[..8], &[0, 6, b' ', b' ', b'M', b'e', b'n', b'o']);
        assert!(!ct.contains(&b'\n'));
        assert_eq!(from_mdlct(&ct).as_deref(), Some(mol));
        // not a MOL file
        assert_eq!(from_mdlct(&[3, b'a', b'b']), None);
        assert_eq!(from_mdlct(&to_mdlct("hello\n")), None);
    }

    #[test]
    fn a_kind_has_its_platforms_names() {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            for flavor in ["meno", "mol", "rxn", "text", "gvml", "png", "jpeg"] {
                assert!(!names(flavor).is_empty(), "{flavor}");
            }
        }
        assert!(names("nonsense").is_empty());
        // (a photograph is read, binary, and never written)
        assert!(is_binary("jpeg"));
        assert!(!WRITTEN.contains(&"jpeg"));
    }

    #[test]
    fn a_copy_names_only_the_kinds_this_platform_takes() {
        let takes = clipboard_takes();
        assert!(!takes.iter().any(|f| f == "object"), "an object is only read");
        #[cfg(target_os = "macos")]
        {
            assert_eq!(takes, ["meno", "mol", "rxn", "text", "gvml", "png"]);
            assert_eq!(names("object"), ["com.microsoft.Embedded-Object"]);
        }
        #[cfg(target_os = "windows")]
        assert!(takes.iter().any(|f| f == "emf") && takes.iter().any(|f| f == "dib"));
    }

    #[test]
    fn pictures_travel_as_base64_and_text_as_text() {
        assert!(is_binary("gvml") && is_binary("png") && is_binary("emf") && is_binary("dib"));
        assert!(!is_binary("meno") && !is_binary("mol") && !is_binary("rxn") && !is_binary("text"));
        let item: ClipItem = serde_json::from_str(r#"{"flavor":"png","base64":"iVBO"}"#).unwrap();
        assert_eq!(item.text, None);
        assert_eq!(serde_json::to_string(&ClipItem { flavor: "mol".into(), text: Some("x".into()), base64: None }).unwrap(), r#"{"flavor":"mol","text":"x"}"#);
    }
}
