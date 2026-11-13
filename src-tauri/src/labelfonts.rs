//! The label fonts a copied picture names - IBM Plex Sans, regular, italic,
//! bold and bold italic (lib/chem/emf.ts writes the family, the weight and
//! the slant) - installed for this user, so that Word and PowerPoint draw a
//! structure's labels in them rather than in a font of their own. On
//! Windows the installer has Meno put them in (`--install-label-fonts`) and
//! take them out before it uninstalls (`--remove-label-fonts`); on the Mac
//! Meno puts them in quietly at start. A face of the same file already
//! there is left as it is, and only the faces Meno put there are ever taken
//! out. Nothing is fetched: the faces come with Meno (resources/fonts, OFL).

use std::path::{Path, PathBuf};

/// The four faces a label is set in, by file and by the name Windows lists each under.
pub const FACES: [(&str, &str); 4] = [
    ("IBMPlexSans-Regular.ttf", "IBM Plex Sans (TrueType)"),
    ("IBMPlexSans-Italic.ttf", "IBM Plex Sans Italic (TrueType)"),
    ("IBMPlexSans-Bold.ttf", "IBM Plex Sans Bold (TrueType)"),
    ("IBMPlexSans-BoldItalic.ttf", "IBM Plex Sans Bold Italic (TrueType)"),
];

/// Where Meno carries the faces: its resources' `fonts` folder.
pub fn carried(resources: &Path) -> PathBuf {
    resources.join("resources").join("fonts")
}

/// Where this user's own fonts go.
fn user_fonts() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Microsoft").join("Windows").join("Fonts"))
    }
    #[cfg(not(windows))]
    {
        dirs::font_dir()
    }
}

/// The places a face may already be installed: this user's fonts, and everyone's.
fn font_places() -> Vec<PathBuf> {
    let mut places: Vec<PathBuf> = user_fonts().into_iter().collect();
    #[cfg(windows)]
    if let Some(w) = std::env::var_os("WINDIR") {
        places.push(PathBuf::from(w).join("Fonts"));
    }
    #[cfg(target_os = "macos")]
    places.push(PathBuf::from("/Library/Fonts"));
    places
}

/// Copies each face from `from` into `to` that is not there yet, and gives the files it put there - those it put
/// before a copy failed too, with why it failed. A file of the face's name already there - put there by anyone,
/// holding anything - is left.
fn copy_missing(from: &Path, to: &Path) -> (Vec<PathBuf>, Result<(), String>) {
    let mut put = Vec::new();
    if let Err(e) = std::fs::create_dir_all(to) {
        return (put, Err(format!("{}: {e}", to.display())));
    }
    for (file, _) in FACES {
        let dest = to.join(file);
        if dest.exists() {
            continue;
        }
        if let Err(e) = std::fs::copy(from.join(file), &dest) {
            return (put, Err(format!("{file}: {e}")));
        }
        put.push(dest);
    }
    (put, Ok(()))
}

/// Whether `recorded` - a path Meno's list holds for the face `file` - is one Meno could have put there: exactly
/// that face's file in this user's fonts folder `fonts`. Anything else the list may hold (another program's edit, a
/// mistaken one) is never taken out. (Windows paths: the same letters in any case.)
pub fn ours(recorded: &str, file: &str, fonts: &Path) -> bool {
    let expected = fonts.join(file).to_string_lossy().to_string();
    if cfg!(windows) {
        recorded.eq_ignore_ascii_case(&expected)
    } else {
        recorded == expected
    }
}

/// Whether all four faces are installed, for this user or for everyone.
pub fn installed() -> bool {
    let places = font_places();
    FACES.iter().all(|(file, _)| places.iter().any(|p| p.join(file).is_file()))
}

/// Whether Meno's label fonts are installed for Office: said in Settings, *Copied pictures*.
#[tauri::command]
pub fn label_fonts_installed() -> bool {
    installed()
}

/// On the Mac, at start: each face not yet in this user's fonts put there, quietly. How many were put.
#[cfg(target_os = "macos")]
pub fn install_quietly(resources: &Path) -> Result<usize, String> {
    let to = user_fonts().ok_or("no folder for this user's fonts")?;
    let (put, done) = copy_missing(&carried(resources), &to);
    done.map(|()| put.len()).map_err(|e| format!("{e} ({} put before)", put.len()))
}

#[cfg(windows)]
mod windows_fonts {
    use super::{copy_missing, user_fonts, FACES};
    use std::path::Path;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::Graphics::Gdi::{AddFontResourceW, RemoveFontResourceW};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteKeyW, RegDeleteValueW, RegGetValueW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ, RRF_RT_REG_SZ,
    };

    /// Where Windows lists this user's fonts, each face's name with its file.
    const FONTS_KEY: &str = r"Software\Microsoft\Windows NT\CurrentVersion\Fonts";
    /// Where Meno keeps which faces it put there, each by its file: only those are taken out again. Under Meno's own key,
    /// which uninstalling takes away once empty (defaults.rs), so this list goes first.
    const MENO_KEY: &str = r"Software\Meno\LabelFonts";

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    /// The text value `name` of the key `key` under this user's, where it is there.
    fn read_sz(key: &str, name: &str) -> Option<String> {
        let mut buf = vec![0u16; 1024];
        let mut len = (buf.len() * 2) as u32;
        // SAFETY: the buffer's size in bytes is passed with it.
        let r = unsafe { RegGetValueW(HKEY_CURRENT_USER, &HSTRING::from(key), &HSTRING::from(name), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut len as *mut u32)) };
        if r != ERROR_SUCCESS {
            return None;
        }
        let n = (len as usize / 2).saturating_sub(1).min(buf.len());
        Some(String::from_utf16_lossy(&buf[..n]))
    }

    /// The text value `name` of the key `key` under this user's, written: the key made where it is not there.
    fn write_sz(key: &str, name: &str, value: &str) -> Result<(), String> {
        let path = wide(key);
        let mut hkey = HKEY::default();
        // SAFETY: NUL-terminated wide strings, and a key closed after use.
        unsafe {
            RegCreateKeyExW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()), None, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_WRITE, None, &mut hkey, None)
                .ok()
                .map_err(|e| format!("{key}: {e}"))?;
            let data: Vec<u8> = wide(value).iter().flat_map(|c| c.to_le_bytes()).collect();
            let vname = wide(name);
            let written = RegSetValueExW(hkey, PCWSTR(vname.as_ptr()), None, REG_SZ, Some(&data)).ok();
            let _ = RegCloseKey(hkey);
            written.map_err(|e| format!("{key}: {e}"))
        }
    }

    /// The value `name` of the key `key` under this user's taken out, where it is there.
    fn delete_value(key: &str, name: &str) {
        let mut hkey = HKEY::default();
        // SAFETY: a key opened, used and closed; one not there is fine.
        unsafe {
            if RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(key), None, KEY_SET_VALUE, &mut hkey) == ERROR_SUCCESS {
                let _ = RegDeleteValueW(hkey, &HSTRING::from(name));
                let _ = RegCloseKey(hkey);
            }
        }
    }

    /// The faces Meno carries next to the exe put in this user's fonts, each kept in Meno's own list, listed where
    /// Windows lists fonts - where nothing of that name is listed already - and made known to this session. Those put
    /// before a copy failed are kept in the list too, so that they are taken out again.
    pub fn install() -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe.parent().ok_or("no folder for Meno")?;
        let to = user_fonts().ok_or("no folder for this user's fonts")?;
        let (put, done) = copy_missing(&super::carried(dir), &to);
        for path in put {
            let file = path.file_name().and_then(|f| f.to_str()).unwrap_or_default().to_string();
            let Some((_, name)) = FACES.iter().find(|(f, _)| *f == file) else { continue };
            let shown = path.to_string_lossy().to_string();
            write_sz(MENO_KEY, &file, &shown)?;
            // (a listing of that name already there - the user's own - is left as it is)
            if read_sz(FONTS_KEY, name).is_none() {
                write_sz(FONTS_KEY, name, &shown)?;
            }
            let w = wide(&shown);
            // SAFETY: a NUL-terminated wide string.
            unsafe {
                AddFontResourceW(PCWSTR(w.as_ptr()));
            }
        }
        done
    }

    /// The faces Meno put in this user's fonts taken out again - their files, their listing, Meno's list - and no
    /// others: only a path that is that face's own file in this user's fonts folder, and the record of it only once
    /// the file is gone (a font in use - PowerPoint open while Meno is updated - stays, and stays in the list).
    pub fn remove() -> Result<(), String> {
        let fonts_dir = user_fonts().ok_or("no folder for this user's fonts")?;
        for (file, name) in FACES {
            let Some(path) = read_sz(MENO_KEY, file) else { continue };
            if !super::ours(&path, file, &fonts_dir) {
                continue;
            }
            let w = wide(&path);
            // SAFETY: a NUL-terminated wide string.
            unsafe {
                let _ = RemoveFontResourceW(PCWSTR(w.as_ptr()));
            }
            let _ = std::fs::remove_file(Path::new(&path));
            if Path::new(&path).exists() {
                continue;
            }
            // (the listing only where it is still Meno's file)
            if read_sz(FONTS_KEY, name).as_deref() == Some(path.as_str()) {
                delete_value(FONTS_KEY, name);
            }
            delete_value(MENO_KEY, file);
        }
        // SAFETY: Meno's list deleted where it is empty; with a value left in it, the call fails and the list stays.
        unsafe {
            let _ = RegDeleteKeyW(HKEY_CURRENT_USER, &HSTRING::from(MENO_KEY));
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use windows_fonts::{install, remove};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_only_the_faces_not_there_and_leaves_one_that_is() {
        let base = std::env::temp_dir().join(format!("meno-labelfonts-{}", std::process::id()));
        let from = base.join("resources").join("fonts");
        let to = base.join("user-fonts");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        for (file, _) in FACES {
            std::fs::write(from.join(file), b"face").unwrap();
        }
        // (one face already there, holding something else: left as it is)
        std::fs::write(to.join(FACES[2].0), b"someone else's").unwrap();
        let (put, done) = copy_missing(&carried(&base), &to);
        assert!(done.is_ok());
        assert_eq!(put.len(), 3);
        assert_eq!(std::fs::read(to.join(FACES[2].0)).unwrap(), b"someone else's");
        assert_eq!(std::fs::read(to.join(FACES[0].0)).unwrap(), b"face");
        // (a second time, nothing to put)
        assert!(copy_missing(&carried(&base), &to).0.is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn gives_what_it_put_before_a_copy_failed() {
        let base = std::env::temp_dir().join(format!("meno-labelfonts-fail-{}", std::process::id()));
        let from = base.join("resources").join("fonts");
        let to = base.join("user-fonts");
        std::fs::create_dir_all(&from).unwrap();
        // (the third face missing from what Meno carries: the first two are put, then the copy fails)
        for (file, _) in &FACES[..2] {
            std::fs::write(from.join(file), b"face").unwrap();
        }
        let (put, done) = copy_missing(&carried(&base), &to);
        assert_eq!(put.iter().map(|p| p.file_name().unwrap().to_string_lossy().to_string()).collect::<Vec<_>>(), [FACES[0].0, FACES[1].0]);
        assert!(done.is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn takes_out_only_a_path_that_is_the_face_s_own_file_in_the_user_s_fonts() {
        let fonts = Path::new("/home/user/fonts");
        let own = fonts.join(FACES[0].0).to_string_lossy().to_string();
        assert!(ours(&own, FACES[0].0, fonts));
        // (another face's file, another folder, a file elsewhere the list was made to name: none taken out)
        assert!(!ours(&own, FACES[1].0, fonts));
        assert!(!ours(&Path::new("/home/user/other").join(FACES[0].0).to_string_lossy(), FACES[0].0, fonts));
        assert!(!ours("/home/user/Documents/thesis.docx", FACES[0].0, fonts));
    }
}
