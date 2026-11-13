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

/// Copies each face from `from` into `to` that is not there yet, and gives the files it put there. A file of the
/// face's name already there - put there by anyone, holding anything - is left.
fn copy_missing(from: &Path, to: &Path) -> Result<Vec<PathBuf>, String> {
    std::fs::create_dir_all(to).map_err(|e| format!("{}: {e}", to.display()))?;
    let mut put = Vec::new();
    for (file, _) in FACES {
        let dest = to.join(file);
        if dest.exists() {
            continue;
        }
        std::fs::copy(from.join(file), &dest).map_err(|e| format!("{file}: {e}"))?;
        put.push(dest);
    }
    Ok(put)
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
    Ok(copy_missing(&carried(resources), &to)?.len())
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

    /// The faces Meno carries next to the exe put in this user's fonts, each listed where Windows lists fonts and kept in
    /// Meno's own list, and made known to this session.
    pub fn install() -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe.parent().ok_or("no folder for Meno")?;
        let to = user_fonts().ok_or("no folder for this user's fonts")?;
        for path in copy_missing(&super::carried(dir), &to)? {
            let file = path.file_name().and_then(|f| f.to_str()).unwrap_or_default().to_string();
            let Some((_, name)) = FACES.iter().find(|(f, _)| *f == file) else { continue };
            let shown = path.to_string_lossy().to_string();
            write_sz(FONTS_KEY, name, &shown)?;
            write_sz(MENO_KEY, &file, &shown)?;
            let w = wide(&shown);
            // SAFETY: a NUL-terminated wide string.
            unsafe {
                AddFontResourceW(PCWSTR(w.as_ptr()));
            }
        }
        Ok(())
    }

    /// The faces Meno put in this user's fonts taken out again - their files, their listing, Meno's list - and no others.
    pub fn remove() -> Result<(), String> {
        for (file, name) in FACES {
            let Some(path) = read_sz(MENO_KEY, file) else { continue };
            let w = wide(&path);
            // SAFETY: a NUL-terminated wide string.
            unsafe {
                let _ = RemoveFontResourceW(PCWSTR(w.as_ptr()));
            }
            // (the listing only where it is still Meno's file)
            if read_sz(FONTS_KEY, name).as_deref() == Some(path.as_str()) {
                delete_value(FONTS_KEY, name);
            }
            let _ = std::fs::remove_file(Path::new(&path));
            delete_value(MENO_KEY, file);
        }
        // SAFETY: Meno's list deleted, empty of what it named; one not there is fine.
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
        let put = copy_missing(&carried(&base), &to).unwrap();
        assert_eq!(put.len(), 3);
        assert_eq!(std::fs::read(to.join(FACES[2].0)).unwrap(), b"someone else's");
        assert_eq!(std::fs::read(to.join(FACES[0].0)).unwrap(), b"face");
        // (a second time, nothing to put)
        assert!(copy_missing(&carried(&base), &to).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }
}
