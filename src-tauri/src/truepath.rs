//! A workspace file's one true path (docs/FILE-IO.md, *One file, one tab*):
//! however it was written - in another case, where the file system takes
//! no notice of case (Windows; a Mac's, as it comes); through a link, or a
//! step up (`..`); on Windows a short 8.3 name - the path the file system
//! itself has for the file, so that the page knows one file by one path
//! and opens it in one tab, whose saves no second tab overwrites.
//!
//! Every path the page holds for a workspace comes through here: a file
//! opened from outside Meno, dropped or pasted (opened.rs), picked in
//! Open's dialog, or saved (`true_path_of`).

use std::io;
use std::path::{Path, PathBuf};

/// The longest path Windows takes without its verbatim prefix (`MAX_PATH`, its end included).
#[cfg(any(windows, test))]
const PLAIN_MOST: usize = 260;

/// The one true path of the file at `path`, a whole path: the file system's
/// own (`fs::canonicalize` - every link followed, no step up, each name in
/// the case it is kept in), on Windows written plainly. A file not there
/// yet - one about to be saved - is its folder's, with its name as given.
pub fn true_path(path: &Path) -> io::Result<PathBuf> {
    if !path.is_absolute() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "it is not a whole path"));
    }
    let real = match std::fs::canonicalize(path) {
        Ok(real) => real,
        Err(e) if e.kind() == io::ErrorKind::NotFound => match (path.parent(), path.file_name()) {
            (Some(dir), Some(name)) => std::fs::canonicalize(dir)?.join(name),
            _ => return Err(e),
        },
        Err(e) => return Err(e),
    };
    // (one that is not text whole is left as it is, and not taken by the page: `true_text`)
    #[cfg(windows)]
    let real = match real.to_str() {
        Some(text) => PathBuf::from(plain_windows_path(text)),
        None => real,
    };
    Ok(real)
}

/// `path`'s one true path (`true_path`), as text: none where it cannot be
/// written as text whole - a name a link leads to, kept in no encoding the
/// page reads - which would name another file, or none.
fn true_text(path: &str) -> io::Result<String> {
    true_path(Path::new(path))?
        .into_os_string()
        .into_string()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "its path cannot be written as text"))
}

/// `path`'s one true path, as text; as given where it has none to be had
/// (`true_text`): the file gone, say, or a folder on the way that may not
/// be looked into.
pub fn true_path_or_given(path: &str) -> String {
    true_text(path).unwrap_or_else(|_| path.to_string())
}

/// The one true path of the file at `path` (`true_path`), for the page: a
/// file picked in Open's dialog, or saved.
#[tauri::command]
pub fn true_path_of(path: String) -> Result<String, String> {
    true_text(&path).map_err(|e| format!("{path}: {e}"))
}

/// A Windows path as `fs::canonicalize` gives it, verbatim (`\\?\C:\...`,
/// `\\?\UNC\server\share\...`), written plainly (`C:\...`,
/// `\\server\share\...`), as the dialogs give a path and the file system
/// plugin's scope holds one. Left verbatim where the plain path would name
/// another file, or none: a name Windows would read otherwise without the
/// prefix (ending in a dot or a space, `.` or `..`, a device's - `CON`,
/// `NUL.txt`), or a path longer than Windows takes plainly. Any other path
/// is as it was.
#[cfg(any(windows, test))]
pub fn plain_windows_path(path: &str) -> String {
    let (plain, rest) = if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        (format!(r"\\{rest}"), rest)
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        let b = rest.as_bytes();
        if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b.len() == 2 || b[2] == b'\\') {
            (rest.to_string(), &rest[2..])
        } else {
            return path.to_string();
        }
    } else {
        return path.to_string();
    };
    let names_another = rest.split('\\').filter(|n| !n.is_empty()).any(read_otherwise) || rest.contains('/');
    if names_another || plain.encode_utf16().count() >= PLAIN_MOST {
        path.to_string()
    } else {
        plain
    }
}

/// Whether Windows reads the name `name` otherwise in a plain path than in a verbatim one.
#[cfg(any(windows, test))]
fn read_otherwise(name: &str) -> bool {
    const DEVICES: [&str; 4] = ["CON", "PRN", "AUX", "NUL"];
    if name == "." || name == ".." || name.ends_with('.') || name.ends_with(' ') {
        return true;
    }
    let stem = name.split('.').next().unwrap_or(name).trim_end_matches(' ');
    let upper = stem.to_ascii_uppercase();
    DEVICES.contains(&upper.as_str())
        || ((upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.chars().count() == 4
            && upper.chars().nth(3).is_some_and(|c| c.is_ascii_digit() || "\u{b9}\u{b2}\u{b3}".contains(c)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("meno-truepath-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The path `p` with each letter in the other case.
    fn other_case(p: &Path) -> PathBuf {
        PathBuf::from(p.to_string_lossy().chars().map(|c| if c.is_lowercase() { c.to_ascii_uppercase() } else { c.to_ascii_lowercase() }).collect::<String>())
    }

    #[test]
    fn a_file_written_in_another_case_is_the_file_as_it_is_kept() {
        let dir = scratch();
        let file = dir.join("Sub").join("Mixed Case.meno");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, b"PK").unwrap();
        let other = other_case(&file);
        if !other.exists() {
            eprintln!("skipped: the temporary folder {} is on a volume that tells case apart, where another case names another file", dir.display());
            let _ = fs::remove_dir_all(dir);
            return;
        }
        let kept = true_path(&file).unwrap();
        assert!(kept.ends_with(Path::new("Sub").join("Mixed Case.meno")), "{}", kept.display());
        assert_eq!(true_path(&other).unwrap(), kept);
        assert_eq!(true_path_or_given(&other.to_string_lossy()), kept.to_string_lossy());
        // (the case a folder is kept in, too, where only it is written otherwise)
        let folder_other = other_case(file.parent().unwrap()).join("Mixed Case.meno");
        assert_eq!(true_path(&folder_other).unwrap(), kept);
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_name_written_in_another_unicode_form_is_the_name_as_it_is_kept() {
        // (a Mac's file system takes "é" as one letter or as "e" and an accent alike, and keeps the form it was given)
        let dir = scratch();
        fs::write(dir.join("caf\u{e9}.meno"), b"PK").unwrap();
        let kept = true_path(&dir.join("cafe\u{301}.meno")).unwrap();
        assert_eq!(kept.file_name().unwrap().to_string_lossy(), "caf\u{e9}.meno");
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_to_a_name_not_text_is_given_as_it_was() {
        use std::os::unix::ffi::OsStrExt;
        let dir = scratch();
        let odd = dir.join(std::ffi::OsStr::from_bytes(b"w\xff.meno"));
        if fs::write(&odd, b"PK").is_err() {
            eprintln!("skipped: the temporary folder {} keeps no name that is not UTF-8", dir.display());
            let _ = fs::remove_dir_all(dir);
            return;
        }
        std::os::unix::fs::symlink(&odd, dir.join("link.meno")).unwrap();
        let link = dir.join("link.meno").to_string_lossy().into_owned();
        assert!(true_path_of(link.clone()).is_err());
        assert_eq!(true_path_or_given(&link), link);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_step_up_is_taken() {
        let dir = scratch();
        fs::create_dir_all(dir.join("a").join("b")).unwrap();
        fs::write(dir.join("a").join("w.meno"), b"PK").unwrap();
        let up = dir.join("a").join("b").join("..").join("w.meno");
        let kept = true_path(&up).unwrap();
        assert_eq!(kept, true_path(&dir.join("a").join("w.meno")).unwrap());
        assert!(!kept.components().any(|c| c == std::path::Component::ParentDir));
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_is_the_file_it_points_at() {
        let dir = scratch();
        fs::create_dir_all(dir.join("real")).unwrap();
        fs::write(dir.join("real").join("w.meno"), b"PK").unwrap();
        std::os::unix::fs::symlink(dir.join("real").join("w.meno"), dir.join("link.meno")).unwrap();
        std::os::unix::fs::symlink(dir.join("real"), dir.join("folder")).unwrap();
        let kept = true_path(&dir.join("real").join("w.meno")).unwrap();
        assert_eq!(true_path(&dir.join("link.meno")).unwrap(), kept);
        assert_eq!(true_path(&dir.join("folder").join("w.meno")).unwrap(), kept);
        // (the temporary folder itself reached through a link, as /var is on a Mac: followed as well)
        assert_eq!(kept, fs::canonicalize(dir.join("real").join("w.meno")).unwrap());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_file_not_there_yet_is_its_folder_s_with_its_name_as_given() {
        let dir = scratch();
        fs::create_dir_all(dir.join("Folder")).unwrap();
        let folder = true_path(&dir.join("Folder")).unwrap();
        let new = dir.join("Folder").join("x").join("..").join("New Name.meno");
        // (x is not there either: the path goes through it, and so names nothing - but on Windows, where
        // a step up takes the name before it as written, whether it is there or not, it names the file in Folder)
        #[cfg(unix)]
        assert!(true_path(&new).is_err());
        #[cfg(windows)]
        assert_eq!(true_path(&new).unwrap(), folder.join("New Name.meno"));
        let new = dir.join("Folder").join("New Name.meno");
        assert_eq!(true_path(&new).unwrap(), folder.join("New Name.meno"));
        if other_case(&dir).exists() {
            assert_eq!(true_path(&other_case(&dir.join("Folder")).join("New Name.meno")).unwrap(), folder.join("New Name.meno"));
        }
        // (nor a folder: none to be had, and the path as given)
        let gone = dir.join("gone").join("w.meno");
        assert!(true_path(&gone).is_err());
        assert_eq!(true_path_or_given(&gone.to_string_lossy()), gone.to_string_lossy());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_path_that_is_not_whole_has_none() {
        assert!(true_path(Path::new("w.meno")).is_err());
        assert!(true_path(Path::new("../w.meno")).is_err());
        assert_eq!(true_path_or_given("w.meno"), "w.meno");
    }

    #[test]
    fn a_windows_verbatim_path_is_written_plainly() {
        assert_eq!(plain_windows_path(r"\\?\C:\Users\Chem\Work\w.meno"), r"C:\Users\Chem\Work\w.meno");
        assert_eq!(plain_windows_path(r"\\?\d:\w.meno"), r"d:\w.meno");
        assert_eq!(plain_windows_path(r"\\?\C:\"), r"C:\");
        assert_eq!(plain_windows_path(r"\\?\UNC\server\share\lab\w.meno"), r"\\server\share\lab\w.meno");
        // (already plain: as it was)
        assert_eq!(plain_windows_path(r"C:\Users\w.meno"), r"C:\Users\w.meno");
        assert_eq!(plain_windows_path(r"\\server\share\w.meno"), r"\\server\share\w.meno");
        assert_eq!(plain_windows_path("/Users/chem/w.meno"), "/Users/chem/w.meno");
        // (a volume by its name, or a device: no plain path to write)
        let volume = r"\\?\Volume{0b1c2d3e-0000-0000-0000-100000000000}\w.meno";
        assert_eq!(plain_windows_path(volume), volume);
        assert_eq!(plain_windows_path(r"\\?\GLOBALROOT\Device\x"), r"\\?\GLOBALROOT\Device\x");
        assert_eq!(plain_windows_path(r"\\?\C:w.meno"), r"\\?\C:w.meno");
    }

    #[test]
    fn a_windows_verbatim_path_stays_verbatim_where_plainly_it_would_name_another_file() {
        for p in [
            r"\\?\C:\work\trailing dot.\w.meno",
            r"\\?\C:\work\w.meno.",
            r"\\?\C:\work\trailing space \w.meno",
            r"\\?\C:\work\CON",
            r"\\?\C:\work\nul.txt",
            r"\\?\C:\work\Com1.meno",
            r"\\?\C:\work\LPT9",
            concat!(r"\\?\C:\work\COM", "\u{b9}", ".meno"),
            r"\\?\C:\work\..\w.meno",
            r"\\?\C:\work\a/b.meno",
            r"\\?\UNC\server\share\AUX\w.meno",
        ] {
            assert_eq!(plain_windows_path(p), p, "{p}");
        }
        // (names that only begin like a device's are not one)
        assert_eq!(plain_windows_path(r"\\?\C:\work\CONSOLE\COM10\nullable.meno"), r"C:\work\CONSOLE\COM10\nullable.meno");
        // (too long for Windows plainly)
        let long = format!(r"\\?\C:\{}\w.meno", "a".repeat(260));
        assert_eq!(plain_windows_path(&long), long);
        let fits = format!(r"\\?\C:\{}\w.meno", "a".repeat(240));
        assert_eq!(plain_windows_path(&fits), &fits[4..]);
    }
}
