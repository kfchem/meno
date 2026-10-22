//! Meno as the default app for the files it is offered for (`opened::OPENED_WITH`), chosen
//! from Settings, Files (docs/FILE-IO.md, *Meno as the default app*), one format at a time.
//! Nothing is changed until the user presses a format's button there.
//!
//! - **macOS 12 and later**: Meno asks the system to make it, or the app it replaced, the
//!   default for one type (`NSWorkspace setDefaultApplicationAtURL:toOpenContentType:
//!   completionHandler:`; the system asks the user where a type needs their consent). Before
//!   macOS 12 there is no such call, and the page says where to choose instead.
//! - **Windows**: an app cannot set a default; the user chooses it in Windows' Settings.
//!   Meno offers itself there for a format only when asked to (`offer`): its Default Programs
//!   registration, with that format alone among its file associations; then it opens its
//!   page in Default apps. Windows then asks which app to use the next time such a file is
//!   opened, until one is chosen - so only for the formats the user asked about (tried on
//!   Windows 11, 2026-10-21). It never writes `OpenWithProgids` or `Applications\Meno.exe`:
//!   with them, Meno took double-clicks on files the user had opened with it once
//!   (2026-10-19). `withdraw` takes a format out again, and the rest of the registration
//!   with the last; the uninstaller takes out what is left (`--unregister-defaults`,
//!   windows/hooks.nsh).

// (the Windows keys and rules are Windows' only, and tested on every system)
#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;

/// Each format Meno is offered for, and the app that opens it now.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FormatDefault {
    /// Its extension, without the dot.
    pub ext: String,
    /// The app that opens it now, by name; none where the system names none.
    pub app: Option<String>,
    /// Where that app is, as the system gives it.
    pub path: Option<String>,
    /// Whether that app is Meno.
    pub meno: bool,
    /// Windows: whether Meno offers itself for it in Default apps (`offer`).
    pub offered: bool,
}

/// What the page can do here, and each format's default now.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DefaultsState {
    /// `here`: chosen in Meno (macOS 12 and later); `system`: chosen in the system's settings,
    /// which Meno opens (Windows); `none`: neither (an older macOS, or a Meno not run as an
    /// installed app).
    pub can: &'static str,
    /// Windows: whether the system's page opens at Meno's own entry (`deep_link_works`).
    pub own_page: bool,
    pub formats: Vec<FormatDefault>,
}

/// The extensions, without their dots, in the order the page lists them.
fn extensions() -> impl Iterator<Item = &'static str> {
    crate::opened::OPENED_WITH.iter().copied()
}

/// Whether `ext` is one Meno is offered for.
fn known(ext: &str) -> Result<(), String> {
    if extensions().any(|e| e == ext) { Ok(()) } else { Err(format!(".{ext} is not one Meno is offered for.")) }
}

// ---------------------------------------------------------------------------
// Windows: the keys, as lists, written on request and taken out exactly.

/// The ProgID Meno's formats point to.
pub const PROG_ID: &str = "Meno.File";
/// The name Meno is listed by: `RegisteredApplications`' value, and `ApplicationName`, which
/// must be the same (Microsoft Learn, *Registering an Application for Use with Default
/// Programs*, Capabilities).
pub const APP_NAME: &str = "Meno";
/// Where Meno's capabilities are, under HKEY_CURRENT_USER.
pub const CAPABILITIES: &str = r"Software\Meno\Capabilities";
/// Where it lists the formats it is offered for, one value each.
pub const FILE_ASSOCIATIONS: &str = r"Software\Meno\Capabilities\FileAssociations";
/// Meno's ProgID's key, under HKEY_CURRENT_USER.
pub const PROG_ID_KEY: &str = r"Software\Classes\Meno.File";
/// The shared key Meno adds one value to, under HKEY_CURRENT_USER.
pub const REGISTERED_APPLICATIONS: &str = r"Software\RegisteredApplications";

/// A key under HKEY_CURRENT_USER, a value's name in it (empty for the key's default), and
/// the value; `None` makes the key and sets nothing.
pub type Entry = (String, String, Option<String>);

/// What Meno writes for the Meno at `exe` the first time it is offered for a format: its
/// capabilities, its ProgID, and - last, once what it points to is there - its name in
/// `RegisteredApplications`. With `claim` for each format offered, nothing else is written.
pub fn registration(exe: &str) -> Vec<Entry> {
    let e = |k: &str, n: &str, v: Option<String>| (k.to_string(), n.to_string(), v);
    vec![
        e(CAPABILITIES, "ApplicationDescription", Some("Chemical structures in 2D and 3D, calculations, PDFs and figures.".into())),
        e(CAPABILITIES, "ApplicationName", Some(APP_NAME.into())),
        e(FILE_ASSOCIATIONS, "", None),
        e(PROG_ID_KEY, "", Some("Meno file".into())),
        e(&format!(r"{PROG_ID_KEY}\DefaultIcon"), "", Some(format!("\"{exe}\",0"))),
        e(&format!(r"{PROG_ID_KEY}\shell\open\command"), "", Some(format!("\"{exe}\" \"%1\""))),
        e(REGISTERED_APPLICATIONS, APP_NAME, Some(CAPABILITIES.into())),
    ]
}

/// The one value that offers Meno for `ext` in Default apps.
pub fn claim(ext: &str) -> Entry {
    (FILE_ASSOCIATIONS.to_string(), format!(".{ext}"), Some(PROG_ID.to_string()))
}

/// Whether Windows' Default apps page takes `registeredAppUser` and opens at Meno's own
/// entry: Windows 11 21H2 and 22H2 with the 2023-04 cumulative update, and 23H2 or later
/// (Microsoft Learn, *Launch the Default Apps settings page*). The update's builds are those
/// the same page names for 21H2 and 22H2: 10.0.22000.1817 and 10.0.22621.1555.
pub fn deep_link_works(build: u32, ubr: u32) -> bool {
    match build {
        b if b >= 22631 => true,
        22621 => ubr >= 1555,
        22000 => ubr >= 1817,
        _ => false,
    }
}

/// The page Meno opens in Windows' Settings: its own entry where that works, else Default
/// apps itself.
pub fn settings_uri(own_page: bool) -> String {
    if own_page { format!("ms-settings:defaultapps?registeredAppUser={APP_NAME}") } else { "ms-settings:defaultapps".to_string() }
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::{w, HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteKeyW, RegDeleteTreeW, RegDeleteValueW, RegEnumValueW, RegGetValueW, RegOpenKeyExW, RegQueryInfoKeyW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_ALL_ACCESS, KEY_READ, KEY_SET_VALUE, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
    };
    use windows::Win32::UI::Shell::{
        ApplicationAssociationRegistration, AssocQueryStringW, IApplicationAssociationRegistration, SHChangeNotify, ShellExecuteW, AL_EFFECTIVE, ASSOCF_NONE, ASSOCSTR,
        ASSOCSTR_EXECUTABLE, ASSOCSTR_FRIENDLYAPPNAME, AT_FILEEXTENSION, SHCNE_ASSOCCHANGED, SHCNF_IDLIST,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    /// Tells the shell associations changed, as Microsoft Learn asks after any change to them
    /// (*File Types*: "If you do not call SHChangeNotify, the change may not be recognized until
    /// after the system is rebooted").
    fn notify() {
        // SAFETY: no items are passed with SHCNE_ASSOCCHANGED.
        unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
    }

    /// A string value, where it is there.
    fn read_sz(root: HKEY, key: &str, name: &str) -> Option<String> {
        let mut buf = vec![0u16; 1024];
        let mut len = (buf.len() * 2) as u32;
        // SAFETY: the buffer's size in bytes is passed with it.
        let r = unsafe { RegGetValueW(root, &HSTRING::from(key), &HSTRING::from(name), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut len as *mut u32)) };
        if r != ERROR_SUCCESS {
            return None;
        }
        let n = (len as usize / 2).saturating_sub(1).min(buf.len());
        Some(String::from_utf16_lossy(&buf[..n]))
    }

    fn read_dword(root: HKEY, key: &str, name: &str) -> Option<u32> {
        let mut v = 0u32;
        let mut len = 4u32;
        // SAFETY: a DWORD's room is passed with its size.
        let r = unsafe { RegGetValueW(root, &HSTRING::from(key), &HSTRING::from(name), RRF_RT_REG_DWORD, None, Some((&mut v as *mut u32).cast()), Some(&mut len as *mut u32)) };
        (r == ERROR_SUCCESS).then_some(v)
    }

    /// Whether this Windows opens Default apps at Meno's own entry.
    pub fn own_page() -> bool {
        let key = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
        let build = read_sz(HKEY_LOCAL_MACHINE, key, "CurrentBuildNumber").and_then(|b| b.parse().ok()).unwrap_or(0);
        let ubr = read_dword(HKEY_LOCAL_MACHINE, key, "UBR").unwrap_or(0);
        deep_link_works(build, ubr)
    }

    /// The names of a key's values, where it is there.
    fn value_names(key: &str) -> Vec<String> {
        let mut out = vec![];
        let mut hkey = HKEY::default();
        // SAFETY: a key opened to be read, its values' names read into a buffer of the length
        // passed, and the key closed.
        unsafe {
            if RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(key), None, KEY_READ, &mut hkey) != ERROR_SUCCESS {
                return out;
            }
            for i in 0.. {
                let mut name = vec![0u16; 256];
                let mut n = name.len() as u32;
                let r = RegEnumValueW(hkey, i, Some(PWSTR(name.as_mut_ptr())), &mut n, None, None, None, None);
                if r == ERROR_NO_MORE_ITEMS || r != ERROR_SUCCESS {
                    break;
                }
                out.push(String::from_utf16_lossy(&name[..n as usize]));
            }
            let _ = RegCloseKey(hkey);
        }
        out
    }

    /// The formats Meno offers itself for now, without their dots.
    pub fn offered() -> Vec<String> {
        value_names(FILE_ASSOCIATIONS).into_iter().filter_map(|n| n.strip_prefix('.').map(str::to_string)).collect()
    }

    fn write(entries: &[Entry]) -> Result<(), String> {
        for (key, name, value) in entries {
            let path = wide(key);
            let mut hkey = HKEY::default();
            // SAFETY: NUL-terminated wide strings, and a key closed after use.
            unsafe {
                RegCreateKeyExW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()), None, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_WRITE, None, &mut hkey, None)
                    .ok()
                    .map_err(|e| format!("{key}: {e}"))?;
                let written = match value {
                    None => Ok(()),
                    Some(v) => {
                        let data: Vec<u8> = wide(v).iter().flat_map(|c| c.to_le_bytes()).collect();
                        let vname = wide(name);
                        RegSetValueExW(hkey, PCWSTR(vname.as_ptr()), None, REG_SZ, Some(&data)).ok()
                    }
                };
                let _ = RegCloseKey(hkey);
                written.map_err(|e| format!("{key}: {e}"))?;
            }
        }
        Ok(())
    }

    /// Offers Meno for `ext` in Default apps: the registration where it is not there yet
    /// (written again, so that it names this Meno), and that format's claim.
    pub fn offer(ext: &str) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        // (the claim before the listing, so that Meno is never listed for nothing)
        let mut entries = registration(&exe.to_string_lossy());
        let listing = entries.pop();
        entries.push(claim(ext));
        entries.extend(listing);
        write(&entries)?;
        notify();
        Ok(())
    }

    /// Whether a key has no values and no subkeys.
    fn empty(key: &str) -> bool {
        let mut hkey = HKEY::default();
        // SAFETY: a key opened to be read, and closed.
        unsafe {
            if RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(key), None, KEY_READ, &mut hkey) != ERROR_SUCCESS {
                return false;
            }
            let (mut subkeys, mut values) = (0u32, 0u32);
            let r = RegQueryInfoKeyW(hkey, None, None, None, Some(&mut subkeys as *mut u32), None, None, Some(&mut values as *mut u32), None, None, None, None);
            let _ = RegCloseKey(hkey);
            r == ERROR_SUCCESS && subkeys == 0 && values == 0
        }
    }

    fn delete_value(key: &str, name: &str) {
        let mut hkey = HKEY::default();
        // SAFETY: a key opened to set values, one deleted, and closed; one not there is fine.
        unsafe {
            if RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(key), None, KEY_SET_VALUE, &mut hkey) == ERROR_SUCCESS {
                let _ = RegDeleteValueW(hkey, &HSTRING::from(name));
                let _ = RegCloseKey(hkey);
            }
        }
    }

    /// Stops offering Meno for `ext`; with the last format, takes out the rest of the
    /// registration (`unregister`).
    pub fn withdraw(ext: &str) -> Result<(), String> {
        delete_value(FILE_ASSOCIATIONS, &format!(".{ext}"));
        if offered().is_empty() {
            unregister()
        } else {
            notify();
            Ok(())
        }
    }

    /// Takes out what `offer` wrote, and nothing else: Meno's value in the shared
    /// `RegisteredApplications` (never the key), its own Capabilities and ProgID whole, and
    /// `Software\Meno` only where nothing is left in it.
    pub fn unregister() -> Result<(), String> {
        delete_value(REGISTERED_APPLICATIONS, APP_NAME);
        // SAFETY: keys opened, used and closed; a key not there is fine.
        unsafe {
            for (parent, sub) in [(r"Software\Meno", "Capabilities"), (r"Software\Classes", PROG_ID)] {
                let mut hkey = HKEY::default();
                if RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(parent), None, KEY_ALL_ACCESS, &mut hkey) == ERROR_SUCCESS {
                    let _ = RegDeleteTreeW(hkey, &HSTRING::from(sub));
                    let _ = RegCloseKey(hkey);
                }
            }
            if empty(r"Software\Meno") {
                let _ = RegDeleteKeyW(HKEY_CURRENT_USER, w!(r"Software\Meno"));
            }
        }
        notify();
        Ok(())
    }

    fn assoc(ext: &str, what: ASSOCSTR) -> Option<String> {
        let mut buf = vec![0u16; 1024];
        let mut n = buf.len() as u32;
        // SAFETY: the buffer's length in characters is passed with it.
        let hr = unsafe { AssocQueryStringW(ASSOCF_NONE, what, &HSTRING::from(ext), w!("open"), Some(PWSTR(buf.as_mut_ptr())), &mut n) };
        if hr.is_err() {
            return None;
        }
        let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..len])).filter(|s| !s.is_empty())
    }

    /// Each format's default now: whether it is Meno's ProgID (`QueryCurrentDefault`, the app
    /// ShellExecute starts), the app that opens it, by name and file, and whether Meno offers
    /// itself for it.
    pub fn formats() -> Vec<FormatDefault> {
        // SAFETY: COM for this thread (already so is fine), and an object released when dropped.
        let reg: Option<IApplicationAssociationRegistration> = unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            CoCreateInstance(&ApplicationAssociationRegistration, None, CLSCTX_INPROC_SERVER).ok()
        };
        let offered = offered();
        extensions()
            .map(|ext| {
                let dotted = format!(".{ext}");
                // SAFETY: the string returned freed as QueryCurrentDefault's page says.
                let prog = reg.as_ref().and_then(|r| unsafe {
                    let p = r.QueryCurrentDefault(&HSTRING::from(dotted.as_str()), AT_FILEEXTENSION, AL_EFFECTIVE).ok()?;
                    let s = p.to_string().ok();
                    CoTaskMemFree(Some(p.0 as *const _));
                    s
                });
                // (Windows' own "choose an app" is no app: what opens the format, none yet)
                let path = assoc(&dotted, ASSOCSTR_EXECUTABLE).filter(|p| !super::is_app_chooser(Some(p)));
                FormatDefault {
                    ext: ext.to_string(),
                    app: path.as_ref().and_then(|_| assoc(&dotted, ASSOCSTR_FRIENDLYAPPNAME)),
                    path,
                    meno: prog.as_deref() == Some(PROG_ID),
                    offered: offered.iter().any(|o| o == ext),
                }
            })
            .collect()
    }

    /// Opens Windows' Default apps, at Meno's entry where that works.
    pub fn open_settings() -> Result<(), String> {
        let uri = settings_uri(own_page());
        // SAFETY: NUL-terminated strings; ShellExecute's result above 32 is success.
        let r = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(uri.as_str()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        if r.0 as usize > 32 { Ok(()) } else { Err(format!("Windows' Settings did not open ({})", r.0 as usize)) }
    }
}

// ---------------------------------------------------------------------------
// macOS: the system's own calls, from macOS 12; looked up as Meno runs, so Meno still starts
// on the systems before (its minimum, 10.13).

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{msg_send, sel};
    use objc2_foundation::{NSString, NSURL};

    const MENO_ID: &str = "dev.kfchem.meno";

    fn workspace() -> Option<Retained<AnyObject>> {
        let cls = AnyClass::get(c"NSWorkspace")?;
        // SAFETY: a class method returning the shared workspace.
        unsafe { msg_send![cls, sharedWorkspace] }
    }

    /// The workspace, where it has the calls of macOS 12 and the type class is there.
    fn able() -> Option<Retained<AnyObject>> {
        let ws = workspace()?;
        AnyClass::get(c"UTType")?;
        // SAFETY: respondsToSelector: on an object.
        let has = |s| -> bool { unsafe { msg_send![&*ws, respondsToSelector: s] } };
        (has(sel!(URLForApplicationToOpenContentType:)) && has(sel!(setDefaultApplicationAtURL:toOpenContentType:completionHandler:))).then_some(ws)
    }

    /// The type the system gives files with this extension: another app's declared type, a
    /// standard one (PDF's), or one it makes up for an extension none declares.
    fn content_type(ext: &str) -> Option<Retained<AnyObject>> {
        let cls = AnyClass::get(c"UTType")?;
        let e = NSString::from_str(ext);
        // SAFETY: a class method taking a string and returning an object or nil.
        unsafe { msg_send![cls, typeWithFilenameExtension: &*e] }
    }

    fn bundle_id(url: &NSURL) -> Option<String> {
        let cls = AnyClass::get(c"NSBundle")?;
        // SAFETY: NSBundle's class method and property, each an object or nil.
        unsafe {
            let b: Option<Retained<AnyObject>> = msg_send![cls, bundleWithURL: url];
            let id: Option<Retained<NSString>> = msg_send![&*b?, bundleIdentifier];
            id.map(|s| s.to_string())
        }
    }

    fn display_name(path: &NSString) -> Option<String> {
        let cls = AnyClass::get(c"NSFileManager")?;
        // SAFETY: the default file manager's display name for a path.
        unsafe {
            let fm: Retained<AnyObject> = msg_send![cls, defaultManager];
            let n: Option<Retained<NSString>> = msg_send![&*fm, displayNameAtPath: path];
            n.map(|s| s.to_string())
        }
    }

    /// This Meno's own bundle, where it runs as the installed app (not from a build folder).
    fn own_bundle() -> Option<Retained<NSURL>> {
        let cls = AnyClass::get(c"NSBundle")?;
        // SAFETY: the main bundle and its URL.
        let url: Retained<NSURL> = unsafe {
            let b: Retained<AnyObject> = msg_send![cls, mainBundle];
            msg_send![&*b, bundleURL]
        };
        (bundle_id(&url).as_deref() == Some(MENO_ID) && url.path().is_some_and(|p| p.to_string().ends_with(".app"))).then_some(url)
    }

    pub fn state() -> DefaultsState {
        let Some(ws) = able() else {
            return DefaultsState { can: "none", own_page: false, formats: vec![] };
        };
        let formats = extensions()
            .map(|ext| {
                let url: Option<Retained<NSURL>> = content_type(ext).and_then(|t| unsafe { msg_send![&*ws, URLForApplicationToOpenContentType: &*t] });
                let path = url.as_ref().and_then(|u| u.path());
                FormatDefault {
                    ext: ext.to_string(),
                    app: path.as_ref().and_then(|p| display_name(p)),
                    path: path.map(|p| p.to_string()),
                    meno: url.as_ref().and_then(|u| bundle_id(u)).as_deref() == Some(MENO_ID),
                    offered: false,
                }
            })
            .collect();
        DefaultsState { can: if own_bundle().is_some() { "here" } else { "none" }, own_page: false, formats }
    }

    /// Asks the system to make the app at `app` (this Meno where none is given) the default for
    /// `ext`'s type; the answer comes once the system has done it, or the user has declined.
    pub fn set(ext: &str, app: Option<&str>, done: impl FnOnce(Result<(), String>) + Send + 'static) {
        let Some(ws) = able() else { return done(Err("This macOS has no way for an app to choose a default.".into())) };
        let Some(ty) = content_type(ext) else { return done(Err(format!("The system has no type for .{ext}."))) };
        let url = match app {
            Some(p) => NSURL::fileURLWithPath(&NSString::from_str(p)),
            None => match own_bundle() {
                Some(u) => u,
                None => return done(Err("Only an installed Meno can be made the default.".into())),
            },
        };
        let done = std::sync::Mutex::new(Some(done));
        let block = block2::RcBlock::new(move |err: *mut AnyObject| {
            let result = if err.is_null() {
                Ok(())
            } else {
                // SAFETY: the error the system passed, for as long as the call lasts.
                let text: Option<Retained<NSString>> = unsafe { msg_send![&*err, localizedDescription] };
                Err(text.map(|t| t.to_string()).unwrap_or_else(|| "The system did not change it.".into()))
            };
            if let Some(f) = done.lock().ok().and_then(|mut d| d.take()) {
                f(result);
            }
        });
        // SAFETY: the call macOS 12 has (`able`), with a URL, a type and a block it keeps.
        unsafe {
            let _: () = msg_send![&*ws, setDefaultApplicationAtURL: &*url, toOpenContentType: &*ty, completionHandler: &*block];
        }
    }
}

// ---------------------------------------------------------------------------
// The page's commands.

/// What can be done here, and each format's default now.
#[tauri::command]
pub fn defaults_state() -> DefaultsState {
    #[cfg(target_os = "macos")]
    return mac::state();
    #[cfg(windows)]
    return DefaultsState { can: "system", own_page: win::own_page(), formats: win::formats() };
    #[allow(unreachable_code)]
    DefaultsState { can: "none", own_page: false, formats: vec![] }
}

/// What `defaults_use` says where the app it is asked to make the default is no longer where
/// it was - moved to the Trash since, say (lib/defaultApps `APP_GONE`).
pub const APP_GONE: &str = "app-gone";

/// Whether the program a format would start is Windows' own "choose an app" (`OpenWith.exe`),
/// which Windows names as if it were an app ("Select an app", in the user's language): no
/// app opens such a format yet, and the page says so (Windows 11 build 26300, 2026-10-22).
pub fn is_app_chooser(path: Option<&str>) -> bool {
    path.and_then(|p| p.rsplit(['\\', '/']).next()).is_some_and(|f| f.eq_ignore_ascii_case("OpenWith.exe"))
}

/// Whether the app at `app` is gone from where it was; none asked for (Meno itself) is not.
pub fn app_gone(app: Option<&str>) -> bool {
    app.is_some_and(|p| !std::path::Path::new(p).exists())
}

/// macOS: makes Meno - or the app at `app`, the one it replaced - the default for `ext`.
#[tauri::command]
pub async fn defaults_use(ext: String, app: Option<String>) -> Result<(), String> {
    known(&ext)?;
    if app_gone(app.as_deref()) {
        return Err(APP_GONE.into());
    }
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        mac::set(&ext, app.as_deref(), move |r| {
            let _ = tx.send(r);
        });
        return rx.await.map_err(|_| "The system gave no answer.".to_string())?;
    }
    #[allow(unreachable_code)]
    {
        let _ = app;
        Err("Only macOS lets Meno choose a default itself.".into())
    }
}

/// Windows: offers Meno for `ext` in Default apps, and opens Meno's page there.
#[tauri::command]
pub fn defaults_offer(ext: String) -> Result<(), String> {
    known(&ext)?;
    #[cfg(windows)]
    {
        win::offer(&ext)?;
        return win::open_settings();
    }
    #[allow(unreachable_code)]
    Err("Only on Windows.".into())
}

/// Windows: opens Meno's page in Default apps.
#[tauri::command]
pub fn defaults_open_settings() -> Result<(), String> {
    #[cfg(windows)]
    return win::open_settings();
    #[allow(unreachable_code)]
    Err("Only on Windows.".into())
}

/// Windows: stops offering Meno for `ext`.
#[tauri::command]
pub fn defaults_withdraw(ext: String) -> Result<(), String> {
    known(&ext)?;
    #[cfg(windows)]
    return win::withdraw(&ext);
    #[allow(unreachable_code)]
    Err("Only on Windows.".into())
}

/// `--unregister-defaults`, which the uninstaller runs: whatever of the registration is left.
#[cfg(windows)]
pub fn unregister() -> Result<(), String> {
    win::unregister()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every key and value offering Meno for all its formats would write.
    fn all() -> Vec<Entry> {
        let mut e = registration(r"C:\Users\someone\AppData\Local\Meno\Meno.exe");
        e.extend(extensions().map(claim));
        e
    }

    #[test]
    fn takes_windows_own_choose_an_app_for_no_app() {
        assert!(is_app_chooser(Some(r"C:\WINDOWS\system32\OpenWith.exe")));
        assert!(is_app_chooser(Some(r"C:\Windows\System32\openwith.EXE")));
        assert!(!is_app_chooser(Some(r"C:\Program Files\Some Viewer\viewer.exe")));
        assert!(!is_app_chooser(Some(r"C:\Tools\NotOpenWith.exe")));
        assert!(!is_app_chooser(None));
    }

    #[test]
    fn says_an_app_asked_for_is_gone_only_where_nothing_is_there_now() {
        let here = std::env::temp_dir();
        assert!(!app_gone(None));
        assert!(!app_gone(here.to_str()));
        assert!(app_gone(here.join("Meno test: no such app.app").to_str()));
    }

    #[test]
    fn writes_only_the_keys_default_apps_reads_and_never_those_that_took_double_clicks() {
        for (key, name, _) in all() {
            assert!(!key.contains("OpenWithProgids") && !name.contains("OpenWithProgids"), "{key}");
            assert!(!key.contains(r"Applications\"), "{key}");
            let ok = key == REGISTERED_APPLICATIONS || key.starts_with(CAPABILITIES) || key.starts_with(PROG_ID_KEY);
            assert!(ok, "a key outside Meno's own: {key}");
        }
        let reg = registration("Meno.exe");
        // (the shared key: Meno's one value in it, pointing at its capabilities - and last)
        let shared: Vec<_> = reg.iter().filter(|k| k.0 == REGISTERED_APPLICATIONS).collect();
        assert_eq!(shared, vec![&(REGISTERED_APPLICATIONS.to_string(), APP_NAME.to_string(), Some(CAPABILITIES.to_string()))]);
        assert_eq!(reg.last().unwrap().0, REGISTERED_APPLICATIONS);
        // (ApplicationDescription is required; ApplicationName matches the registered name)
        assert!(reg.iter().any(|k| k.0 == CAPABILITIES && k.1 == "ApplicationDescription" && k.2.as_deref().is_some_and(|d| !d.is_empty())));
        assert!(reg.iter().any(|k| k.0 == CAPABILITIES && k.1 == "ApplicationName" && k.2.as_deref() == Some(APP_NAME)));
        // (no format claimed by the registration itself: each only when it is asked for)
        assert!(!reg.iter().any(|k| k.0 == FILE_ASSOCIATIONS && !k.1.is_empty()));
    }

    #[test]
    fn claims_one_format_at_a_time_for_meno_s_progid() {
        assert_eq!(claim("sdf"), (FILE_ASSOCIATIONS.to_string(), ".sdf".to_string(), Some(PROG_ID.to_string())));
        let claimed: Vec<String> = extensions().map(|e| claim(e).1).collect();
        let want: Vec<String> = crate::opened::OPENED_WITH.iter().map(|e| format!(".{e}")).collect();
        assert_eq!(claimed, want);
        // (.meno stays the installer's own, under its own ProgID)
        assert!(known("meno").is_err());
        assert!(known("sdf").is_ok());
    }

    #[test]
    fn opens_the_file_given_with_this_meno() {
        let reg = registration(r"C:\Program Files\Meno\Meno.exe");
        let command = reg.iter().find(|k| k.0.ends_with(r"shell\open\command")).unwrap();
        assert_eq!(command.2.as_deref(), Some(r#""C:\Program Files\Meno\Meno.exe" "%1""#));
        let icon = reg.iter().find(|k| k.0.ends_with("DefaultIcon")).unwrap();
        assert_eq!(icon.2.as_deref(), Some(r#""C:\Program Files\Meno\Meno.exe",0"#));
    }

    #[test]
    fn opens_meno_s_own_entry_only_where_windows_takes_it() {
        // (Windows 10, and Windows 11 before the 2023-04 update: Default apps itself)
        assert!(!deep_link_works(19045, 5000));
        assert!(!deep_link_works(22000, 1816));
        assert!(deep_link_works(22000, 1817));
        assert!(!deep_link_works(22621, 1554));
        assert!(deep_link_works(22621, 1555));
        assert!(deep_link_works(22631, 0));
        assert!(deep_link_works(26100, 0));
        assert_eq!(settings_uri(true), "ms-settings:defaultapps?registeredAppUser=Meno");
        assert_eq!(settings_uri(false), "ms-settings:defaultapps");
    }
}
