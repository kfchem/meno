//! PDFs (docs/PDF.md): PDFium, in a process of its own.
//!
//! A PDF a workspace holds is kept in Meno's cache, `pdf/<sha256>.pdf`,
//! known by its SHA-256 - written there once, when it is first held - and a
//! workspace's file keeps its bytes (`pdf_bytes`). Meno's executable
//! started as `--pdf <cache>` is the reader: it binds PDFium, opens a PDF
//! from the cache the first time it is asked about it, takes requests a
//! line of JSON each on its standard input, and answers on its standard
//! output, each answer a frame - its JSON, then its bytes: a part of a
//! page drawn, RGBA as a WebGL texture takes it, or that picture as a PNG.
//! Meno starts the reader the first time a PDF is wanted, and starts it
//! again if it has gone: a PDF that breaks PDFium breaks the reader alone.
use pdfium_render::prelude::*;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Manager;

pub const PDF_FLAG: &str = "--pdf";

/// The most a PDF held may come to, as a workspace's file holds any one file.
const MOST: u64 = 1024 * 1024 * 1024;

/// Where PDFium's library is: inside the app on a Mac, among Meno's
/// resources beside the program on Windows and Linux - or, built for
/// development, where the build fetched it (scripts/fetch-pdfium.mjs).
pub(crate) fn library_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let beside = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let system = if cfg!(target_os = "macos") { "macos" } else if cfg!(windows) { "windows" } else { "linux" };
    let bundled = if cfg!(target_os = "macos") { beside.join("../Frameworks") } else { beside.join("pdfium").join(system) };
    for dir in [bundled, beside.clone()] {
        if dir.join(Pdfium::pdfium_platform_library_name()).exists() {
            return dir;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("pdfium").join(system)
}

/// Meno started as the PDF reader: that, and nothing else.
pub fn pdf_mode() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()? != PDF_FLAG {
        return None;
    }
    Some(run_reader(&PathBuf::from(args.next()?)))
}

fn write_frame(out: &mut impl Write, head: &Value, bytes: &[u8]) -> std::io::Result<()> {
    let head = serde_json::to_vec(head).unwrap_or_default();
    out.write_all(&(head.len() as u32).to_le_bytes())?;
    out.write_all(&head)?;
    out.write_all(&(bytes.len() as u32).to_le_bytes())?;
    out.write_all(bytes)?;
    out.flush()
}

fn read_frame(r: &mut impl Read) -> std::io::Result<(Value, Vec<u8>)> {
    let mut n = [0u8; 4];
    r.read_exact(&mut n)?;
    let mut head = vec![0u8; u32::from_le_bytes(n) as usize];
    r.read_exact(&mut head)?;
    r.read_exact(&mut n)?;
    let mut bytes = vec![0u8; u32::from_le_bytes(n) as usize];
    r.read_exact(&mut bytes)?;
    Ok((serde_json::from_slice(&head).unwrap_or(Value::Null), bytes))
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

/// Whether `sha` is a SHA-256 written out, as the cache names its PDFs by.
fn is_sha(sha: &str) -> bool {
    sha.len() == 64 && sha.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// A picture as a PNG: quick to make - a page is mostly white - and taken
/// apart by the window off its main thread.
fn png_of(rgba: &[u8], w: u32, h: u32) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(rgba.len() / 8);
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        enc.set_filter(png::FilterType::Sub);
        let mut writer = enc.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

/// How finely a point on a page is found where it is drawn: an eighth of a point.
const ON_PAGE_SCALE: f32 = 8.0;

/// Where a point of a page's own space lies on the page as it is drawn, in
/// points from its top left - its box, and its turn, as PDFium draws them.
fn on_page(page: &PdfPage, x: f32, y: f32) -> Option<(f32, f32)> {
    let cfg = PdfRenderConfig::new().scale_page_by_factor(ON_PAGE_SCALE);
    let (dx, dy) = page.points_to_pixels(PdfPoints::new(x), PdfPoints::new(y), &cfg).ok()?;
    Some((dx as f32 / ON_PAGE_SCALE, dy as f32 / ON_PAGE_SCALE))
}

/// A page's own space as it is drawn, from its top left: found once, from
/// where three points of it lie, and taken for every point after.
fn page_space(page: &PdfPage) -> Option<impl Fn(f32, f32) -> (f32, f32)> {
    let (o, ax, ay) = (on_page(page, 0.0, 0.0)?, on_page(page, 1000.0, 0.0)?, on_page(page, 0.0, 1000.0)?);
    let m = [(ax.0 - o.0) / 1000.0, (ax.1 - o.1) / 1000.0, (ay.0 - o.0) / 1000.0, (ay.1 - o.1) / 1000.0];
    Some(move |x: f32, y: f32| (o.0 + m[0] * x + m[2] * y, o.1 + m[1] * x + m[3] * y))
}

/// A box of a page's own space - left, bottom, right, top - as it lies on the page as drawn: left, top, right, bottom from its top left.
fn drawn_box(at: &impl Fn(f32, f32) -> (f32, f32), r: &PdfRect) -> [f32; 4] {
    let (a, b) = (at(r.left().value, r.bottom().value), at(r.right().value, r.top().value));
    [a.0.min(b.0), a.1.min(b.1), a.0.max(b.0), a.1.max(b.1)]
}

/// A transform as a PDF writes one, `[a b c d e f]`: a point (x, y) goes to (ax + cy + e, bx + dy + f).
type Affine = [f32; 6];
const IDENTITY: Affine = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

fn apply(m: &Affine, x: f32, y: f32) -> (f32, f32) {
    (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
}

/// `inner`, then `outer`.
fn then(i: &Affine, o: &Affine) -> Affine {
    [
        o[0] * i[0] + o[2] * i[1],
        o[1] * i[0] + o[3] * i[1],
        o[0] * i[2] + o[2] * i[3],
        o[1] * i[2] + o[3] * i[3],
        o[0] * i[4] + o[2] * i[5] + o[4],
        o[1] * i[4] + o[3] * i[5] + o[5],
    ]
}

fn affine_of(m: &PdfMatrix) -> Affine {
    [m.a(), m.b(), m.c(), m.d(), m.e(), m.f()]
}

/// The paths and pictures of a figure, each where it lies on the page as drawn (`figure`).
struct Drawn {
    paths: Vec<Value>,
    pictures: Vec<[f32; 4]>,
}

impl Drawn {
    /// A thing on the page, under the transforms of the forms it lies in; a form's own things, each in turn.
    fn take(&mut self, obj: &PdfPageObject, outer: Affine, at: &impl Fn(f32, f32) -> (f32, f32), within: &[f32; 4]) {
        let meets = |q: &[f32; 4]| q[0] <= within[2] && q[2] >= within[0] && q[1] <= within[3] && q[3] >= within[1];
        let Ok(bounds) = obj.bounds() else { return };
        let r = bounds.to_rect();
        let corners = [(r.left().value, r.bottom().value), (r.right().value, r.top().value), (r.left().value, r.top().value), (r.right().value, r.bottom().value)];
        let drawn: Vec<(f32, f32)> = corners.iter().map(|&(x, y)| { let p = apply(&outer, x, y); at(p.0, p.1) }).collect();
        let q = [
            drawn.iter().map(|p| p.0).fold(f32::MAX, f32::min),
            drawn.iter().map(|p| p.1).fold(f32::MAX, f32::min),
            drawn.iter().map(|p| p.0).fold(f32::MIN, f32::max),
            drawn.iter().map(|p| p.1).fold(f32::MIN, f32::max),
        ];
        if !meets(&q) {
            return;
        }
        if let Some(form) = obj.as_x_object_form_object() {
            let inner = form.matrix().map(|m| affine_of(&m)).unwrap_or(IDENTITY);
            let m = then(&inner, &outer);
            for o in form.iter() {
                self.take(&o, m, at, within);
            }
        } else if let Some(path) = obj.as_path_object() {
            let m = then(&path.matrix().map(|m| affine_of(&m)).unwrap_or(IDENTITY), &outer);
            let to = |x: f32, y: f32| { let p = apply(&m, x, y); at(p.0, p.1) };
            let mut d = vec![];
            for s in path.segments().raw().iter() {
                let (x, y) = to(s.x().value, s.y().value);
                let op = match s.segment_type() {
                    PdfPathSegmentType::MoveTo => "M",
                    PdfPathSegmentType::LineTo => "L",
                    PdfPathSegmentType::BezierTo => "C",
                    _ => continue,
                };
                d.push(json!([op, x, y]));
                if s.is_close() {
                    d.push(json!(["Z"]));
                }
            }
            // (a stroke's width as the transforms make it: by how much they scale a length)
            let (o, u, v) = (to(0.0, 0.0), to(1.0, 0.0), to(0.0, 1.0));
            let k = (((u.0 - o.0) * (v.1 - o.1) - (u.1 - o.1) * (v.0 - o.0)).abs()).sqrt();
            let fill = path.fill_mode().map(|f| f != PdfPathFillMode::None).unwrap_or(false);
            let stroke = path.is_stroked().unwrap_or(false);
            let colour = |c: Result<PdfColor, PdfiumError>| c.ok().map(|c| format!("#{:02x}{:02x}{:02x}{:02x}", c.red(), c.green(), c.blue(), c.alpha()));
            // (a stroke drawn dashed: its dash pattern has a dash or a gap of some length - an arrow's dashed line)
            let dash = stroke && path.dash_array().map(|a| a.len() > 1 && a.iter().any(|v| v.value > 0.0)).unwrap_or(false);
            self.paths.push(json!({
                "fill": if fill { colour(path.fill_color()) } else { None },
                "stroke": if stroke { colour(path.stroke_color()) } else { None },
                "width": path.stroke_width().map(|w| w.value * k).unwrap_or(0.0),
                "d": d,
                "dash": dash,
            }));
        } else if obj.as_image_object().is_some() {
            self.pictures.push(q);
        }
    }
}

/// A request answered: its JSON, and its bytes.
/// Why PDFium could not open a PDF, in words: one locked with a password
/// said so plainly, as Meno asks for none, one locked another way, and one
/// damaged past mending - cut short, or no PDF at all. Anything else is said
/// plainly too, its error to the log, not to the person.
fn unreadable(e: PdfiumError) -> String {
    match e {
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => "it is locked with a password".into(),
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::SecurityError) => "it is locked in a way Meno cannot open".into(),
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::FormatError) => "it is damaged, or is not a PDF".into(),
        e => {
            eprintln!("a PDF not opened: {e:?}");
            "Meno could not open it".into()
        }
    }
}

fn answer(docs: &mut HashMap<String, PdfDocument<'static>>, pdfium: &'static Pdfium, cache: &Path, ask: &Value) -> Result<(Value, Vec<u8>), String> {
    let t = Instant::now();
    let sha = ask["sha"].as_str().unwrap_or("").to_string();
    if !is_sha(&sha) {
        return Err("no such PDF".into());
    }
    if !docs.contains_key(&sha) {
        let doc = pdfium.load_pdf_from_file(&cache.join(format!("{sha}.pdf")), None).map_err(unreadable)?;
        docs.insert(sha.clone(), doc);
    }
    let doc = &docs[&sha];
    match ask["op"].as_str().unwrap_or("") {
        "pages" => {
            let sizes: Vec<[f32; 2]> = doc.pages().iter().map(|p| [p.width().value, p.height().value]).collect();
            Ok((json!({"pages": sizes, "ms": ms(t)}), vec![]))
        }
        "render" => {
            let page = doc.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).map_err(|_| "no such page".to_string())?;
            let scale = ask["scale"].as_f64().unwrap_or(1.0).clamp(0.01, 64.0) as f32;
            let full = ((page.width().value * scale).ceil() as i64, (page.height().value * scale).ceil() as i64);
            let x = ask["x"].as_i64().unwrap_or(0).clamp(0, full.0 - 1);
            let y = ask["y"].as_i64().unwrap_or(0).clamp(0, full.1 - 1);
            let w = ask["w"].as_i64().unwrap_or(full.0).min(full.0 - x).clamp(1, 8192) as i32;
            let h = ask["h"].as_i64().unwrap_or(full.1).min(full.1 - y).clamp(1, 8192) as i32;
            let mut bm = PdfBitmap::empty(w, h, PdfBitmapFormat::BGRA).map_err(|e| e.to_string())?;
            // (the page placed by its top left in the bitmap, which PDFium takes on
            // the path that draws forms as well; white under it, as paper is)
            let cfg = PdfRenderConfig::new()
                .scale_page_by_factor(scale)
                .set_origin(-(x as i32), -(y as i32))
                .set_reverse_byte_order(true)
                .set_clear_color(PdfColor::WHITE)
                .render_annotations(true);
            page.render_into_bitmap_with_config(&mut bm, &cfg).map_err(|e| e.to_string())?;
            let rgba = bm.as_raw_bytes();
            let drawn_ms = ms(t);
            let packed = ask["packed"].as_bool().unwrap_or(false);
            let bytes = if packed { png_of(&rgba, w as u32, h as u32)? } else { rgba };
            Ok((json!({"w": w, "h": h, "packed": packed, "drawn_ms": drawn_ms, "ms": ms(t)}), bytes))
        }
        "links" => {
            let page = doc.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).map_err(|_| "no such page".to_string())?;
            let mut links = vec![];
            for link in page.links().iter() {
                let Ok(r) = link.rect() else { continue };
                let (Some(a), Some(b)) = (on_page(&page, r.left().value, r.bottom().value), on_page(&page, r.right().value, r.top().value)) else {
                    continue;
                };
                let rect = [a.0.min(b.0), a.1.min(b.1), a.0.max(b.0), a.1.max(b.1)];
                let action = link.action();
                // (a place in the PDF - given by the link, or by its action - or a web page)
                let dest = link
                    .destination()
                    .or_else(|| action.as_ref().and_then(|a| a.as_local_destination_action()).and_then(|l| l.destination().ok()));
                if let Some(d) = dest {
                    let Ok(i) = d.page_index() else { continue };
                    let y = match d.view_settings() {
                        Ok(PdfDestinationViewSettings::SpecificCoordinatesAndZoom(_, Some(y), _))
                        | Ok(PdfDestinationViewSettings::FitPageHorizontallyToWindow(Some(y)))
                        | Ok(PdfDestinationViewSettings::FitBoundsHorizontallyToWindow(Some(y))) => Some(y.value),
                        Ok(PdfDestinationViewSettings::FitPageToRectangle(r)) => Some(r.top().value),
                        _ => None,
                    };
                    let y = y.and_then(|y| doc.pages().get(i).ok().and_then(|p| on_page(&p, 0.0, y))).map(|(_, y)| y);
                    links.push(json!({"rect": rect, "page": i, "y": y}));
                } else if let Some(uri) = action.as_ref().and_then(|a| a.as_uri_action()).and_then(|u| u.uri().ok()) {
                    links.push(json!({"rect": rect, "uri": uri}));
                }
            }
            Ok((json!({"links": links, "ms": ms(t)}), vec![]))
        }
        "text" => {
            let page = doc.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).map_err(|_| "no such page".to_string())?;
            let text = page.text().map_err(|e| e.to_string())?;
            let at = page_space(&page).ok_or("the page could not be measured")?;
            let chars = text.chars();
            let mut bytes = Vec::with_capacity(chars.len() * 20);
            for c in chars.iter() {
                // (a letter PDFium put there itself - a space, a line's end - has no box of its own)
                let b = c
                    .loose_bounds()
                    .ok()
                    .filter(|r| !c.is_generated().unwrap_or(false) && (r.width().value > 0.0 || r.height().value > 0.0))
                    .map(|r| drawn_box(&at, &r))
                    .unwrap_or([0.0; 4]);
                bytes.extend_from_slice(&c.unicode_value().to_le_bytes());
                for v in b {
                    bytes.extend_from_slice(&v.to_le_bytes());
                }
            }
            Ok((json!({"n": bytes.len() / 20, "ms": ms(t)}), bytes))
        }
        // what the page is made of, each thing where it lies - 20 bytes each:
        // what it is (1 text, 2 a path, 3 a picture, 4 a shading, 5 a form
        // holding more, 6 text that is a "+" alone, as a scheme sets one
        // between its compounds), and its box, as a letter's is (`text`)
        "objects" => {
            let page = doc.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).map_err(|_| "no such page".to_string())?;
            let at = page_space(&page).ok_or("the page could not be measured")?;
            let mut bytes = Vec::new();
            for obj in page.objects().iter() {
                let kind: u32 = match obj.object_type() {
                    PdfPageObjectType::Text if obj.as_text_object().map(|t| t.text().trim() == "+").unwrap_or(false) => 6,
                    PdfPageObjectType::Text => 1,
                    PdfPageObjectType::Path => 2,
                    PdfPageObjectType::Image => 3,
                    PdfPageObjectType::Shading => 4,
                    PdfPageObjectType::XObjectForm => 5,
                    _ => continue,
                };
                let Ok(q) = obj.bounds() else { continue };
                bytes.extend_from_slice(&kind.to_le_bytes());
                for v in drawn_box(&at, &q.to_rect()) {
                    bytes.extend_from_slice(&v.to_le_bytes());
                }
            }
            Ok((json!({"n": bytes.len() / 20, "ms": ms(t)}), bytes))
        }
        "figure" => {
            let page = doc.pages().get(ask["page"].as_i64().unwrap_or(0) as i32).map_err(|_| "no such page".to_string())?;
            let at = page_space(&page).ok_or("the page could not be measured")?;
            let b: Vec<f32> = ask["box"].as_array().map(|v| v.iter().filter_map(|x| x.as_f64()).map(|x| x as f32).collect()).unwrap_or_default();
            let within = if b.len() == 4 { [b[0], b[1], b[2], b[3]] } else { [f32::MIN, f32::MIN, f32::MAX, f32::MAX] };
            let mut drawn = Drawn { paths: vec![], pictures: vec![] };
            for obj in page.objects().iter() {
                drawn.take(&obj, IDENTITY, &at, &within);
            }
            let mut letters = vec![];
            let text = page.text().map_err(|e| e.to_string())?;
            for c in text.chars().iter() {
                if c.is_generated().unwrap_or(false) || matches!(c.render_mode(), Ok(PdfPageTextRenderMode::Invisible)) {
                    continue;
                }
                let Some(ch) = c.unicode_char().filter(|ch| !ch.is_whitespace()) else { continue };
                let Ok(r) = c.tight_bounds() else { continue };
                let bx = drawn_box(&at, &r);
                let (mx, my) = ((bx[0] + bx[2]) / 2.0, (bx[1] + bx[3]) / 2.0);
                if mx < within[0] || mx > within[2] || my < within[1] || my > within[3] {
                    continue;
                }
                let o = c.origin().ok().map(|(x, y)| at(x.value, y.value));
                // (and its loose box: from where it starts to where the next would, as tall as its typeface - how far apart letters are set, which their ink alone does not tell)
                let loose = c.loose_bounds().ok().map(|r| drawn_box(&at, &r));
                // (which way its line reads as the page is shown: its own turn on the page, and the page's - radians, y down, naught left to right)
                let dir = match (c.angle_radians(), c.origin()) {
                    (Ok(a), Ok((x, y))) => {
                        let (p, q) = (at(x.value, y.value), at(x.value + 10.0 * a.cos(), y.value + 10.0 * a.sin()));
                        Some((q.1 - p.1).atan2(q.0 - p.0))
                    }
                    _ => None,
                };
                letters.push(json!({"c": ch.to_string(), "box": bx, "loose": loose, "at": o.map(|o| [o.0, o.1]), "size": c.scaled_font_size().value, "font": c.font_name(), "dir": dir}));
            }
            Ok((json!({"paths": drawn.paths, "letters": letters, "pictures": drawn.pictures, "ms": ms(t)}), vec![]))
        }
        "close" => {
            docs.remove(&sha);
            Ok((json!({}), vec![]))
        }
        other => Err(format!("unknown request {other}")),
    }
}

/// A new PDF made from pages of those held (pdfmake.rs): each opened first, as any asked about.
fn make(docs: &mut HashMap<String, PdfDocument<'static>>, pdfium: &'static Pdfium, cache: &Path, ask: &Value) -> Result<(Value, Vec<u8>), String> {
    let t = Instant::now();
    let plan: crate::pdfmake::Plan = serde_json::from_value(ask["plan"].clone()).map_err(|e| format!("not a plan for a PDF: {e}"))?;
    for take in &plan.pages {
        if !is_sha(&take.sha) {
            return Err("no such PDF".into());
        }
        if !docs.contains_key(&take.sha) {
            let doc = pdfium.load_pdf_from_file(&cache.join(format!("{}.pdf", take.sha)), None).map_err(unreadable)?;
            docs.insert(take.sha.clone(), doc);
        }
    }
    let bytes = crate::pdfmake::make(pdfium, docs, &plan)?;
    Ok((json!({"ms": ms(t)}), bytes))
}

/// How many PDFs a reader keeps open: the ones last asked about - each open
/// one holds its pages, and every reader opens what it is asked to draw.
const OPEN_MOST: usize = 6;

/// `sha` noted as the PDF last asked about, and those asked about longest
/// ago closed, `most` kept open at most.
fn keep_open<V>(docs: &mut HashMap<String, V>, used: &mut std::collections::VecDeque<String>, sha: &str, most: usize) {
    used.retain(|s| s != sha);
    used.push_back(sha.to_string());
    while used.len() > most {
        if let Some(old) = used.pop_front() {
            docs.remove(&old);
        }
    }
    // (none open that is not noted: one closed by asking is forgotten too)
    docs.retain(|k, _| used.contains(k));
}

fn run_reader(cache: &Path) -> i32 {
    let started = Instant::now();
    let mut out = std::io::stdout().lock();
    let bindings = match Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) {
        Ok(b) => b,
        Err(e) => {
            let _ = write_frame(&mut out, &json!({"id": 0, "ok": false, "why": format!("The PDF reader could not be loaded: {e}")}), &[]);
            return 1;
        }
    };
    // (the documents opened borrow PDFium for as long as the reader runs)
    let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
    let _ = write_frame(&mut out, &json!({"id": 0, "ok": true, "bound_ms": ms(started)}), &[]);
    let mut docs: HashMap<String, PdfDocument<'static>> = HashMap::new();
    let mut used = std::collections::VecDeque::new();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(ask) = serde_json::from_str::<Value>(&line) else { continue };
        let id = ask["id"].as_u64().unwrap_or(0);
        let answered = if ask["op"] == "make" { make(&mut docs, pdfium, cache, &ask) } else { answer(&mut docs, pdfium, cache, &ask) };
        if let Some(sha) = ask["sha"].as_str().filter(|s| docs.contains_key(*s)) {
            keep_open(&mut docs, &mut used, sha, OPEN_MOST);
        }
        // (those a new PDF was made from: kept open as any other asked about)
        for take in ask["plan"]["pages"].as_array().into_iter().flatten() {
            if let Some(sha) = take["sha"].as_str().filter(|s| docs.contains_key(*s)) {
                keep_open(&mut docs, &mut used, sha, OPEN_MOST);
            }
        }
        let (head, bytes) = match answered {
            Ok((mut head, bytes)) => {
                head["id"] = json!(id);
                head["ok"] = json!(true);
                (head, bytes)
            }
            Err(why) => (json!({"id": id, "ok": false, "why": why}), vec![]),
        };
        if write_frame(&mut out, &head, &bytes).is_err() {
            break;
        }
    }
    0
}

type Waiting = Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<(Value, Vec<u8>)>>>>;

/// The reader, as Meno sees it: started when first wanted, asked, answered.
/// Its process and its input each behind a lock of its own, apart from
/// Meno's hold on the reader (`PdfState`): a write waiting for room in a
/// full pipe - a reader that has stopped reading - holds its input alone,
/// so that the reader can be stopped meanwhile, which ends the write.
struct Reader {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    waiting: Waiting,
    next: AtomicU64,
}

impl Drop for Reader {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
        }
    }
}

impl Reader {
    fn start(cache: &Path) -> Result<Reader, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut command = Command::new(exe);
        command.arg(PDF_FLAG).arg(cache).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // (no console window of its own)
            command.creation_flags(0x0800_0000);
        }
        let mut child = command.spawn().map_err(|e| format!("the PDF reader could not start: {e}"))?;
        let stdin = child.stdin.take().ok_or("the PDF reader takes no input")?;
        let mut stdout = BufReader::with_capacity(1 << 20, child.stdout.take().ok_or("the PDF reader gives no output")?);
        let (first, _) = read_frame(&mut stdout).map_err(|e| format!("the PDF reader said nothing: {e}"))?;
        if first["ok"] != json!(true) {
            let _ = child.kill();
            return Err(first["why"].as_str().unwrap_or("the PDF reader failed").to_string());
        }
        let waiting: Waiting = Arc::new(Mutex::new(HashMap::new()));
        let w = waiting.clone();
        std::thread::spawn(move || {
            while let Ok((head, bytes)) = read_frame(&mut stdout) {
                let id = head["id"].as_u64().unwrap_or(0);
                if let Some(tx) = w.lock().unwrap().remove(&id) {
                    let _ = tx.send((head, bytes));
                }
            }
            // (the reader is gone: whoever waits is told so)
            w.lock().unwrap().clear();
        });
        Ok(Reader { child: Mutex::new(child), stdin: Mutex::new(stdin), waiting, next: AtomicU64::new(1) })
    }

    /// Whether the reader has gone.
    fn gone(&self) -> bool {
        let mut child = self.child.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        matches!(child.try_wait(), Ok(Some(_)))
    }

    /// The reader stopped, and waited for.
    fn stop(&self) {
        let mut child = self.child.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let _ = child.kill();
        let _ = child.wait();
    }

    fn ask(&self, mut req: Value) -> Result<tokio::sync::oneshot::Receiver<(Value, Vec<u8>)>, String> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        req["id"] = json!(id);
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.waiting.lock().unwrap().insert(id, tx);
        let mut line = serde_json::to_vec(&req).map_err(|e| e.to_string())?;
        line.push(b'\n');
        let mut stdin = self.stdin.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        stdin.write_all(&line).and_then(|_| stdin.flush()).map_err(|e| format!("the PDF reader is gone: {e}"))?;
        Ok(rx)
    }
}

/// The readers Meno has started, if any - each held only while it is looked
/// at, started or let go, never while it is written to. The first is asked
/// everything; parts of pages are drawn by all of them in turn (`DRAWERS`),
/// each a process with its own PDFium - PDFium itself draws on one thread
/// at a time, so pages are drawn side by side only in readers of their own.
pub struct PdfState {
    readers: Mutex<Vec<Option<Arc<Reader>>>>,
    turn: AtomicU64,
}

impl Default for PdfState {
    fn default() -> Self {
        PdfState { readers: Mutex::new(vec![None; drawers()]), turn: AtomicU64::new(0) }
    }
}

/// How many readers draw parts of pages: one fewer than the machine's cores, three at most - each holds what it has opened.
fn drawers() -> usize {
    std::thread::available_parallelism().map(|n| n.get().saturating_sub(1)).unwrap_or(1).clamp(1, 3)
}

fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("pdf");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// How long a request to the PDF reader may take: a heavy page drawn large, a figure read, at most.
const REPLY_MOST: std::time::Duration = std::time::Duration::from_secs(90);

async fn ask(app: &tauri::AppHandle, req: Value) -> Result<(Value, Vec<u8>), String> {
    ask_on(app, 0, req).await
}

/// A part of a page drawn by the next of the readers in turn - the first
/// left for all else asked (links, words, figures) where there are others
/// to draw, so that a hover is not kept waiting behind a page drawn large.
async fn ask_drawn(app: &tauri::AppHandle, req: Value) -> Result<(Value, Vec<u8>), String> {
    let state = app.state::<PdfState>();
    let n = state.readers.lock().unwrap_or_else(std::sync::PoisonError::into_inner).len().max(1);
    ask_on(app, drawing_slot(state.turn.fetch_add(1, Ordering::Relaxed) as usize, n), req).await
}

/// Which of `n` readers draws the `turn`th part asked for: the first alone, or the others in turn.
fn drawing_slot(turn: usize, n: usize) -> usize {
    if n > 1 { 1 + turn % (n - 1) } else { 0 }
}

/// `req` asked of reader `slot`: started the first time, and again where it has gone or has not answered in time.
async fn ask_on(app: &tauri::AppHandle, slot: usize, req: Value) -> Result<(Value, Vec<u8>), String> {
    // (started, and asked, off the commands' threads: a start waits for the
    // reader's first word, and a write for room in its pipe - held, they
    // held a command thread each, and every other PDF request with them)
    let held = app.clone();
    let asked = async move {
        let rx = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
            let state = held.state::<PdfState>();
            let reader = {
                let mut guard = state.readers.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
                let at = slot.min(guard.len() - 1);
                // (started the first time, and again where it has gone)
                if guard[at].as_ref().is_none_or(|r| r.gone()) {
                    guard[at] = Some(Arc::new(Reader::start(&cache_dir(&held)?)?));
                }
                guard[at].as_ref().unwrap().clone()
            };
            // (written to with Meno's hold let go: a write waiting for room in a
            // full pipe holds the reader's input alone, and the reader can be
            // stopped meanwhile - which ends the write)
            reader.ask(req)
        })
        .await
        .map_err(|e| e.to_string())??;
        rx.await.map_err(|_| "the PDF reader stopped".to_string())
    };
    // (the write as well as the answer within the time: a reader that has
    // stopped reading leaves the write waiting, and only its stop ends it)
    let (head, bytes) = match tokio::time::timeout(REPLY_MOST, asked).await {
        Ok(reply) => reply?,
        Err(_) => {
            // (held on it past its time: stopped, so that the next request starts it afresh - what else waits is told it stopped)
            let held = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let state = held.state::<PdfState>();
                let taken = {
                    let mut guard = state.readers.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
                    let at = slot.min(guard.len() - 1);
                    guard[at].take()
                };
                if let Some(reader) = taken {
                    reader.stop();
                }
            })
            .await;
            return Err("the PDF reader did not answer in time, and was started again".to_string());
        }
    };
    if head["ok"] != json!(true) {
        return Err(head["why"].as_str().unwrap_or("the PDF reader failed").to_string());
    }
    Ok((head, bytes))
}

/// A PDF held: what it is known by, its size, and each page's width and height, in points.
#[derive(Serialize)]
pub struct Held {
    sha256: String,
    size: u64,
    pages: Vec<[f32; 2]>,
}

/// Whether `bytes` begin as a PDF does (some carry a little before it).
fn looks_like_pdf(bytes: &[u8]) -> bool {
    bytes[..1024.min(bytes.len())].windows(5).any(|w| w == b"%PDF-")
}

/// `bytes` held: written to the cache under their SHA-256 (once), and asked of the reader.
async fn hold(app: &tauri::AppHandle, bytes: &[u8]) -> Result<Held, String> {
    if bytes.len() as u64 > MOST {
        return Err("it is too large".into());
    }
    if !looks_like_pdf(bytes) {
        return Err("it is not a PDF".into());
    }
    let sha = format!("{:x}", Sha256::digest(bytes));
    let path = cache_dir(app)?.join(format!("{sha}.pdf"));
    let fresh = std::fs::metadata(&path).map(|m| m.len()).ok() != Some(bytes.len() as u64);
    if fresh {
        // (written whole, then put in place: never read half written)
        let part = path.with_extension("part");
        std::fs::write(&part, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&part, &path).map_err(|e| e.to_string())?;
    }
    // (one PDFium cannot open is not kept: taken in just now, it goes again)
    let (head, _) = match ask(app, json!({"op": "pages", "sha": sha})).await {
        Ok(answer) => answer,
        Err(e) => {
            if fresh {
                let _ = std::fs::remove_file(&path);
            }
            return Err(e);
        }
    };
    let pages: Vec<[f32; 2]> = serde_json::from_value(head["pages"].clone()).unwrap_or_default();
    Ok(Held { sha256: sha, size: bytes.len() as u64, pages })
}

/// A new PDF made from pages of PDFs held (pdfmake.rs `Plan`: which pages,
/// in order, how far each is turned, and how they are numbered), held as
/// one opened is - the PDFs it is made from as they were.
#[tauri::command]
pub async fn pdf_make(app: tauri::AppHandle, plan: Value) -> Result<Held, String> {
    let (_, bytes) = ask(&app, json!({"op": "make", "plan": plan})).await?;
    hold(&app, &bytes).await
}

/// A PDF on the disk, held.
#[tauri::command]
pub async fn pdf_hold_path(app: tauri::AppHandle, path: String) -> Result<Held, String> {
    let bytes = read_at_most(Path::new(&path), MOST)?;
    hold(&app, &bytes).await
}

/// A file's bytes, if it is no larger than `most`: too large said from its
/// size before anything is read, and never more than `most` and one byte
/// read, should it grow as it is read.
fn read_at_most(path: &Path, most: u64) -> Result<Vec<u8>, String> {
    let too_large = || "it is too large".to_string();
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > most {
        return Err(too_large());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .and_then(|f| f.take(most + 1).read_to_end(&mut bytes))
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > most {
        return Err(too_large());
    }
    Ok(bytes)
}

/// A PDF's bytes, sent as they are, held.
#[tauri::command]
pub async fn pdf_hold_bytes(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<Held, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => hold(&app, bytes).await,
        _ => Err("a PDF is sent as its bytes".into()),
    }
}

/// A PDF held, as its bytes: what a workspace's file keeps.
#[tauri::command]
pub async fn pdf_bytes(app: tauri::AppHandle, sha: String) -> Result<tauri::ipc::Response, String> {
    if !is_sha(&sha) {
        return Err("no such PDF".into());
    }
    let bytes = std::fs::read(cache_dir(&app)?.join(format!("{sha}.pdf"))).map_err(|_| "it is no longer held".to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// A part of a page drawn at `scale` pixels a point: after 16 bytes - its
/// width and height (u32), how long it took (f32 ms) and whether it is a
/// PNG (u32: 1) - its pixels, RGBA, top row first, or its PNG.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pdf_render(
    app: tauri::AppHandle,
    sha: String,
    page: u32,
    scale: f64,
    x: i64,
    y: i64,
    w: Option<i64>,
    h: Option<i64>,
    packed: bool,
) -> Result<tauri::ipc::Response, String> {
    let (head, bytes) = ask_drawn(&app, json!({"op": "render", "sha": sha, "page": page, "scale": scale, "x": x, "y": y, "w": w, "h": h, "packed": packed})).await?;
    let mut out = Vec::with_capacity(16 + bytes.len());
    out.extend_from_slice(&(head["w"].as_u64().unwrap_or(0) as u32).to_le_bytes());
    out.extend_from_slice(&(head["h"].as_u64().unwrap_or(0) as u32).to_le_bytes());
    out.extend_from_slice(&(head["ms"].as_f64().unwrap_or(0.0) as f32).to_le_bytes());
    out.extend_from_slice(&u32::from(head["packed"] == json!(true)).to_le_bytes());
    out.extend_from_slice(&bytes);
    Ok(tauri::ipc::Response::new(out))
}

/// The links on a page: where each lies, in points from the page's top
/// left, and where it goes - a page, and how far down it, in points; or a
/// web page, by its address.
#[tauri::command]
pub async fn pdf_links(app: tauri::AppHandle, sha: String, page: u32) -> Result<Value, String> {
    let (head, _) = ask(&app, json!({"op": "links", "sha": sha, "page": page})).await?;
    Ok(head["links"].clone())
}

/// A page's letters, as PDFium reads them: for each, 20 bytes - its
/// character (u32), and its box (four f32s: left, top, right, bottom, in
/// points from the page's top left as it is drawn; all naught for one
/// PDFium put there itself, a space or a line's end).
#[tauri::command]
pub async fn pdf_text(app: tauri::AppHandle, sha: String, page: u32) -> Result<tauri::ipc::Response, String> {
    let (_, bytes) = ask(&app, json!({"op": "text", "sha": sha, "page": page})).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// What a page is made of - its words, paths, pictures, shadings and forms - each where it lies: 20 bytes each (`objects`).
#[tauri::command]
pub async fn pdf_objects(app: tauri::AppHandle, sha: String, page: u32) -> Result<tauri::ipc::Response, String> {
    let (_, bytes) = ask(&app, json!({"op": "objects", "sha": sha, "page": page})).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// What a figure on a page is drawn with, within a box (points from its top
/// left): its paths, each its segments where they lie, filled or stroked
/// and how thick; its letters, each with its box, where its baseline
/// starts and its size; and its pictures' boxes (`figure`).
#[tauri::command]
pub async fn pdf_figure(app: tauri::AppHandle, sha: String, page: u32, r#box: [f32; 4]) -> Result<Value, String> {
    let (head, _) = ask(&app, json!({"op": "figure", "sha": sha, "page": page, "box": r#box})).await?;
    Ok(head)
}

#[cfg(test)]
mod tests {
    use super::*;

    // (the review of #318: a write waiting for room in the pipe of a reader
    // that had stopped reading held Meno's hold on the reader, which its stop
    // needed - PDFs were dead until Meno was started again)
    #[cfg(unix)]
    #[test]
    fn a_reader_that_stopped_reading_is_stopped_while_a_write_waits_on_it() {
        let mut child = Command::new("sleep").arg("30").stdin(Stdio::piped()).stdout(Stdio::null()).spawn().unwrap();
        let stdin = child.stdin.take().unwrap();
        let reader = Arc::new(Reader { child: Mutex::new(child), stdin: Mutex::new(stdin), waiting: Arc::new(Mutex::new(HashMap::new())), next: AtomicU64::new(1) });
        let (tx, rx) = std::sync::mpsc::channel();
        let asking = reader.clone();
        std::thread::spawn(move || {
            // (a megabyte a request: the pipe is full at the first, and the write waits)
            let big = json!({"op": "page", "pad": "x".repeat(1 << 20)});
            let ended = (0..8).map(|_| asking.ask(big.clone()).map(|_| ())).find(Result::is_err);
            let _ = tx.send(ended);
        });
        std::thread::sleep(std::time::Duration::from_millis(300));
        assert!(rx.try_recv().is_err(), "the write is waiting");
        // (stopped from beside it: the write holds the reader's input alone)
        let started = Instant::now();
        reader.stop();
        let ended = rx.recv_timeout(std::time::Duration::from_secs(10)).expect("the write ended once the reader was stopped");
        assert!(matches!(ended, Some(Err(_))));
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert!(reader.gone());
    }

    #[test]
    fn a_pdf_locked_with_a_password_is_said_to_be() {
        let locked = unreadable(PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError));
        assert_eq!(locked, "it is locked with a password");
        let broken = unreadable(PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::FormatError));
        assert_eq!(broken, "it is damaged, or is not a PDF");
        // (no error's name for the person: a PDF cut short reads as damaged, anything else as not opened)
        let other = unreadable(PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::FileError));
        assert_eq!(other, "Meno could not open it");
    }

    #[test]
    fn a_file_too_large_is_refused_before_it_is_read() {
        let dir = std::env::temp_dir().join(format!("meno-pdf-most-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.pdf");
        std::fs::write(&file, b"%PDF-1.7\n0123456789").unwrap();
        assert_eq!(read_at_most(&file, 64).unwrap(), b"%PDF-1.7\n0123456789");
        assert_eq!(read_at_most(&file, 8).unwrap_err(), "it is too large");
        assert!(read_at_most(&dir.join("none.pdf"), 64).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_pdf_is_known_by_its_start() {
        assert!(looks_like_pdf(b"%PDF-1.7\n..."));
        assert!(looks_like_pdf(b"\xef\xbb\xbf%PDF-1.4"));
        assert!(!looks_like_pdf(b"<html>"));
        assert!(!looks_like_pdf(b""));
    }

    #[test]
    fn only_a_sha256_names_a_held_pdf() {
        assert!(is_sha(&"a".repeat(64)));
        assert!(!is_sha(&"A".repeat(64)));
        assert!(!is_sha("../../etc/passwd"));
        assert!(!is_sha(&"a".repeat(63)));
    }

    /// A PDF of three pages, written here: on the first, a link to a place
    /// half way down the third, and one to a web page.
    fn linked_pdf() -> Vec<u8> {
        let contents = [
            "BT /F1 14 Tf 72 700 Td (To page three) Tj ET",
            "BT /F1 14 Tf 72 700 Td (Two) Tj ET 0 0 1 RG 2 w 100 300 200 150 re S",
            "BT /F1 14 Tf 72 700 Td (Three) Tj ET",
        ];
        let mut objs: Vec<(u32, String)> = vec![
            (1, "<< /Type /Catalog /Pages 2 0 R >>".into()),
            (2, "<< /Type /Pages /Kids [10 0 R 11 0 R 12 0 R] /Count 3 >>".into()),
            (3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into()),
        ];
        for (i, c) in contents.iter().enumerate() {
            let annots = if i == 0 { " /Annots [30 0 R 31 0 R]" } else { "" };
            objs.push((10 + i as u32, format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {} 0 R{annots} >>", 20 + i)));
            objs.push((20 + i as u32, format!("<< /Length {} >>\nstream\n{c}\nendstream", c.len())));
        }
        objs.push((30, "<< /Type /Annot /Subtype /Link /Rect [70 692 292 716] /Dest [12 0 R /XYZ 0 470 null] >>".into()));
        objs.push((31, "<< /Type /Annot /Subtype /Link /Rect [70 652 202 676] /A << /S /URI /URI (https://example.com/) >> >>".into()));
        pdf_of(objs)
    }

    /// A PDF of the objects given, numbered as they are, with its table of where each lies.
    fn pdf_of(mut objs: Vec<(u32, String)>) -> Vec<u8> {
        objs.sort_by_key(|o| o.0);
        let mut out = String::from("%PDF-1.7\n");
        let mut at = std::collections::BTreeMap::new();
        for (n, body) in &objs {
            at.insert(*n, out.len());
            out += &format!("{n} 0 obj\n{body}\nendobj\n");
        }
        let xref = out.len();
        let size = objs.last().unwrap().0 + 1;
        out += &format!("xref\n0 {size}\n0000000000 65535 f \n");
        for n in 1..size {
            out += &match at.get(&n) {
                Some(o) => format!("{o:010} 00000 n \n"),
                None => "0000000000 65535 f \n".to_string(),
            };
        }
        out += &format!("trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        out.into_bytes()
    }

    #[test]
    fn a_pages_links_are_read_where_they_lie_and_where_they_go() {
        // (PDFium as the build fetched it: scripts/fetch-pdfium.mjs)
        let Ok(bindings) = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) else {
            eprintln!("PDFium is not here: node scripts/fetch-pdfium.mjs");
            return;
        };
        let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
        let cache = std::env::temp_dir().join(format!("meno-pdf-links-{}", std::process::id()));
        std::fs::create_dir_all(&cache).unwrap();
        let sha = "c".repeat(64);
        std::fs::write(cache.join(format!("{sha}.pdf")), linked_pdf()).unwrap();
        let mut docs = HashMap::new();
        let (head, _) = answer(&mut docs, pdfium, &cache, &json!({"op": "links", "sha": sha, "page": 0})).unwrap();
        let links = head["links"].as_array().unwrap();
        assert_eq!(links.len(), 2);
        // (from the page's top left, in points: its box 842 points tall)
        let near = |v: &Value, want: f64| (v.as_f64().unwrap() - want).abs() < 0.5;
        let place = &links[0];
        assert_eq!(place["page"], json!(2));
        assert!(near(&place["y"], 842.0 - 470.0));
        let rect = place["rect"].as_array().unwrap();
        assert!(near(&rect[0], 70.0) && near(&rect[1], 842.0 - 716.0) && near(&rect[2], 292.0) && near(&rect[3], 842.0 - 692.0));
        assert_eq!(links[1]["uri"], json!("https://example.com/"));
        let (none, _) = answer(&mut docs, pdfium, &cache, &json!({"op": "links", "sha": sha, "page": 1})).unwrap();
        assert_eq!(none["links"], json!([]));
        // its letters, each where it lies: "To page three", in Helvetica at 14 points from (72, 700)
        let (head, bytes) = answer(&mut docs, pdfium, &cache, &json!({"op": "text", "sha": sha, "page": 0})).unwrap();
        let n = head["n"].as_u64().unwrap() as usize;
        assert_eq!(bytes.len(), n * 20);
        let letter = |i: usize| {
            let f = |k: usize| f32::from_le_bytes(bytes[i * 20 + 4 + k * 4..i * 20 + 8 + k * 4].try_into().unwrap());
            (char::from_u32(u32::from_le_bytes(bytes[i * 20..i * 20 + 4].try_into().unwrap())).unwrap(), [f(0), f(1), f(2), f(3)])
        };
        let text: String = (0..n).map(|i| letter(i).0).collect();
        assert_eq!(text, "To page three");
        let (t, b) = letter(0);
        assert_eq!(t, 'T');
        assert!((b[0] - 72.0).abs() < 1.0, "{b:?}");
        // (its baseline 142 points from the top: the box above it, and a little below)
        assert!(b[1] < 842.0 - 700.0 && b[3] > 842.0 - 700.0, "{b:?}");
        // what the second page is made of: its word, and a box drawn round 100..300 across, 300..450 up
        let (head, bytes) = answer(&mut docs, pdfium, &cache, &json!({"op": "objects", "sha": sha, "page": 1})).unwrap();
        let n = head["n"].as_u64().unwrap() as usize;
        assert_eq!(bytes.len(), n * 20);
        let object = |i: usize| {
            let f = |k: usize| f32::from_le_bytes(bytes[i * 20 + 4 + k * 4..i * 20 + 8 + k * 4].try_into().unwrap());
            (u32::from_le_bytes(bytes[i * 20..i * 20 + 4].try_into().unwrap()), [f(0), f(1), f(2), f(3)])
        };
        let kinds: Vec<u32> = (0..n).map(|i| object(i).0).collect();
        assert_eq!(kinds, vec![1, 2]);
        let (_, b) = object(1);
        // (a stroke two points wide reaches a point beyond the path)
        assert!((b[0] - 99.0).abs() < 1.5 && (b[1] - (842.0 - 451.0)).abs() < 1.5 && (b[2] - 301.0).abs() < 1.5 && (b[3] - (842.0 - 299.0)).abs() < 1.5, "{b:?}");
        drop(docs);
        let _ = std::fs::remove_dir_all(&cache);
    }

    /// A page as a journal prints a figure: a figure's form - its own
    /// matrix moving it 10 points along - placed at half its size, holding
    /// a line 100 points long and an O; and a wedge and a dashed line drawn
    /// on the page.
    fn figure_pdf() -> Vec<u8> {
        let form = "0.6 w 0 0 m 100 0 l S BT /F1 10 Tf 0 20 Td (O) Tj ET";
        let page = "q 0.5 0 0 0.5 100 400 cm /Fm1 Do Q 0 0 0 rg 300 300 m 320 298 l 320 302 l h f [3 2] 0 d 400 300 m 450 300 l S";
        pdf_of(vec![
            (1, "<< /Type /Catalog /Pages 2 0 R >>".into()),
            (2, "<< /Type /Pages /Kids [10 0 R] /Count 1 >>".into()),
            (3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into()),
            (5, format!("<< /Type /XObject /Subtype /Form /BBox [0 0 200 200] /Matrix [1 0 0 1 10 0] /Resources << /Font << /F1 3 0 R >> >> /Length {} >>\nstream\n{form}\nendstream", form.len())),
            (10, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Fm1 5 0 R >> >> /Contents 20 0 R >>".into()),
            (20, format!("<< /Length {} >>\nstream\n{page}\nendstream", page.len())),
        ])
    }

    #[test]
    fn a_figures_paths_and_letters_are_read_where_they_are_drawn() {
        let Ok(bindings) = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) else {
            eprintln!("PDFium is not here: node scripts/fetch-pdfium.mjs");
            return;
        };
        let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
        let cache = std::env::temp_dir().join(format!("meno-pdf-figure-{}", std::process::id()));
        std::fs::create_dir_all(&cache).unwrap();
        let sha = "d".repeat(64);
        std::fs::write(cache.join(format!("{sha}.pdf")), figure_pdf()).unwrap();
        let mut docs = HashMap::new();
        let (head, _) = answer(&mut docs, pdfium, &cache, &json!({"op": "figure", "sha": sha, "page": 0})).unwrap();
        let paths = head["paths"].as_array().unwrap();
        assert_eq!(paths.len(), 3);
        let near = |v: &Value, want: f64| (v.as_f64().unwrap() - want).abs() < 0.05;
        // the form's line: moved 10 by its own matrix, then halved and placed at (100, 400) - 442 from the top
        let line = &paths[0];
        assert!(line["fill"].is_null() && line["stroke"].is_string());
        let d = line["d"].as_array().unwrap();
        assert_eq!(d[0][0], json!("M"));
        assert!(near(&d[0][1], 105.0) && near(&d[0][2], 442.0), "{d:?}");
        assert_eq!(d[1][0], json!("L"));
        assert!(near(&d[1][1], 155.0) && near(&d[1][2], 442.0), "{d:?}");
        assert!(near(&line["width"], 0.3), "{line:?}");
        assert_eq!(line["dash"], json!(false));
        // the wedge: filled, closed, where it was drawn
        let wedge = &paths[1];
        assert!(wedge["fill"].is_string() && wedge["stroke"].is_null());
        let d = wedge["d"].as_array().unwrap();
        assert!(near(&d[0][1], 300.0) && near(&d[0][2], 542.0), "{d:?}");
        assert!(d.iter().any(|s| s[0] == json!("Z")));
        // the dashed line: said to be dashed
        assert_eq!(paths[2]["dash"], json!(true), "{:?}", paths[2]);
        // the O, half its size, its baseline where the form's matrices put it
        let letters = head["letters"].as_array().unwrap();
        assert_eq!(letters.len(), 1);
        assert_eq!(letters[0]["c"], json!("O"));
        assert!(near(&letters[0]["size"], 5.0), "{:?}", letters[0]);
        assert!(near(&letters[0]["at"][0], 105.0) && near(&letters[0]["at"][1], 432.0), "{:?}", letters[0]);
        // (its loose box from where it starts, holding its ink: how far apart letters are set)
        let (ink, loose) = (&letters[0]["box"], &letters[0]["loose"]);
        let f = |v: &Value, i: usize| v[i].as_f64().unwrap();
        assert!((f(loose, 0) - 105.0).abs() < 0.2 && f(loose, 0) <= f(ink, 0) + 0.01 && f(loose, 2) >= f(ink, 2) - 0.01, "{:?}", letters[0]);
        // (its line reads left to right)
        assert!(letters[0]["dir"].as_f64().unwrap().abs() < 0.01, "{:?}", letters[0]);
        // within a box round the wedge alone, the wedge alone
        let (head, _) = answer(&mut docs, pdfium, &cache, &json!({"op": "figure", "sha": sha, "page": 0, "box": [290, 530, 330, 550]})).unwrap();
        assert_eq!(head["paths"].as_array().unwrap().len(), 1);
        assert_eq!(head["letters"].as_array().unwrap().len(), 0);
        drop(docs);
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn a_lone_plus_is_told_from_other_words() {
        let Ok(bindings) = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) else {
            eprintln!("PDFium is not here: node scripts/fetch-pdfium.mjs");
            return;
        };
        let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
        let cache = std::env::temp_dir().join(format!("meno-pdf-plus-{}", std::process::id()));
        std::fs::create_dir_all(&cache).unwrap();
        let sha = "f".repeat(64);
        // (words with a + among them, and a + set alone, as a scheme sets one between its compounds)
        let page = "BT /F1 10 Tf 100 700 Td (A + B) Tj ET BT /F1 12 Tf 200 700 Td (+) Tj ET";
        let pdf = pdf_of(vec![
            (1, "<< /Type /Catalog /Pages 2 0 R >>".into()),
            (2, "<< /Type /Pages /Kids [10 0 R] /Count 1 >>".into()),
            (3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into()),
            (10, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 20 0 R >>".into()),
            (20, format!("<< /Length {} >>\nstream\n{page}\nendstream", page.len())),
        ]);
        std::fs::write(cache.join(format!("{sha}.pdf")), pdf).unwrap();
        let mut docs = HashMap::new();
        let (head, bytes) = answer(&mut docs, pdfium, &cache, &json!({"op": "objects", "sha": sha, "page": 0})).unwrap();
        let n = head["n"].as_u64().unwrap() as usize;
        let kinds: Vec<u32> = (0..n).map(|i| u32::from_le_bytes(bytes[i * 20..i * 20 + 4].try_into().unwrap())).collect();
        assert_eq!(kinds, vec![1, 6]);
        drop(docs);
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn a_turned_pages_letters_read_down_it() {
        let Ok(bindings) = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&library_dir())) else {
            eprintln!("PDFium is not here: node scripts/fetch-pdfium.mjs");
            return;
        };
        let pdfium: &'static Pdfium = Box::leak(Box::new(Pdfium::new(bindings)));
        let cache = std::env::temp_dir().join(format!("meno-pdf-turned-{}", std::process::id()));
        std::fs::create_dir_all(&cache).unwrap();
        let sha = "e".repeat(64);
        // (a page turned a quarter as it is shown, its words set as on any page: they read down it)
        let page = "BT /F1 10 Tf 100 700 Td (OH) Tj ET";
        let pdf = pdf_of(vec![
            (1, "<< /Type /Catalog /Pages 2 0 R >>".into()),
            (2, "<< /Type /Pages /Kids [10 0 R] /Count 1 >>".into()),
            (3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into()),
            (10, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate 90 /Resources << /Font << /F1 3 0 R >> >> /Contents 20 0 R >>".into()),
            (20, format!("<< /Length {} >>\nstream\n{page}\nendstream", page.len())),
        ]);
        std::fs::write(cache.join(format!("{sha}.pdf")), pdf).unwrap();
        let mut docs = HashMap::new();
        let (head, _) = answer(&mut docs, pdfium, &cache, &json!({"op": "figure", "sha": sha, "page": 0})).unwrap();
        let letters = head["letters"].as_array().unwrap();
        assert_eq!(letters.len(), 2);
        for l in letters {
            assert!((l["dir"].as_f64().unwrap() - std::f64::consts::FRAC_PI_2).abs() < 0.01, "{l:?}");
        }
        drop(docs);
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn a_picture_packs_as_a_png_that_reads_back() {
        let (w, h) = (64u32, 32u32);
        let rgba: Vec<u8> = (0..w * h).flat_map(|i| [(i % 251) as u8, 255, 255, 255]).collect();
        let png = png_of(&rgba, w, h).unwrap();
        let mut reader = png::Decoder::new(std::io::Cursor::new(png)).read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (w, h));
        assert_eq!(&buf[..info.buffer_size()], &rgba[..]);
    }

    #[test]
    fn parts_of_pages_are_drawn_by_the_readers_besides_the_first() {
        assert_eq!((0..4).map(|t| drawing_slot(t, 1)).collect::<Vec<_>>(), [0, 0, 0, 0]);
        assert_eq!((0..4).map(|t| drawing_slot(t, 2)).collect::<Vec<_>>(), [1, 1, 1, 1]);
        assert_eq!((0..4).map(|t| drawing_slot(t, 3)).collect::<Vec<_>>(), [1, 2, 1, 2]);
    }

    #[test]
    fn a_reader_keeps_the_pdfs_last_asked_about_open() {
        let mut docs: HashMap<String, ()> = HashMap::new();
        let mut used = std::collections::VecDeque::new();
        for sha in ["a", "b", "c", "a", "d"] {
            docs.insert(sha.into(), ());
            keep_open(&mut docs, &mut used, sha, 3);
        }
        // (b, asked about longest ago, closed; a, asked about again, kept)
        let mut open: Vec<_> = docs.keys().cloned().collect();
        open.sort();
        assert_eq!(open, ["a", "c", "d"]);
        // (one closed by asking stays closed)
        docs.remove("c");
        keep_open(&mut docs, &mut used, "a", 3);
        let mut open: Vec<_> = docs.keys().cloned().collect();
        open.sort();
        assert_eq!(open, ["a", "d"]);
    }

    #[test]
    fn parts_of_pages_are_drawn_by_one_reader_to_three() {
        let n = drawers();
        assert!((1..=3).contains(&n), "{n}");
    }
}
