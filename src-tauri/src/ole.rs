//! Structures in Word and PowerPoint documents as OLE objects, on Windows:
//! a document keeps Meno's record of the structure with the same EMF picture
//! a copy carries, and a double-click on it opens the structure in Meno,
//! whose edits go back into the document as they are made.
//!
//! Meno is the object's server itself. It registers the class as it starts,
//! so a double-click reaches a Meno that is already running; when none is,
//! Windows starts one (`-Embedding`). The objects are free-threaded: Office's
//! calls arrive on threads of COM's multithreaded apartment, and Meno's
//! calls to Office are made from one such thread too (`OUT`), while the
//! page's commands arrive on the window's thread and hand their work over.
//!
//! The picture is drawn by the page (lib/chem/emf) and handed over with the
//! record; what Office shows is whatever was handed over last.

use serde::Serialize;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};
use windows::core::{implement, w, AgileReference as Agile, ComObject, IUnknown, IUnknownImpl, Interface, Ref, BOOL, GUID, HRESULT, PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CLASS_E_NOAGGREGATION, CLIPBRD_E_CANT_OPEN, DATA_S_SAMEFORMATETC, DV_E_FORMATETC, DV_E_TYMED, E_FAIL, E_NOTIMPL, E_OUTOFMEMORY, E_POINTER, HGLOBAL, HWND, OLE_E_ADVISENOTSUPPORTED,
    OLE_E_NOCONNECTION, RECT, S_FALSE, S_OK, SIZE,
};
use windows::Win32::Graphics::Gdi::{SetEnhMetaFileBits, LOGPALETTE};
use windows::Win32::System::Com::StructuredStorage::{
    CreateILockBytesOnHGlobal, GetHGlobalFromILockBytes, IPersistStorage, IPersistStorage_Impl, IStorage,
    StgCreateDocfileOnILockBytes, StgOpenStorageOnILockBytes, WriteClassStg, WriteFmtUserTypeStg,
};
use windows::Win32::System::Com::{
    CoDisconnectObject, CoInitializeEx, CoRegisterClassObject, COINIT_MULTITHREADED, IAdviseSink, IClassFactory, IClassFactory_Impl,
    IDataObject, IDataObject_Impl, IEnumFORMATETC, IEnumSTATDATA, IMoniker, IPersist_Impl, IStream,
    CLSCTX_LOCAL_SERVER, DATADIR_GET, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL, REGCLS_MULTIPLEUSE, STATFLAG_NONAME, STATSTG, STGC_DEFAULT, STGMEDIUM, STREAM_SEEK_SET,
    STGMEDIUM_0, STGM_CREATE, STGM_READ, STGM_READWRITE, STGM_SHARE_EXCLUSIVE, STGM_WRITE, TYMED_ENHMF, TYMED_ISTORAGE,
};
use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::{
    IEnumOLEVERB, IOleCache, IOleClientSite, IOleObject, IOleObject_Impl,
    OleCreateDefaultHandler, OleFlushClipboard, OleInitialize, OleRegEnumFormatEtc, OleSetClipboard, ReleaseStgMedium, OleRegEnumVerbs, OleRegGetUserType, CF_ENHMETAFILE,
    OBJECTDESCRIPTOR, OLECLOSE, OLECLOSE_NOSAVE, OLEGETMONIKER, OLEIVERB_HIDE, OLEMISC, OLEWHICHMK, USERCLASSTYPE,
};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteTreeW, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CLASSES_ROOT,
    HKEY_CURRENT_USER, KEY_ALL_ACCESS, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY, KEY_WRITE, REG_OPTION_NON_VOLATILE,
    REG_SAM_FLAGS, REG_SZ,
};
use windows::Win32::UI::Shell::SHCreateStdEnumFmtEtc;
use windows::Win32::UI::WindowsAndMessaging::MSG;

/// The class of a Meno structure in a document. It is written into every
/// document that holds one, so it never changes.
pub const CLSID_STRUCTURE: GUID = GUID::from_u128(0x3ef2a330_5a2f_4696_b1a2_d1648638de1d);
const CLSID_TEXT: &str = "{3EF2A330-5A2F-4696-B1A2-D1648638DE1D}";
const PROG_ID: &str = "Meno.Structure.1";
const PROG_ID_ANY: &str = "Meno.Structure";
const USER_TYPE: &str = "Meno Structure";
const SHORT_TYPE: &str = "Meno";
/// The streams of an object's storage: Meno's record of the structure, and
/// the picture of it last drawn.
const RECORD_STREAM: PCWSTR = w!("Meno");
const PICTURE_STREAM: PCWSTR = w!("MenoPicture");
/// A clipboard format's name for the record, as `WriteFmtUserTypeStg` asks.
const RECORD_FORMAT: PCWSTR = w!("Meno Structure");

// ---------------------------------------------------------------------------
// Registration: the keys Windows and Office look the class up by, for this
// user. The NSIS installer writes them through `--register-ole` and removes
// them through `--unregister-ole` (windows/hooks.nsh); the MSI writes the
// same keys for the machine itself (windows/ole.wxs).

/// Every key and value the class needs, as (key under Software\Classes, value
/// name - empty for the key's default - and value).
fn registry_entries(exe: &str) -> Vec<(String, &'static str, String)> {
    let clsid = format!(r"CLSID\{CLSID_TEXT}");
    let mut e = vec![
        (PROG_ID.to_string(), "", USER_TYPE.to_string()),
        (format!(r"{PROG_ID}\CLSID"), "", CLSID_TEXT.to_string()),
        (format!(r"{PROG_ID}\Insertable"), "", String::new()),
        (PROG_ID_ANY.to_string(), "", USER_TYPE.to_string()),
        (format!(r"{PROG_ID_ANY}\CLSID"), "", CLSID_TEXT.to_string()),
        (format!(r"{PROG_ID_ANY}\CurVer"), "", PROG_ID.to_string()),
        (clsid.clone(), "", USER_TYPE.to_string()),
        (format!(r"{clsid}\LocalServer32"), "", format!("\"{exe}\"")),
        // (drawing from the picture it keeps, without starting Meno)
        (format!(r"{clsid}\InprocHandler32"), "", "ole32.dll".to_string()),
        (format!(r"{clsid}\ProgID"), "", PROG_ID.to_string()),
        (format!(r"{clsid}\VersionIndependentProgID"), "", PROG_ID_ANY.to_string()),
        (format!(r"{clsid}\DefaultIcon"), "", format!("\"{exe}\",0")),
        (format!(r"{clsid}\Insertable"), "", String::new()),
        (format!(r"{clsid}\AuxUserType\2"), "", SHORT_TYPE.to_string()),
        (format!(r"{clsid}\AuxUserType\3"), "", USER_TYPE.to_string()),
        (format!(r"{clsid}\MiscStatus"), "", "0".to_string()),
        // double-click and the menu: both open the structure in Meno
        (format!(r"{clsid}\Verb\0"), "", "&Edit,0,2".to_string()),
        (format!(r"{clsid}\Verb\1"), "", "&Open,0,2".to_string()),
        // an enhanced metafile, of the content, handed out
        (format!(r"{clsid}\DataFormats\GetSet\0"), "", "14,1,64,1".to_string()),
    ];
    e.sort_by(|a, b| a.0.cmp(&b.0));
    e
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// The views of the registry a key is written to: a class's own key twice -
/// a 32-bit Office looks it up in the 32-bit view, where Windows keeps a
/// user's class keys apart - and names once, as both views share them.
fn views(key: &str) -> &'static [REG_SAM_FLAGS] {
    if key.starts_with("CLSID") { &[KEY_WOW64_64KEY, KEY_WOW64_32KEY] } else { &[KEY_WOW64_64KEY] }
}

/// Registers the class for this user, served by `exe`.
pub fn register(exe: &str) -> Result<(), String> {
    for (key, name, value) in registry_entries(exe) {
        let path = wide(&format!(r"Software\Classes\{key}"));
        for view in views(&key) {
            let mut hkey = HKEY::default();
            // SAFETY: NUL-terminated wide strings, and a key closed after use.
            unsafe {
                RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(path.as_ptr()),
                    None,
                    PCWSTR::null(),
                    REG_OPTION_NON_VOLATILE,
                    KEY_WRITE | *view,
                    None,
                    &mut hkey,
                    None,
                )
                .ok()
                .map_err(|e| format!("{key}: {e}"))?;
                let data: Vec<u8> = wide(&value).iter().flat_map(|c| c.to_le_bytes()).collect();
                let vname = wide(name);
                let written = RegSetValueExW(hkey, PCWSTR(vname.as_ptr()), None, REG_SZ, Some(&data));
                let _ = RegCloseKey(hkey);
                written.ok().map_err(|e| format!("{key}: {e}"))?;
            }
        }
    }
    Ok(())
}

/// Takes the class's keys out again, from every view they were written to.
pub fn unregister() -> Result<(), String> {
    let classes = wide(r"Software\Classes");
    for key in [format!(r"CLSID\{CLSID_TEXT}"), PROG_ID.to_string(), PROG_ID_ANY.to_string()] {
        let path = wide(&key);
        for view in views(&key) {
            let mut hkey = HKEY::default();
            // SAFETY: NUL-terminated wide strings, and a key closed after use;
            // a key that is not there is fine.
            unsafe {
                if RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(classes.as_ptr()), None, KEY_ALL_ACCESS | *view, &mut hkey).is_ok() {
                    let _ = RegDeleteTreeW(hkey, PCWSTR(path.as_ptr()));
                    let _ = RegCloseKey(hkey);
                }
            }
        }
    }
    Ok(())
}

/// Whether the class is registered, for this user or the machine: a copy
/// offers Office an object only then, as Office could do nothing with it
/// otherwise.
pub fn is_registered() -> bool {
    let path = wide(&format!(r"CLSID\{CLSID_TEXT}\LocalServer32"));
    let mut hkey = HKEY::default();
    // SAFETY: as for `register`.
    unsafe {
        let found = RegOpenKeyExW(HKEY_CLASSES_ROOT, PCWSTR(path.as_ptr()), None, KEY_READ, &mut hkey).is_ok();
        if found {
            let _ = RegCloseKey(hkey);
        }
        found
    }
}

// ---------------------------------------------------------------------------
// What the page sees: a structure to open, and the objects it is editing.

/// A structure Office asked Meno to open: the object it is, what it holds,
/// and what the document calls it.
#[derive(Serialize, Clone, Debug)]
pub struct OpenRequest {
    pub id: u32,
    pub record: String,
    pub name: String,
}

/// Structures asked for and not yet opened: kept until the page takes them,
/// as a Meno Windows has just started has no page yet to tell.
static PENDING: Mutex<Vec<OpenRequest>> = Mutex::new(Vec::new());

static APP: OnceLock<AppHandle> = OnceLock::new();
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

/// How many of this Meno's objects Office holds, open in a tab or not. A
/// Meno Windows started for Office goes once none is left and nothing else
/// is open: Office also starts one only to have an object's picture.
static LIVE: AtomicUsize = AtomicUsize::new(0);

/// An object held while it is open in a tab, so that the page's edits reach
/// it. (Its interfaces are used only from threads of COM's multithreaded
/// apartment - see `OUT` - which may use them from any of those threads.)
struct Held(ComObject<Structure>);
// SAFETY: as above.
unsafe impl Send for Held {}

/// The objects open in tabs, by number, until their tabs close.
static OPEN: Mutex<Vec<(u32, Held)>> = Mutex::new(Vec::new());

type Job = Box<dyn FnOnce() + Send>;

/// The calls Meno makes to Office, one after another, from a thread of
/// COM's multithreaded apartment. The objects are free-threaded, as
/// `#[implement]` makes every object: Office's calls arrive on that
/// apartment's threads, and the interfaces it hands over belong there - not
/// on the window's thread, where the page's commands are handled.
static OUT: OnceLock<Mutex<mpsc::Sender<Job>>> = OnceLock::new();

fn out(job: Job) {
    if let Some(tx) = OUT.get() {
        let _ = tx.lock().unwrap().send(job);
    }
}

/// Starts serving the class, on the main thread, as the app starts.
pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let (tx, rx) = mpsc::channel::<Job>();
    let _ = OUT.set(Mutex::new(tx));
    std::thread::spawn(move || {
        // SAFETY: this thread's own apartment, for as long as it runs.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        for job in rx {
            job();
        }
    });
    // SAFETY: the main thread, which the webview has already made a
    // single-threaded apartment; OLE on top of it is what serving needs.
    unsafe {
        if let Err(e) = OleInitialize(None) {
            crate::logfile::logged!("OLE could not be started: {e}");
            return;
        }
        let factory: IClassFactory = Factory.into();
        match CoRegisterClassObject(&CLSID_STRUCTURE, &factory, CLSCTX_LOCAL_SERVER, REGCLS_MULTIPLEUSE) {
            // (kept for the life of the process, as Meno serves until it quits)
            Ok(_) => std::mem::forget(factory),
            Err(e) => crate::logfile::logged!("Meno structures cannot be served to Office: {e}"),
        }
    }
}

/// Whether Windows started this Meno for Office: a double-click on a
/// structure in a document while Meno was not running. (Such a Meno goes
/// again once the document is done with it and nothing else is open.)
pub fn started_for_office() -> bool {
    std::env::args().skip(1).any(|a| a.eq_ignore_ascii_case("-Embedding") || a.eq_ignore_ascii_case("/Embedding"))
}

/// Whether Office holds any of this Meno's objects still.
pub fn in_use() -> bool {
    LIVE.load(Ordering::SeqCst) > 0 || !OPEN.lock().unwrap().is_empty()
}

/// An object let go: when it was the last, the page is told ("ole-idle"),
/// so that a Meno started for Office can go.
fn object_gone() {
    if LIVE.fetch_sub(1, Ordering::SeqCst) == 1 && started_for_office() {
        if let Some(app) = APP.get() {
            let _ = app.emit("ole-idle", ());
        }
    }
}

/// As Meno quits: each structure still open from a document goes back into
/// it and is let go, so that the document is not left waiting on a Meno
/// that has gone. (A little while is waited for this, not for ever.)
pub fn shutdown() {
    let open: Vec<(u32, Held)> = std::mem::take(&mut *OPEN.lock().unwrap());
    if open.is_empty() {
        return;
    }
    let (done, finished) = mpsc::channel();
    std::thread::spawn(move || {
        // SAFETY: this thread's own apartment.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        for (_, held) in open {
            held.0.finish(true);
        }
        let _ = done.send(());
    });
    let _ = finished.recv_timeout(std::time::Duration::from_secs(3));
}

/// The page takes the structures asked for since it last looked.
pub fn take_pending() -> Vec<OpenRequest> {
    std::mem::take(&mut *PENDING.lock().unwrap())
}

fn held(id: u32) -> Option<Held> {
    OPEN.lock().unwrap().iter().find(|(i, _)| *i == id).map(|(_, h)| Held(h.0.clone()))
}

/// The page has drawn the structure afresh: the document takes it now.
pub fn update(id: u32, record: String, emf: Vec<u8>) -> Result<(), String> {
    let obj = held(id).ok_or("the document no longer has this structure open")?;
    // (the whole Held moves, not just what it holds)
    out(Box::new(move || {
        let obj = obj;
        obj.0.changed(record, emf)
    }));
    Ok(())
}

/// The page is done with the structure (its tab closed).
pub fn close(id: u32) -> Result<(), String> {
    if let Some(obj) = held(id) {
        out(Box::new(move || {
            let obj = obj;
            obj.0.finish(true)
        }));
    }
    Ok(())
}

fn emit(event: &str, id: u32) {
    if let Some(app) = APP.get() {
        let _ = app.emit(event, id);
        if event == "ole-open" {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// The object.

/// Someone to be told of a new picture: which, how (`advf`), and the sink.
struct DataSink {
    cookie: u32,
    format: FORMATETC,
    advf: u32,
    sink: Agile<IAdviseSink>,
}

// [MS-OLEDS]/objidl: how a data sink is to be told
const ADVF_NODATA: u32 = 1;
const ADVF_PRIMEFIRST: u32 = 2;
const ADVF_ONLYONCE: u32 = 4;
const ADVF_DATAONSTOP: u32 = 64;

#[derive(Default)]
struct State {
    record: String,
    emf: Vec<u8>,
    // What Office hands over, kept so that any thread can use it (see OUT):
    // its site for the object, and who to tell when it is saved or closed
    // or its picture changes. (OLE's own advise holders cannot be kept so,
    // so the sinks are kept here instead.)
    site: Option<Agile<IOleClientSite>>,
    ole_sinks: Vec<(u32, Agile<IAdviseSink>)>,
    data_sinks: Vec<DataSink>,
    next_cookie: u32,
    storage: Option<IStorage>,
    /// What the document calls it, for the tab.
    name: String,
    dirty: bool,
    /// Open in a tab.
    open: bool,
}

/// A structure in a document. Office's calls may arrive on any of COM's
/// threads, so what it holds is behind a lock - never held while calling
/// out, as Office calls back in while those calls are being made.
#[implement(IOleObject, IDataObject, IPersistStorage)]
struct Structure {
    id: u32,
    state: Mutex<State>,
}

impl Drop for Structure {
    fn drop(&mut self) {
        object_gone();
    }
}

impl Structure {
    fn st(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// The size of an EMF's frame, in hundredths of a millimetre - which is what
/// OLE measures objects in (HIMETRIC).
fn emf_extent(emf: &[u8]) -> Option<SIZE> {
    let at = |i: usize| emf.get(i..i + 4).map(|b| i32::from_le_bytes([b[0], b[1], b[2], b[3]]));
    let (l, t, r, b) = (at(24)?, at(28)?, at(32)?, at(36)?);
    Some(SIZE { cx: r - l, cy: b - t })
}

/// How much larger than it says Office takes a picture to be on this
/// screen, when it measures one it has asked for (saving an object after an
/// edit, or copying it): it takes the frame's hundredths of a millimetre to
/// pixels by the screen's physical size, and the pixels back by its logical
/// DPI. The two seldom agree - 0.98 on the desktop screen this was found
/// on, 1.6 seen over Remote Desktop - and a structure edited and saved
/// changed size by as much.
fn screen_skew() -> f64 {
    use windows::Win32::Graphics::Gdi::{GetDC, GetDeviceCaps, ReleaseDC, HORZRES, HORZSIZE, LOGPIXELSX, LOGPIXELSY, VERTRES, VERTSIZE};
    // SAFETY: the screen's DC, released here.
    let (kx, ky) = unsafe {
        let dc = GetDC(None);
        let c = |i| GetDeviceCaps(Some(dc), i) as f64;
        let k = (25.4 * c(HORZRES) / (c(HORZSIZE) * c(LOGPIXELSX)), 25.4 * c(VERTRES) / (c(VERTSIZE) * c(LOGPIXELSY)));
        ReleaseDC(None, dc);
        k
    };
    let k = (kx * ky).sqrt();
    // (a screen that gives no size, or one past believing: taken at its word)
    if k.is_finite() && (0.2..5.0).contains(&k) {
        k
    } else {
        1.0
    }
}

/// Meno's EMF drawn `f` times as large: its frame and bounds, its GDI
/// records through the window they are drawn in, its EMF+ records through
/// their page's scale. It looks the same in any box it is put in; only the
/// size it says it is changes. None for an EMF not drawn as Meno draws one.
fn scaled_emf(emf: &[u8], f: f64) -> Option<Vec<u8>> {
    if (f - 1.0).abs() < 1e-4 {
        return None;
    }
    let mut e = emf.to_vec();
    let get = |e: &[u8], at: usize| e.get(at..at + 4).map(|b| i32::from_le_bytes([b[0], b[1], b[2], b[3]]));
    let put = |e: &mut [u8], at: usize, v: i32| e[at..at + 4].copy_from_slice(&v.to_le_bytes());
    let scale = |e: &mut [u8], at: usize| {
        let v = f32::from_le_bytes([e[at], e[at + 1], e[at + 2], e[at + 3]]);
        e[at..at + 4].copy_from_slice(&((f64::from(v) * f) as f32).to_le_bytes());
    };
    // the header: bounds (pixels, both ends in) and frame (hundredths of a mm)
    if get(&e, 0)? != 1 || get(&e, 40)? != 0x464d4520 {
        return None;
    }
    for at in [16, 20] {
        let v = get(&e, at)?;
        put(&mut e, at, (f64::from(v + 1) * f).round() as i32 - 1);
    }
    for at in [32, 36] {
        let v = get(&e, at)?;
        put(&mut e, at, (f64::from(v) * f).round() as i32);
    }
    let mut window = false;
    let mut at = get(&e, 4)? as usize;
    while at + 8 <= e.len() {
        let (kind, size) = (get(&e, at)?, get(&e, at + 4)? as usize);
        if size < 8 || at + size > e.len() {
            return None;
        }
        match kind {
            // EMR_SETWINDOWEXTEX: a larger window, a smaller drawing
            9 if size >= 16 => {
                for i in [at + 8, at + 12] {
                    let v = get(&e, i)?;
                    put(&mut e, i, (f64::from(v) / f).round() as i32);
                }
                window = true;
            }
            // EMR_EXTTEXTOUTW: its scales, from the unit to hundredths of a mm
            84 if size >= 36 => {
                scale(&mut e, at + 28);
                scale(&mut e, at + 32);
            }
            // EMR_COMMENT with EMF+ records: EmfPlusSetPageTransform's scale
            70 if size >= 16 && get(&e, at + 12)? == 0x2b464d45 => {
                let end = (at + 12 + get(&e, at + 8)? as usize).min(at + size);
                let mut r = at + 16;
                while r + 12 <= end {
                    let (plus, length) = (u16::from_le_bytes([e[r], e[r + 1]]), get(&e, r + 4)? as usize);
                    if length < 12 {
                        break;
                    }
                    if plus == 0x4030 && length >= 16 {
                        scale(&mut e, r + 12);
                    }
                    r += length;
                }
            }
            _ => {}
        }
        at += size;
    }
    window.then_some(e)
}

/// The picture of a structure not drawn yet: a light frame, 2 by 1.5 cm,
/// so that there is something to see and to take hold of in the document.
fn placeholder_emf() -> Vec<u8> {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::Graphics::Gdi::{
        CloseEnhMetaFile, CreateEnhMetaFileW, CreatePen, DeleteEnhMetaFile, DeleteObject, GetDeviceCaps,
        GetEnhMetaFileBits, GetStockObject, Rectangle, SelectObject, LOGPIXELSX, LOGPIXELSY, NULL_BRUSH, PS_SOLID,
    };
    let (w, h) = (2000, 1500); // hundredths of a millimetre
    // SAFETY: a metafile's DC of this function's own, closed and freed here.
    unsafe {
        let frame = RECT { left: 0, top: 0, right: w, bottom: h };
        let dc = CreateEnhMetaFileW(None, PCWSTR::null(), Some(&frame), PCWSTR::null());
        // (drawn in the reference device's pixels)
        let px = |hmm: i32, dpi: i32| hmm * dpi / 2540;
        let (x, y) = (px(w, GetDeviceCaps(Some(dc), LOGPIXELSX)), px(h, GetDeviceCaps(Some(dc), LOGPIXELSY)));
        let pen = CreatePen(PS_SOLID, 1, COLORREF(0x00c8c8c8));
        let _ = SelectObject(dc, pen.into());
        let _ = SelectObject(dc, GetStockObject(NULL_BRUSH));
        let _ = Rectangle(dc, 0, 0, x, y);
        let emf = CloseEnhMetaFile(dc);
        let _ = DeleteObject(pen.into());
        let mut bytes = vec![0u8; GetEnhMetaFileBits(emf, None) as usize];
        GetEnhMetaFileBits(emf, Some(&mut bytes));
        let _ = DeleteEnhMetaFile(Some(emf));
        bytes
    }
}

fn emf_format() -> FORMATETC {
    FORMATETC {
        cfFormat: CF_ENHMETAFILE.0,
        ptd: std::ptr::null_mut(),
        dwAspect: DVASPECT_CONTENT.0,
        lindex: -1,
        tymed: TYMED_ENHMF.0 as u32,
    }
}

fn record_format() -> u16 {
    // SAFETY: a NUL-terminated wide string.
    unsafe { RegisterClipboardFormatW(RECORD_FORMAT) as u16 }
}

fn read_stream(stg: &IStorage, name: PCWSTR) -> windows::core::Result<Vec<u8>> {
    // SAFETY: a stream opened for reading, read into a buffer of its size.
    unsafe {
        let s: IStream = stg.OpenStream(name, None, STGM_READ | STGM_SHARE_EXCLUSIVE, 0)?;
        let mut stat = STATSTG::default();
        s.Stat(&mut stat, STATFLAG_NONAME)?;
        let mut buf = vec![0u8; stat.cbSize as usize];
        let mut read = 0u32;
        s.Read(buf.as_mut_ptr().cast(), buf.len() as u32, Some(&mut read)).ok()?;
        buf.truncate(read as usize);
        Ok(buf)
    }
}

fn write_stream(stg: &IStorage, name: PCWSTR, data: &[u8]) -> windows::core::Result<()> {
    // SAFETY: a stream made afresh, written from a live buffer.
    unsafe {
        let s: IStream = stg.CreateStream(name, STGM_CREATE | STGM_WRITE | STGM_SHARE_EXCLUSIVE, 0, 0)?;
        s.Write(data.as_ptr().cast(), data.len() as u32, None).ok()
    }
}

/// An object's own part of its storage: its class, and what it holds.
pub(crate) fn write_object(stg: &IStorage, record: &str, emf: &[u8]) -> windows::core::Result<()> {
    let user_type = wide(USER_TYPE);
    // SAFETY: a live storage, and NUL-terminated strings.
    unsafe {
        WriteClassStg(stg, &CLSID_STRUCTURE)?;
        WriteFmtUserTypeStg(stg, record_format(), PCWSTR(user_type.as_ptr()))?;
    }
    write_stream(stg, RECORD_STREAM, record.as_bytes())?;
    write_stream(stg, PICTURE_STREAM, emf)
}

impl Structure_Impl {
    fn site(&self) -> Option<IOleClientSite> {
        let site = self.st().site.clone();
        site.and_then(|a| a.resolve().ok())
    }

    fn ole_sinks(&self) -> Vec<IAdviseSink> {
        let sinks: Vec<_> = self.st().ole_sinks.iter().map(|(_, a)| a.clone()).collect();
        sinks.into_iter().filter_map(|a| a.resolve().ok()).collect()
    }

    /// The picture as it is handed over: as it is, to those watching it -
    /// Office takes what it is sent at its word - and, when Office asks for
    /// it (`asked`), drawn to Office's measure of the screen, by which it
    /// sizes what it asks for (`screen_skew`).
    fn picture(&self, format: &FORMATETC, asked: bool) -> windows::core::Result<STGMEDIUM> {
        if format.cfFormat != CF_ENHMETAFILE.0 || format.tymed & TYMED_ENHMF.0 as u32 == 0 {
            return Err(DV_E_FORMATETC.into());
        }
        let s = self.st();
        if s.emf.is_empty() {
            return Err(E_FAIL.into());
        }
        let skewed = if asked { scaled_emf(&s.emf, 1.0 / screen_skew()) } else { None };
        let emf = skewed.as_deref().unwrap_or(&s.emf);
        // SAFETY: an EMF's bytes; the handle is the caller's once handed over.
        let hemf = unsafe { SetEnhMetaFileBits(emf) };
        if hemf.is_invalid() {
            return Err(E_FAIL.into());
        }
        Ok(STGMEDIUM { tymed: TYMED_ENHMF.0 as u32, u: STGMEDIUM_0 { hEnhMetaFile: hemf }, pUnkForRelease: Default::default() })
    }

    /// The picture, to those who asked to be told of it: when it changes, or
    /// (for those who asked for that) when the object stops.
    fn send_picture(&self, stopping: bool) {
        let sinks: Vec<_> = self
            .st()
            .data_sinks
            .iter()
            // (as it stops, everyone; before then, those not waiting for it to)
            .filter(|d| stopping || d.advf & ADVF_DATAONSTOP == 0)
            .map(|d| (d.cookie, d.format, d.advf, d.sink.clone()))
            .collect();
        for (cookie, format, advf, sink) in sinks {
            let Ok(sink) = sink.resolve() else { continue };
            let medium = if advf & ADVF_NODATA != 0 {
                Ok(STGMEDIUM { tymed: 0, u: STGMEDIUM_0 { hGlobal: HGLOBAL::default() }, pUnkForRelease: Default::default() })
            } else {
                self.picture(&format, false)
            };
            let Ok(mut medium) = medium else { continue };
            // SAFETY: a live sink, and a medium released after it has been read.
            unsafe {
                sink.OnDataChange(&format, &medium);
                ReleaseStgMedium(&mut medium);
            }
            if advf & ADVF_ONLYONCE != 0 {
                self.st().data_sinks.retain(|d| d.cookie != cookie);
            }
        }
    }

    /// A new drawing from the page: those watching the picture are given
    /// it, and the document is asked to save the object. (No lock is held
    /// across the calls out: Office calls back in while they are made.)
    fn changed(&self, record: String, emf: Vec<u8>) {
        {
            let mut s = self.st();
            s.record = record;
            s.emf = emf;
            s.dirty = true;
        }
        self.send_picture(false);
        if let Some(site) = self.site() {
            // SAFETY: a live interface, from COM's multithreaded apartment.
            let _ = unsafe { site.SaveObject() };
        }
    }

    /// Done with: saved if it changed and `save`, the document told, and
    /// the tab (if Office asked for this) closed.
    fn finish(&self, save: bool) {
        OPEN.lock().unwrap().retain(|(i, _)| *i != self.id);
        let (dirty, open) = {
            let mut s = self.st();
            let was = (s.dirty, s.open);
            s.open = false;
            was
        };
        self.send_picture(true);
        // SAFETY: live interfaces, as for `changed`.
        unsafe {
            if let Some(site) = self.site() {
                if save && dirty {
                    let _ = site.SaveObject();
                }
                if open {
                    let _ = site.OnShowWindow(false);
                }
            }
            for sink in self.ole_sinks() {
                sink.OnClose();
            }
            let me: IUnknown = self.to_object().to_interface();
            let _ = CoDisconnectObject(&me, None);
        }
    }
}

impl IOleObject_Impl for Structure_Impl {
    fn SetClientSite(&self, site: Ref<'_, IOleClientSite>) -> windows::core::Result<()> {
        self.st().site = site.as_ref().and_then(|s| Agile::new(s).ok());
        Ok(())
    }
    fn GetClientSite(&self) -> windows::core::Result<IOleClientSite> {
        let site = self.st().site.clone();
        site.ok_or_else(|| windows::core::Error::from(E_FAIL))?.resolve()
    }
    fn SetHostNames(&self, _app: &PCWSTR, object: &PCWSTR) -> windows::core::Result<()> {
        // SAFETY: a NUL-terminated wide string, or null.
        let name = unsafe { if object.is_null() { String::new() } else { object.to_string().unwrap_or_default() } };
        // (a document's file name, not the folders it is in)
        let name = name.rsplit(['\\', '/']).next().unwrap_or_default().to_string();
        self.st().name = name;
        Ok(())
    }
    fn Close(&self, option: &OLECLOSE) -> windows::core::Result<()> {
        let open = self.st().open;
        self.finish(*option != OLECLOSE_NOSAVE);
        if open {
            emit("ole-close", self.id);
        }
        Ok(())
    }
    fn SetMoniker(&self, _: &OLEWHICHMK, _: Ref<'_, IMoniker>) -> windows::core::Result<()> {
        Ok(())
    }
    fn GetMoniker(&self, _: &OLEGETMONIKER, _: &OLEWHICHMK) -> windows::core::Result<IMoniker> {
        Err(E_NOTIMPL.into())
    }
    fn InitFromData(&self, _: Ref<'_, IDataObject>, _: BOOL, _: u32) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
    fn GetClipboardData(&self, _: u32) -> windows::core::Result<IDataObject> {
        Err(E_NOTIMPL.into())
    }
    fn DoVerb(
        &self,
        verb: i32,
        _msg: *const MSG,
        active: Ref<'_, IOleClientSite>,
        _index: i32,
        _parent: HWND,
        _rect: *const RECT,
    ) -> windows::core::Result<()> {
        if verb == OLEIVERB_HIDE.0 {
            return Ok(());
        }
        // Every other verb opens it: Meno does not edit inside the document.
        if self.st().site.is_none() {
            self.st().site = active.as_ref().and_then(|s| Agile::new(s).ok());
        }
        let (was_open, request) = {
            let mut s = self.st();
            let was = s.open;
            s.open = true;
            (was, OpenRequest { id: self.id, record: s.record.clone(), name: s.name.clone() })
        };
        if !was_open {
            OPEN.lock().unwrap().push((self.id, Held(self.to_object())));
            PENDING.lock().unwrap().push(request);
        }
        emit("ole-open", self.id);
        if let Some(site) = self.site() {
            // SAFETY: a live interface.
            unsafe {
                let _ = site.ShowObject();
                let _ = site.OnShowWindow(true);
            }
        }
        Ok(())
    }
    fn EnumVerbs(&self) -> windows::core::Result<IEnumOLEVERB> {
        // SAFETY: a plain call.
        unsafe { OleRegEnumVerbs(&CLSID_STRUCTURE) }
    }
    fn Update(&self) -> windows::core::Result<()> {
        Ok(())
    }
    fn IsUpToDate(&self) -> windows::core::Result<()> {
        Ok(())
    }
    fn GetUserClassID(&self) -> windows::core::Result<GUID> {
        Ok(CLSID_STRUCTURE)
    }
    fn GetUserType(&self, form: &USERCLASSTYPE) -> windows::core::Result<PWSTR> {
        // SAFETY: a plain call; the string is the caller's to free.
        unsafe { OleRegGetUserType(&CLSID_STRUCTURE, *form) }
    }
    fn SetExtent(&self, _: windows::Win32::System::Com::DVASPECT, _: *const SIZE) -> windows::core::Result<()> {
        // Its size is the picture's, which the drawing style sets: a size the
        // document asks for is taken and left, and the next picture says
        // what it is. (Refusing it makes Insert > Object fail.)
        Ok(())
    }
    fn GetExtent(&self, _: windows::Win32::System::Com::DVASPECT) -> windows::core::Result<SIZE> {
        emf_extent(&self.st().emf).ok_or_else(|| E_FAIL.into())
    }
    fn Advise(&self, sink: Ref<'_, IAdviseSink>) -> windows::core::Result<u32> {
        let sink = Agile::new(sink.ok()?)?;
        let mut s = self.st();
        s.next_cookie += 1;
        let cookie = s.next_cookie;
        s.ole_sinks.push((cookie, sink));
        Ok(cookie)
    }
    fn Unadvise(&self, connection: u32) -> windows::core::Result<()> {
        let mut s = self.st();
        let before = s.ole_sinks.len();
        s.ole_sinks.retain(|(c, _)| *c != connection);
        if s.ole_sinks.len() == before { Err(OLE_E_NOCONNECTION.into()) } else { Ok(()) }
    }
    fn EnumAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
        Err(E_NOTIMPL.into())
    }
    fn GetMiscStatus(&self, _: windows::Win32::System::Com::DVASPECT) -> windows::core::Result<OLEMISC> {
        Ok(OLEMISC(0))
    }
    fn SetColorScheme(&self, _: *const LOGPALETTE) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
}

impl IDataObject_Impl for Structure_Impl {
    fn GetData(&self, format: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
        // SAFETY: a FORMATETC the caller owns.
        let f = unsafe { format.as_ref() }.ok_or(E_POINTER)?;
        self.picture(f, true)
    }
    fn GetDataHere(&self, format: *const FORMATETC, medium: *mut STGMEDIUM) -> windows::core::Result<()> {
        // SAFETY: the caller's FORMATETC and STGMEDIUM.
        let (f, m) = unsafe { (format.as_ref().ok_or(E_POINTER)?, medium.as_mut().ok_or(E_POINTER)?) };
        if f.tymed & TYMED_ISTORAGE.0 as u32 == 0 || m.tymed != TYMED_ISTORAGE.0 as u32 {
            return Err(DV_E_TYMED.into());
        }
        // SAFETY: a storage the caller made for this.
        let stg = unsafe { m.u.pstg.as_ref() }.ok_or(E_POINTER)?;
        let s = self.st();
        write_object(stg, &s.record, &s.emf)
    }
    fn QueryGetData(&self, format: *const FORMATETC) -> HRESULT {
        // SAFETY: as for `GetData`.
        match unsafe { format.as_ref() } {
            Some(f) if f.cfFormat == CF_ENHMETAFILE.0 && f.tymed & TYMED_ENHMF.0 as u32 != 0 => S_OK,
            _ => DV_E_FORMATETC,
        }
    }
    fn GetCanonicalFormatEtc(&self, _: *const FORMATETC, out: *mut FORMATETC) -> HRESULT {
        // SAFETY: the caller's FORMATETC.
        if let Some(o) = unsafe { out.as_mut() } {
            o.ptd = std::ptr::null_mut();
        }
        DATA_S_SAMEFORMATETC
    }
    fn SetData(&self, _: *const FORMATETC, _: *const STGMEDIUM, _: BOOL) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
    fn EnumFormatEtc(&self, direction: u32) -> windows::core::Result<IEnumFORMATETC> {
        // SAFETY: a plain call.
        unsafe { OleRegEnumFormatEtc(&CLSID_STRUCTURE, direction) }
    }
    fn DAdvise(&self, format: *const FORMATETC, advf: u32, sink: Ref<'_, IAdviseSink>) -> windows::core::Result<u32> {
        // SAFETY: the caller's FORMATETC.
        let mut format = *unsafe { format.as_ref() }.ok_or(E_POINTER)?;
        if format.cfFormat != CF_ENHMETAFILE.0 {
            return Err(DV_E_FORMATETC.into());
        }
        format.ptd = std::ptr::null_mut(); // (no target device is kept)
        let sink = Agile::new(sink.ok()?)?;
        let cookie = {
            let mut s = self.st();
            s.next_cookie += 1;
            let cookie = s.next_cookie;
            s.data_sinks.push(DataSink { cookie, format, advf, sink: sink.clone() });
            cookie
        };
        if advf & ADVF_PRIMEFIRST != 0 && !self.st().emf.is_empty() {
            if let (Ok(sink), Ok(mut medium)) = (sink.resolve(), self.picture(&format, false)) {
                // SAFETY: as in `send_picture`.
                unsafe {
                    sink.OnDataChange(&format, &medium);
                    ReleaseStgMedium(&mut medium);
                }
            }
        }
        Ok(cookie)
    }
    fn DUnadvise(&self, connection: u32) -> windows::core::Result<()> {
        let mut s = self.st();
        let before = s.data_sinks.len();
        s.data_sinks.retain(|d| d.cookie != connection);
        if s.data_sinks.len() == before { Err(OLE_E_NOCONNECTION.into()) } else { Ok(()) }
    }
    fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
        Err(E_NOTIMPL.into())
    }
}

impl IPersist_Impl for Structure_Impl {
    fn GetClassID(&self) -> windows::core::Result<GUID> {
        Ok(CLSID_STRUCTURE)
    }
}

impl IPersistStorage_Impl for Structure_Impl {
    fn IsDirty(&self) -> HRESULT {
        if self.st().dirty { S_OK } else { S_FALSE }
    }
    fn InitNew(&self, stg: Ref<'_, IStorage>) -> windows::core::Result<()> {
        // Insert > Object: an empty structure, drawn in Meno. Until it is,
        // the document shows a light frame rather than nothing at all.
        let mut s = self.st();
        s.storage = stg.cloned();
        s.emf = placeholder_emf();
        Ok(())
    }
    fn Load(&self, stg: Ref<'_, IStorage>) -> windows::core::Result<()> {
        let stg = stg.cloned().ok_or(E_POINTER)?;
        let record = read_stream(&stg, RECORD_STREAM)?;
        let emf = read_stream(&stg, PICTURE_STREAM).unwrap_or_default();
        let mut s = self.st();
        s.record = String::from_utf8_lossy(&record).into_owned();
        s.emf = emf;
        s.storage = Some(stg);
        Ok(())
    }
    fn Save(&self, stg: Ref<'_, IStorage>, _same: BOOL) -> windows::core::Result<()> {
        let stg = stg.cloned().ok_or(E_POINTER)?;
        let s = self.st();
        write_object(&stg, &s.record, &s.emf)
    }
    fn SaveCompleted(&self, stg: Ref<'_, IStorage>) -> windows::core::Result<()> {
        {
            let mut s = self.st();
            if let Some(stg) = stg.cloned() {
                s.storage = Some(stg);
            }
            s.dirty = false;
        }
        for sink in self.ole_sinks() {
            // SAFETY: a live sink.
            unsafe { sink.OnSave() };
        }
        Ok(())
    }
    fn HandsOffStorage(&self) -> windows::core::Result<()> {
        self.st().storage = None;
        Ok(())
    }
}

#[implement(IClassFactory)]
struct Factory;

impl IClassFactory_Impl for Factory_Impl {
    fn CreateInstance(
        &self,
        outer: Ref<'_, IUnknown>,
        iid: *const GUID,
        out: *mut *mut core::ffi::c_void,
    ) -> windows::core::Result<()> {
        if out.is_null() {
            return Err(E_POINTER.into());
        }
        // SAFETY: the caller's out pointer.
        unsafe { *out = std::ptr::null_mut() };
        if outer.is_some() {
            return Err(CLASS_E_NOAGGREGATION.into());
        }
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        LIVE.fetch_add(1, Ordering::SeqCst); // (given back as it drops)
        let obj = ComObject::new(Structure { id, state: Mutex::new(State::default()) });
        let unknown: IUnknown = obj.to_interface();
        // SAFETY: the caller's IID and out pointer.
        unsafe { unknown.query(iid, out).ok() }
    }
    fn LockServer(&self, _lock: BOOL) -> windows::core::Result<()> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// The clipboard: an object for Office to embed, beside the pictures, and the
// record read back out of an object Office copied.

/// The storage Office embeds a structure from ("Embed Source"), as a
/// compound file's bytes: the record, the picture it shows, and that
/// picture again as OLE keeps one to draw from without Meno.
pub fn embed_source(record: &str, emf: &[u8]) -> Result<Vec<u8>, String> {
    embed_source_inner(record, emf).map_err(|e| format!("the structure could not be made an object for Office: {e}"))
}

fn embed_source_inner(record: &str, emf: &[u8]) -> windows::core::Result<Vec<u8>> {
    // SAFETY: storage made on memory of its own, filled and read back while
    // held; the metafile's handle passes to the cache.
    unsafe {
        let bytes = CreateILockBytesOnHGlobal(None, true)?;
        let stg = StgCreateDocfileOnILockBytes(&bytes, STGM_CREATE | STGM_READWRITE | STGM_SHARE_EXCLUSIVE, 0)?;
        // the picture as OLE's own cache has it, from its default handler
        let mut handler: *mut core::ffi::c_void = std::ptr::null_mut();
        OleCreateDefaultHandler(&CLSID_STRUCTURE, None, &IPersistStorage::IID, &mut handler)?;
        let persist = IPersistStorage::from_raw(handler);
        persist.InitNew(&stg)?;
        let cache: IOleCache = persist.cast()?;
        let format = emf_format();
        cache.Cache(&format, 0)?;
        let hemf = SetEnhMetaFileBits(emf);
        if hemf.is_invalid() {
            return Err(E_FAIL.into());
        }
        let medium = STGMEDIUM { tymed: TYMED_ENHMF.0 as u32, u: STGMEDIUM_0 { hEnhMetaFile: hemf }, pUnkForRelease: Default::default() };
        cache.SetData(&format, &medium, true)?;
        persist.Save(&stg, true)?;
        persist.SaveCompleted(None)?;
        if let Some(size) = emf_extent(emf) {
            set_cached_extent(&stg, size)?;
        }
        write_object(&stg, record, emf)?;
        stg.Commit(0)?;
        let mut stat = STATSTG::default();
        bytes.Stat(&mut stat, STATFLAG_NONAME.0 as u32)?;
        let global = GetHGlobalFromILockBytes(&bytes)?;
        let at = GlobalLock(global) as *const u8;
        if at.is_null() {
            return Err(E_FAIL.into());
        }
        let out = std::slice::from_raw_parts(at, stat.cbSize as usize).to_vec();
        let _ = GlobalUnlock(global);
        Ok(out)
    }
}

/// The size OLE's cache gives the picture, set to the picture's own. OLE
/// works it out from the EMF's size in pixels and the size of the screen
/// the copy was made on - 84.85 pt for a 53.4 pt drawing over Remote
/// Desktop at 175% - and Word places the object at whatever it says.
/// ([MS-OLEDS] 2.3.4: the presentation's width and height, in hundredths
/// of a millimetre, after its format, target device, aspect, lindex, advf
/// and a reserved word.)
fn set_cached_extent(stg: &IStorage, size: SIZE) -> windows::core::Result<()> {
    // SAFETY: a stream of the storage, read and written within its length.
    unsafe {
        let s: IStream = stg.OpenStream(w!("\u{2}OlePres000"), None, STGM_READWRITE | STGM_SHARE_EXCLUSIVE, 0)?;
        let mut head = [0u8; 12];
        s.Read(head.as_mut_ptr().cast(), 12, None).ok()?;
        let marker = i32::from_le_bytes(head[0..4].try_into().unwrap());
        if marker != -1 {
            return Ok(()); // (a format by name: not what the cache writes for an EMF)
        }
        let device = u32::from_le_bytes(head[8..12].try_into().unwrap()) as i64;
        let at = 8 + device + 16;
        s.Seek(at, STREAM_SEEK_SET, None)?;
        let wh: Vec<u8> = [size.cx, size.cy].iter().flat_map(|v| v.to_le_bytes()).collect();
        s.Write(wh.as_ptr().cast(), 8, None).ok()?;
        s.Commit(STGC_DEFAULT)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// The clipboard through OLE's own: a data object Meno answers for, so that
// the object for Office is there as the storage it is (not a block of bytes
// that has to be turned back into one), as OLE servers' copies are.

/// What one clipboard format holds, and so the medium it is handed out in.
pub enum ClipData {
    Bytes(Vec<u8>),
    Emf(Vec<u8>),
    /// A compound file's bytes, handed out as the storage it is.
    Storage(Vec<u8>),
}

impl ClipData {
    fn tymed(&self) -> u32 {
        match self {
            ClipData::Bytes(_) => TYMED_HGLOBAL.0 as u32,
            ClipData::Emf(_) => TYMED_ENHMF.0 as u32,
            // (and as bytes, for whoever asks for it so)
            ClipData::Storage(_) => (TYMED_ISTORAGE.0 | TYMED_HGLOBAL.0) as u32,
        }
    }
}

#[implement(IDataObject)]
struct Clip {
    items: Vec<(u16, ClipData)>,
}

fn global(bytes: &[u8]) -> windows::core::Result<HGLOBAL> {
    // SAFETY: a block of its own, filled while locked.
    unsafe {
        let g = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1))?;
        let at = GlobalLock(g) as *mut u8;
        if at.is_null() {
            return Err(E_OUTOFMEMORY.into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), at, bytes.len());
        let _ = GlobalUnlock(g);
        Ok(g)
    }
}

/// A private storage opened on a copy of a compound file's bytes.
fn storage_of(bytes: &[u8]) -> windows::core::Result<IStorage> {
    // SAFETY: memory of its own, which the lock bytes free with themselves.
    unsafe {
        let lock = CreateILockBytesOnHGlobal(Some(global(bytes)?), true)?;
        StgOpenStorageOnILockBytes(&lock, None, STGM_READWRITE | STGM_SHARE_EXCLUSIVE, None, None)
    }
}

impl Clip_Impl {
    fn find(&self, f: &FORMATETC) -> Option<&ClipData> {
        self.items.iter().find(|(cf, d)| *cf == f.cfFormat && d.tymed() & f.tymed != 0).map(|(_, d)| d)
    }
}

impl IDataObject_Impl for Clip_Impl {
    fn GetData(&self, format: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
        // SAFETY: the caller's FORMATETC.
        let f = unsafe { format.as_ref() }.ok_or(E_POINTER)?;
        let data = self.find(f).ok_or(DV_E_FORMATETC)?;
        let (tymed, u) = match data {
            ClipData::Bytes(b) => (TYMED_HGLOBAL, STGMEDIUM_0 { hGlobal: global(b)? }),
            ClipData::Emf(b) => {
                // SAFETY: an EMF's bytes; the handle is the caller's.
                let h = unsafe { SetEnhMetaFileBits(b) };
                if h.is_invalid() {
                    return Err(E_FAIL.into());
                }
                (TYMED_ENHMF, STGMEDIUM_0 { hEnhMetaFile: h })
            }
            ClipData::Storage(b) if f.tymed & TYMED_ISTORAGE.0 as u32 != 0 => {
                (TYMED_ISTORAGE, STGMEDIUM_0 { pstg: std::mem::ManuallyDrop::new(Some(storage_of(b)?)) })
            }
            ClipData::Storage(b) => (TYMED_HGLOBAL, STGMEDIUM_0 { hGlobal: global(b)? }),
        };
        Ok(STGMEDIUM { tymed: tymed.0 as u32, u, pUnkForRelease: Default::default() })
    }
    fn GetDataHere(&self, format: *const FORMATETC, medium: *mut STGMEDIUM) -> windows::core::Result<()> {
        // SAFETY: the caller's FORMATETC and STGMEDIUM.
        let (f, m) = unsafe { (format.as_ref().ok_or(E_POINTER)?, medium.as_mut().ok_or(E_POINTER)?) };
        match self.find(f) {
            Some(ClipData::Storage(b)) if m.tymed == TYMED_ISTORAGE.0 as u32 => {
                // SAFETY: the caller's storage, which the object is copied into.
                let into = unsafe { (*m.u.pstg).clone() }.ok_or(E_POINTER)?;
                unsafe { storage_of(b)?.CopyTo(None, None, &into) }
            }
            Some(_) => Err(DV_E_TYMED.into()),
            None => Err(DV_E_FORMATETC.into()),
        }
    }
    fn QueryGetData(&self, format: *const FORMATETC) -> HRESULT {
        // SAFETY: the caller's FORMATETC.
        match unsafe { format.as_ref() } {
            Some(f) if self.find(f).is_some() => S_OK,
            _ => DV_E_FORMATETC,
        }
    }
    fn GetCanonicalFormatEtc(&self, _: *const FORMATETC, out: *mut FORMATETC) -> HRESULT {
        // SAFETY: the caller's FORMATETC.
        if let Some(o) = unsafe { out.as_mut() } {
            o.ptd = std::ptr::null_mut();
        }
        DATA_S_SAMEFORMATETC
    }
    fn SetData(&self, _: *const FORMATETC, _: *const STGMEDIUM, _: BOOL) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
    fn EnumFormatEtc(&self, direction: u32) -> windows::core::Result<IEnumFORMATETC> {
        if direction != DATADIR_GET.0 as u32 {
            return Err(E_NOTIMPL.into());
        }
        let formats: Vec<FORMATETC> = self
            .items
            .iter()
            .map(|(cf, d)| FORMATETC {
                cfFormat: *cf,
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                // (the storage is offered as a storage)
                tymed: if matches!(d, ClipData::Storage(_)) { TYMED_ISTORAGE.0 as u32 } else { d.tymed() },
            })
            .collect();
        // SAFETY: a plain call.
        unsafe { SHCreateStdEnumFmtEtc(&formats) }
    }
    fn DAdvise(&self, _: *const FORMATETC, _: u32, _: Ref<'_, IAdviseSink>) -> windows::core::Result<u32> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
    fn DUnadvise(&self, _: u32) -> windows::core::Result<()> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
    fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
}

/// Meno's data object while it is what the clipboard holds.
struct HeldClip(IDataObject);
// SAFETY: a free-threaded object of Meno's own, only asked for its data.
unsafe impl Send for HeldClip {}
static CLIP: Mutex<Option<HeldClip>> = Mutex::new(None);

/// Puts `items` on the clipboard through OLE, in place of whatever was there.
/// (On the window's thread, where OLE has been started.)
pub fn set_clipboard(items: Vec<(u16, ClipData)>) -> Result<(), String> {
    let data: IDataObject = Clip { items }.into();
    // Another program may hold the clipboard for a moment, as for the rest.
    let mut tries = 0;
    // SAFETY: the main thread, where OLE was started.
    while let Err(e) = unsafe { OleSetClipboard(&data) } {
        tries += 1;
        if e.code() != CLIPBRD_E_CANT_OPEN || tries == 10 {
            return Err(format!("the clipboard would not take the structure: {e}"));
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    *CLIP.lock().unwrap() = Some(HeldClip(data));
    Ok(())
}

/// As Meno quits: what it put on the clipboard stays there without it.
pub fn flush_clipboard() {
    if let Some(HeldClip(data)) = CLIP.lock().unwrap().take() {
        #[link(name = "ole32")]
        extern "system" {
            // (raw: the wrapped one takes S_FALSE, not current, for success)
            fn OleIsCurrentClipboard(data: *mut core::ffi::c_void) -> HRESULT;
        }
        // SAFETY: the main thread, where OLE was started; a live object.
        unsafe {
            if OleIsCurrentClipboard(data.as_raw()) == S_OK {
                let _ = OleFlushClipboard();
            }
        }
    }
}

/// What tells Office about the object on the clipboard ("Object
/// Descriptor"): its class, its size, and what to call it.
pub fn object_descriptor(emf: &[u8]) -> Vec<u8> {
    let size = emf_extent(emf).unwrap_or_default();
    let full = wide(USER_TYPE);
    let source = wide(SHORT_TYPE);
    let head = std::mem::size_of::<OBJECTDESCRIPTOR>();
    let d = OBJECTDESCRIPTOR {
        cbSize: (head + 2 * (full.len() + source.len())) as u32,
        clsid: CLSID_STRUCTURE,
        dwDrawAspect: DVASPECT_CONTENT.0,
        sizel: size,
        pointl: Default::default(),
        dwStatus: 0,
        dwFullUserTypeName: head as u32,
        dwSrcOfCopy: (head + 2 * full.len()) as u32,
    };
    // SAFETY: a plain struct, read as the bytes it is.
    let mut out = unsafe { std::slice::from_raw_parts((&d as *const OBJECTDESCRIPTOR).cast::<u8>(), head) }.to_vec();
    out.extend(full.iter().chain(&source).flat_map(|c| c.to_le_bytes()));
    out
}

/// Meno's record out of an object's storage on the clipboard (a compound
/// file's bytes), if the object is a Meno structure.
pub fn record_in_object(bytes: &[u8]) -> Option<String> {
    record_in_storage(&storage_of(bytes).ok()?)
}

/// Meno's record out of an object's storage, if the object is a Meno
/// structure: one copied (`record_in_object`), or one dragged (drop.rs).
pub fn record_in_storage(stg: &IStorage) -> Option<String> {
    String::from_utf8(read_stream(stg, RECORD_STREAM).ok()?).ok()
}

/// A data object holding `items`, as the clipboard's (for tests elsewhere).
#[cfg(test)]
pub(crate) fn clip_object(items: Vec<(u16, ClipData)>) -> IDataObject {
    Clip { items }.into()
}

/// A picture to make objects of (for tests elsewhere).
#[cfg(test)]
pub(crate) fn test_emf() -> Vec<u8> {
    placeholder_emf()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_class_is_registered_under_its_names() {
        let e = registry_entries(r"C:\Meno\Meno.exe");
        let get = |k: &str| e.iter().find(|(key, _, _)| key == k).map(|(_, _, v)| v.as_str());
        let clsid = format!(r"CLSID\{CLSID_TEXT}");
        assert_eq!(get(&format!(r"{clsid}\LocalServer32")), Some(r#""C:\Meno\Meno.exe""#));
        assert_eq!(get(&format!(r"{PROG_ID}\CLSID")), Some(CLSID_TEXT));
        assert_eq!(get(&format!(r"{clsid}\ProgID")), Some(PROG_ID));
        assert_eq!(get(&format!(r"{clsid}\Verb\0")), Some("&Edit,0,2"));
        assert_eq!(format!("{{{:?}}}", CLSID_STRUCTURE).to_uppercase(), CLSID_TEXT);
    }

    #[test]
    fn the_msi_writes_the_keys_meno_writes() {
        let wxs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/windows/ole.wxs")).unwrap();
        let attr = |line: &str, name: &str| -> Option<String> {
            let at = line.find(&format!(" {name}=\""))? + name.len() + 3;
            let end = line[at..].find('"')? + at;
            Some(line[at..end].replace("&quot;", "\"").replace("&amp;", "&"))
        };
        // a component's (key, value)s: values, and keys made empty
        let component = |id: &str| -> Vec<(String, String)> {
            let start = wxs.find(&format!("<Component Id=\"{id}\"")).unwrap();
            let end = start + wxs[start..].find("</Component>").unwrap();
            let mut found: Vec<(String, String)> = wxs[start..end]
                .lines()
                .filter_map(|l| {
                    let key = attr(l, "Key")?.strip_prefix(r"Software\Classes\")?.to_string();
                    if l.contains("<RegistryValue") {
                        Some((key, attr(l, "Value")?))
                    } else if l.contains("ForceCreateOnInstall") && !l.contains("ForceDeleteOnUninstall") {
                        Some((key, String::new()))
                    } else {
                        None
                    }
                })
                .collect();
            found.sort();
            found
        };
        let mut expected: Vec<(String, String)> =
            registry_entries("[INSTALLDIR]Meno.exe").into_iter().map(|(k, _, v)| (k, v)).collect();
        expected.sort();
        assert_eq!(component("MenoOleClass"), expected);
        // the class's own keys again, in the 32-bit view
        let classes: Vec<_> = expected.into_iter().filter(|(k, _)| k.starts_with("CLSID")).collect();
        assert_eq!(component("MenoOleClass32"), classes);
    }

    #[test]
    fn a_structure_not_drawn_yet_shows_a_frame() {
        let emf = placeholder_emf();
        let size = emf_extent(&emf).unwrap();
        // (GDI fits the frame to its device, to within a pixel or so)
        assert!((size.cx - 2000).abs() <= 40 && (size.cy - 1500).abs() <= 40, "{:?}", (size.cx, size.cy));
        // SAFETY: bytes that should be an EMF; the handle is freed here.
        unsafe {
            let h = SetEnhMetaFileBits(&emf);
            assert!(!h.is_invalid());
            let _ = windows::Win32::Graphics::Gdi::DeleteEnhMetaFile(Some(h));
        }
    }

    #[test]
    fn an_emfs_frame_is_its_size_in_himetric() {
        let mut emf = vec![0u8; 40];
        for (i, v) in [0i32, 0, 1885, 1813].iter().enumerate() {
            emf[24 + 4 * i..28 + 4 * i].copy_from_slice(&v.to_le_bytes());
        }
        let s = emf_extent(&emf).unwrap();
        assert_eq!((s.cx, s.cy), (1885, 1813));
        assert!(emf_extent(&emf[..30]).is_none());
    }

    /// The smallest EMF Windows takes: a header, and its end.
    fn tiny_emf() -> Vec<u8> {
        let mut e = vec![0u8; 128];
        let mut put = |at: usize, v: u32| e[at..at + 4].copy_from_slice(&v.to_le_bytes());
        put(0, 1); // EMR_HEADER
        put(4, 108);
        put(16, 10); // bounds
        put(20, 10);
        put(32, 265); // frame, in hundredths of a millimetre
        put(36, 265);
        put(40, 0x464d4520);
        put(44, 0x10000);
        put(48, 128); // bytes
        put(52, 2); // records
        put(56, 1); // handles
        put(72, 1920);
        put(76, 1080);
        put(80, 508);
        put(84, 286);
        put(108, 14); // EMR_EOF
        put(112, 20);
        put(120, 16);
        put(124, 20);
        e
    }

    #[test]
    fn an_object_made_for_office_carries_the_record_back() {
        // SAFETY: this test's own thread.
        let _ = unsafe { OleInitialize(None) };
        let record = r#"{"format":"meno-structure","version":1,"atoms":[],"bonds":[]}"#;
        let bytes = embed_source(record, &tiny_emf()).unwrap();
        // a compound file, as Office takes one from the clipboard
        assert_eq!(&bytes[..8], &[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
        assert_eq!(record_in_object(&bytes).as_deref(), Some(record));
        // and read with what a clipboard block may have after it
        let mut padded = bytes.clone();
        padded.extend([0u8; 100]);
        assert_eq!(record_in_object(&padded).as_deref(), Some(record));
        assert!(record_in_object(b"not a storage at all").is_none());
    }

    /// An EMF with a line in it: OLE's cache keeps no picture of nothing.
    fn drawn_emf() -> Vec<u8> {
        use windows::Win32::Graphics::Gdi::{CloseEnhMetaFile, CreateEnhMetaFileW, DeleteEnhMetaFile, GetEnhMetaFileBits, LineTo, MoveToEx};
        // SAFETY: a metafile's DC of this test's own, closed and freed here.
        unsafe {
            let frame = RECT { left: 0, top: 0, right: 1885, bottom: 1813 };
            let dc = CreateEnhMetaFileW(None, PCWSTR::null(), Some(&frame), PCWSTR::null());
            let _ = MoveToEx(dc, 0, 0, None);
            let _ = LineTo(dc, 60, 50);
            let emf = CloseEnhMetaFile(dc);
            let mut bytes = vec![0u8; GetEnhMetaFileBits(emf, None) as usize];
            GetEnhMetaFileBits(emf, Some(&mut bytes));
            let _ = DeleteEnhMetaFile(Some(emf));
            bytes
        }
    }

    #[test]
    fn the_cached_picture_is_as_big_as_the_picture_says() {
        // SAFETY: this test's own thread.
        let _ = unsafe { OleInitialize(None) };
        let emf = drawn_emf();
        let size = emf_extent(&emf).unwrap();
        let stg = storage_of(&embed_source("{}", &emf).unwrap()).unwrap();
        let pres = read_stream(&stg, w!("\u{2}OlePres000")).unwrap();
        let at = |i: usize| i32::from_le_bytes(pres[i..i + 4].try_into().unwrap());
        // an EMF by its number, no target device: width and height at 28 and 32
        assert_eq!((at(0), at(4), at(8)), (-1, 14, 4));
        assert_eq!((at(28), at(32)), (size.cx, size.cy));
    }

    /// An EMF drawn as Meno draws one: a window of logical units onto the
    /// pixels, an EMF+ page's scale, a (blank) run of text, and a square.
    fn window_emf() -> Vec<u8> {
        let rec = |kind: u32, body: &[u8]| {
            let mut r = kind.to_le_bytes().to_vec();
            r.extend(((8 + body.len()) as u32).to_le_bytes());
            r.extend(body);
            r
        };
        let ints = |v: &[i32]| v.iter().flat_map(|i| i.to_le_bytes()).collect::<Vec<u8>>();
        let mut plus = b"EMF+".to_vec();
        plus.extend(0x4030u16.to_le_bytes()); // EmfPlusSetPageTransform
        plus.extend(2u16.to_le_bytes()); // (in pixels)
        plus.extend(16u32.to_le_bytes());
        plus.extend(4u32.to_le_bytes());
        plus.extend(1f32.to_le_bytes());
        let mut comment = (plus.len() as u32).to_le_bytes().to_vec();
        comment.extend(&plus);
        let mut text = ints(&[0, 0, -1, -1, 1]);
        text.extend(0.25f32.to_le_bytes());
        text.extend(0.25f32.to_le_bytes());
        text.extend(ints(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
        let body = [
            rec(17, &ints(&[8])),               // SETMAPMODE: anisotropic
            rec(9, &ints(&[2000, 2000])),       // SETWINDOWEXTEX
            rec(11, &ints(&[100, 100])),        // SETVIEWPORTEXTEX
            rec(70, &comment),                  // COMMENT: EMF+
            rec(84, &text),                     // EXTTEXTOUTW
            rec(39, &ints(&[1, 0, 0, 0])),      // CREATEBRUSHINDIRECT: black
            rec(37, &ints(&[1])),               // SELECTOBJECT
            rec(3, &ints(&[200, 200, 1200, 1200, 4, 200, 200, 1200, 200, 1200, 1200, 200, 1200])), // POLYGON
            rec(14, &ints(&[0, 16, 20])),       // EOF
        ]
        .concat();
        let mut head = ints(&[1, 88, 0, 0, 99, 99, 0, 0, 2646, 2646, 0x464d4520, 0x10000]);
        head.extend(((88 + body.len()) as u32).to_le_bytes());
        head.extend(10u32.to_le_bytes()); // records
        head.extend(2u16.to_le_bytes()); // handles
        head.extend(0u16.to_le_bytes());
        head.extend(ints(&[0, 0, 0, 1920, 1080, 508, 286]));
        [head, body].concat()
    }

    /// The EMF played into a square of `side` pixels, white first.
    fn played(emf: &[u8], side: i32) -> Vec<u8> {
        use windows::Win32::Graphics::Gdi::{
            CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteEnhMetaFile, DeleteObject, GetDC, GetDIBits, GetStockObject,
            FillRect, PlayEnhMetaFile, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HBRUSH, WHITE_BRUSH,
        };
        // SAFETY: DCs and a bitmap of this function's own, freed here.
        unsafe {
            let screen = GetDC(None);
            let dc = CreateCompatibleDC(Some(screen));
            let bitmap = CreateCompatibleBitmap(screen, side, side);
            let old = SelectObject(dc, bitmap.into());
            let rect = RECT { left: 0, top: 0, right: side, bottom: side };
            FillRect(dc, &rect, HBRUSH(GetStockObject(WHITE_BRUSH).0));
            let hemf = SetEnhMetaFileBits(emf);
            let _ = PlayEnhMetaFile(dc, hemf, &rect);
            let _ = DeleteEnhMetaFile(Some(hemf));
            SelectObject(dc, old);
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: side,
                    biHeight: side,
                    biPlanes: 1,
                    biBitCount: 32,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut pixels = vec![0u8; (side * side * 4) as usize];
            GetDIBits(dc, bitmap, 0, side as u32, Some(pixels.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
            let _ = DeleteObject(bitmap.into());
            let _ = DeleteDC(dc);
            ReleaseDC(None, screen);
            pixels
        }
    }

    #[test]
    fn a_picture_scaled_for_office_says_a_new_size_and_looks_the_same() {
        let emf = window_emf();
        let big = scaled_emf(&emf, 2.0).unwrap();
        let at = |e: &[u8], i: usize| i32::from_le_bytes(e[i..i + 4].try_into().unwrap());
        let float = |e: &[u8], i: usize| f32::from_le_bytes(e[i..i + 4].try_into().unwrap());
        // the size it says: frame and bounds
        assert_eq!((at(&big, 32), at(&big, 36)), (5292, 5292));
        assert_eq!((at(&big, 16), at(&big, 20)), (199, 199));
        // what is drawn, drawn as much larger: the window, EMF+'s page, the text's scales
        let window = 88 + 12 + 8;
        assert_eq!((at(&big, window), at(&big, window + 4)), (1000, 1000));
        let page = window + 8 + 16 + 12 + 4 + 12;
        assert_eq!((float(&emf, page), float(&big, page)), (1.0, 2.0));
        let text = page + 4 + 28;
        assert_eq!((float(&big, text), float(&big, text + 4)), (0.5, 0.5));
        assert_eq!(big.len(), emf.len());
        // and in any box, it looks as it did
        for side in [100, 137] {
            let (a, b) = (played(&emf, side), played(&big, side));
            // (a pixel's rounding along an edge, at most)
            let off = a.chunks(4).zip(b.chunks(4)).filter(|(x, y)| x != y).count();
            assert!(off <= 4 * side as usize, "{off} pixels differ at {side}");
        }
        assert!(played(&emf, 100).chunks(4).any(|p| p[0] == 0), "nothing was drawn");
    }

    #[test]
    fn a_picture_not_drawn_through_a_window_is_left_as_it_is() {
        assert!(scaled_emf(&tiny_emf(), 2.0).is_none());
        assert!(scaled_emf(&window_emf(), 1.0).is_none());
        assert!(scaled_emf(b"not an emf", 2.0).is_none());
    }

    #[test]
    fn the_screen_skew_is_a_believable_factor() {
        let k = screen_skew();
        assert!((0.2..5.0).contains(&k), "{k}");
    }

    #[test]
    fn a_descriptor_names_the_class_and_the_size() {
        let mut emf = vec![0u8; 40];
        emf[32..36].copy_from_slice(&100i32.to_le_bytes());
        emf[36..40].copy_from_slice(&50i32.to_le_bytes());
        let d = object_descriptor(&emf);
        let head = std::mem::size_of::<OBJECTDESCRIPTOR>();
        assert_eq!(u32::from_le_bytes(d[0..4].try_into().unwrap()) as usize, d.len());
        let clsid = GUID::from_values(
            u32::from_le_bytes(d[4..8].try_into().unwrap()),
            u16::from_le_bytes(d[8..10].try_into().unwrap()),
            u16::from_le_bytes(d[10..12].try_into().unwrap()),
            d[12..20].try_into().unwrap(),
        );
        assert_eq!(clsid, CLSID_STRUCTURE);
        let size = |i: usize| i32::from_le_bytes(d[i..i + 4].try_into().unwrap());
        assert_eq!((size(24), size(28)), (100, 50));
        let name: Vec<u16> = d[head..].as_chunks().0.iter().map(|&c| u16::from_le_bytes(c)).take_while(|&c| c != 0).collect();
        assert_eq!(String::from_utf16_lossy(&name), USER_TYPE);
    }
}
