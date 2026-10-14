//! Meno's log (docs/ARCHITECTURE.md, *Meno's log*): what Meno says of
//! itself - its own lines (`logged!`), a panic, and the page's errors and
//! warnings (`log_page`, from lib/log.ts) - written to
//! `<app data>/logs/meno.log` as well as where they went before. A release
//! started from the Finder or Explorer has no terminal, so without the file
//! nothing it said would be left for a problem to be found by. The log is
//! kept under 5 MB: past that it is begun again, the one before kept as
//! meno.log.1, one only. It holds what Meno logged before it, and nothing
//! from documents.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// How large the log grows before it is begun again, in bytes.
const MOST: u64 = 5 * 1024 * 1024;
/// How many lines are kept from before the log's folder is known, to be written once it is.
const EARLY: usize = 200;
/// The longest text taken from the page for one line, in bytes.
const PAGE_MOST: usize = 4000;

struct Log {
    path: PathBuf,
    file: Option<File>,
    size: u64,
    most: u64,
}

struct State {
    log: Option<Log>,
    early: Vec<String>,
}

static STATE: Mutex<State> = Mutex::new(State { log: None, early: Vec::new() });

/// A line of Meno's own, as `eprintln!` takes it: to stderr, and into the log.
macro_rules! logged {
    ($($arg:tt)*) => { $crate::logfile::line("meno", &format!($($arg)*)) };
}
pub(crate) use logged;

fn state() -> MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

/// The log begun - or carried on - in `dir`, a line saying which Meno this
/// is first, then the lines kept from before.
pub fn start(dir: &Path, version: &str) {
    let path = dir.join("meno.log");
    let opened = fs::create_dir_all(dir).and_then(|_| open(&path));
    let mut state = state();
    match opened {
        Ok(file) => {
            let size = file.metadata().map(|m| m.len()).unwrap_or(0);
            let mut log = Log { path, file: Some(file), size, most: MOST };
            log.write(&stamped("meno", &format!("Meno {version} ({} {}) started", std::env::consts::OS, std::env::consts::ARCH)));
            for line in std::mem::take(&mut state.early) {
                log.write(&line);
            }
            state.log = Some(log);
        }
        Err(e) => eprintln!("the log cannot be kept at {}: {e}", path.display()),
    }
}

/// A line from `source` - "meno", "page error", "page warn" - to stderr as
/// it is, and into the log with the time.
pub fn line(source: &str, text: &str) {
    eprintln!("{text}");
    keep(&stamped(source, text), &mut state());
}

fn keep(line: &str, state: &mut State) {
    match state.log.as_mut() {
        Some(log) => log.write(line),
        None if state.early.len() < EARLY => state.early.push(line.to_string()),
        None => {}
    }
}

/// A panic into the log, as well as to stderr as before.
pub fn catch_panics() {
    let before = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // (not waited for: a panic while the log is being written would wait on itself)
        if let Ok(mut state) = STATE.try_lock() {
            keep(&stamped("meno", &format!("panicked: {info}")), &mut state);
        }
        before(info);
    }));
}

/// The page's errors and warnings (`lib/log.ts`), each cut to `PAGE_MOST`.
#[tauri::command]
pub fn log_page(level: String, text: String) {
    let source = if level == "error" { "page error" } else { "page warn" };
    line(source, cut(&text, PAGE_MOST));
}

fn open(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

impl Log {
    fn write(&mut self, line: &str) {
        let n = line.len() as u64;
        if self.size > 0 && self.size + n > self.most {
            self.begin_again();
        }
        if let Some(file) = self.file.as_mut() {
            if file.write_all(line.as_bytes()).is_ok() {
                self.size += n;
            }
        }
    }

    /// The log begun again, the one before kept as meno.log.1 in place of
    /// the one before that.
    fn begin_again(&mut self) {
        // (closed first: an open file is not renamed on Windows)
        self.file = None;
        let before = self.path.with_extension("log.1");
        let _ = fs::remove_file(&before);
        let _ = fs::rename(&self.path, &before);
        self.file = open(&self.path).ok();
        self.size = self.file.as_ref().and_then(|f| f.metadata().ok()).map_or(0, |m| m.len());
    }
}

/// A line as the log holds it: the time (UTC), its source, its text - each
/// of the text's lines after the first indented beneath it.
fn stamped(source: &str, text: &str) -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let mut out = format!("{} {source}: ", utc(secs));
    for (i, l) in text.lines().enumerate() {
        if i > 0 {
            out.push_str("\n    ");
        }
        out.push_str(l);
    }
    out.push('\n');
    out
}

/// Seconds since 1970-01-01 00:00 UTC as a date and time in the Gregorian
/// calendar: the days counted in eras of 400 years (146 097 days), each
/// era's years begun on 1 March, so that a leap day falls at a year's end.
fn utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let s = secs % 86_400;
    let z = days + 719_468; // (days from 0000-03-01)
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let m = (5 * day_of_year + 2) / 153; // (0 for March)
    let day = day_of_year - (153 * m + 2) / 5 + 1;
    let month = if m < 10 { m + 3 } else { m - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02}Z", s / 3_600, s % 3_600 / 60, s % 60)
}

/// `text` cut to at most `most` bytes, at a character's start.
fn cut(text: &str, most: usize) -> &str {
    if text.len() <= most {
        return text;
    }
    let mut i = most;
    while !text.is_char_boundary(i) {
        i -= 1;
    }
    &text[..i]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times_are_written_as_utc_dates() {
        assert_eq!(utc(0), "1970-01-01 00:00:00Z");
        assert_eq!(utc(951_782_400), "2000-02-29 00:00:00Z");
        assert_eq!(utc(1_709_208_000), "2024-02-29 12:00:00Z");
        assert_eq!(utc(1_791_935_999), "2026-10-13 23:59:59Z");
        assert_eq!(utc(4_107_542_400), "2100-03-01 00:00:00Z");
    }

    #[test]
    fn a_texts_later_lines_are_indented_beneath_its_first() {
        let line = stamped("page error", "TypeError: x is undefined\nf@app.js:1:2\ng@app.js:3:4");
        let (_, rest) = line.split_once(' ').unwrap();
        let (_, rest) = rest.split_once(' ').unwrap();
        assert_eq!(rest, "page error: TypeError: x is undefined\n    f@app.js:1:2\n    g@app.js:3:4\n");
    }

    #[test]
    fn the_pages_text_is_cut_at_a_characters_start() {
        assert_eq!(cut("abc", 10), "abc");
        assert_eq!(cut("abcdef", 4), "abcd");
        // ("é" is two bytes: not cut through)
        assert_eq!(cut("aé", 2), "a");
    }

    #[test]
    fn the_log_is_begun_again_past_its_size_the_one_before_kept() {
        let dir = std::env::temp_dir().join(format!("meno-log-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meno.log");
        let mut log = Log { file: Some(open(&path).unwrap()), path: path.clone(), size: 0, most: 100 };
        let line = format!("{}\n", "a".repeat(39)); // (40 bytes)
        log.write(&line);
        log.write(&line);
        assert_eq!(fs::read_to_string(&path).unwrap().len(), 80);
        // (a third would pass 100: the two before go to meno.log.1)
        log.write(&line);
        assert_eq!(fs::read_to_string(&path).unwrap(), line);
        assert_eq!(fs::read_to_string(dir.join("meno.log.1")).unwrap().len(), 80);
        // (and again: the oldest gone, one before kept)
        log.write(&line);
        log.write(&"b".repeat(40));
        assert_eq!(fs::read_to_string(&path).unwrap(), "b".repeat(40));
        assert_eq!(fs::read_to_string(dir.join("meno.log.1")).unwrap().len(), 80);
        assert!(!dir.join("meno.log.2").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn lines_from_before_the_log_starts_are_written_once_it_does() {
        let mut state = State { log: None, early: Vec::new() };
        for i in 0..(EARLY + 5) {
            keep(&format!("{i}\n"), &mut state);
        }
        assert_eq!(state.early.len(), EARLY);
        assert_eq!(state.early[0], "0\n");
    }
}
