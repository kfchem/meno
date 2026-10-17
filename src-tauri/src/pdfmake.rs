//! A new PDF made from the pages of PDFs held (docs/PDF.md, *A new PDF from
//! pages*): pages taken in the order given - from one PDF or several -
//! each turned as asked, and, where asked, numbered at the foot. The PDFs
//! taken from are never changed: what is made is a PDF of its own, which
//! Meno then holds as any other (pdf.rs `hold`). Done in the PDF reader's
//! process (pdf.rs), with PDFium, as the reader's `make`.

use pdfium_render::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;

/// A page taken: which, of which PDF, and how far it is turned on, clockwise.
#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct Take {
    pub sha: String,
    pub page: PdfPageIndex,
    #[serde(default)]
    pub turn: i32,
}

/// How the pages of what is made are numbered.
#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct Numbers {
    /// Before each number: "" (1, 2, 3), or "S" (S1, S2, S3), as supporting information is.
    #[serde(default)]
    pub prefix: String,
    /// The first page's number.
    pub start: u32,
    /// Where at the foot: "left", "centre" or "right".
    pub at: String,
}

/// What is to be made.
#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct Plan {
    pub pages: Vec<Take>,
    #[serde(default)]
    pub numbers: Option<Numbers>,
}

/// The size of a page number, in points: small, as a journal's.
pub const NUMBER_PT: f32 = 9.0;
/// How far a page number's foot is from the page's foot, and a corner's from its side, in points.
pub const NUMBER_MARGIN_PT: f32 = 28.0;
/// The most pages a PDF made may have.
pub const MOST_PAGES: usize = 5000;

/// A turn, in degrees clockwise, as PDFium says one: a quarter's multiple, as a page can only be turned by.
fn rotation(degrees: i32) -> PdfPageRenderRotation {
    match degrees.rem_euclid(360) {
        90 => PdfPageRenderRotation::Degrees90,
        180 => PdfPageRenderRotation::Degrees180,
        270 => PdfPageRenderRotation::Degrees270,
        _ => PdfPageRenderRotation::None,
    }
}

fn degrees(r: PdfPageRenderRotation) -> i32 {
    match r {
        PdfPageRenderRotation::None => 0,
        PdfPageRenderRotation::Degrees90 => 90,
        PdfPageRenderRotation::Degrees180 => 180,
        PdfPageRenderRotation::Degrees270 => 270,
    }
}

/// The `n`th page's number as it is written: "7", or "S7".
pub fn number_text(numbers: &Numbers, n: usize) -> String {
    format!("{}{}", numbers.prefix, numbers.start as usize + n)
}

/// Where a point of a page as it is shown - `u` across from its left, `v`
/// up from its foot, the page turned `turn` degrees clockwise - lies in the
/// page's own space, its box `[left, bottom, right, top]`.
pub fn unturned(turn: i32, b: [f32; 4], u: f32, v: f32) -> (f32, f32) {
    let [x0, y0, x1, y1] = b;
    match turn.rem_euclid(360) {
        90 => (x1 - v, y0 + u),
        180 => (x1 - u, y1 - v),
        270 => (x0 + v, y1 - u),
        _ => (x0 + u, y0 + v),
    }
}

/// Where a page's number of `width` begins, across the page as it is shown (`shown_w` wide), for `at`.
pub fn number_left(at: &str, shown_w: f32, width: f32) -> f32 {
    match at {
        "left" => NUMBER_MARGIN_PT,
        "right" => shown_w - NUMBER_MARGIN_PT - width,
        _ => (shown_w - width) / 2.0,
    }
}

/// The PDF the plan makes, as its bytes: each page taken from the PDF of
/// its `sha` in `sources` - which holds all of them, opened - into a PDF
/// of its own, turned and numbered as asked.
pub fn make(pdfium: &Pdfium, sources: &HashMap<String, PdfDocument<'static>>, plan: &Plan) -> Result<Vec<u8>, String> {
    if plan.pages.is_empty() {
        return Err("no pages to make a PDF of".into());
    }
    if plan.pages.len() > MOST_PAGES {
        return Err(format!("more than {MOST_PAGES} pages"));
    }
    let mut made = pdfium.create_new_pdf().map_err(|e| e.to_string())?;
    let font = made.fonts_mut().helvetica();
    for (n, take) in plan.pages.iter().enumerate() {
        let source = sources.get(&take.sha).ok_or("a PDF taken from is no longer held")?;
        if take.page < 0 || take.page >= source.pages().len() {
            return Err(format!("no page {} in a PDF taken from", take.page + 1));
        }
        made.pages_mut().copy_page_from_document(source, take.page, n as PdfPageIndex).map_err(|e| e.to_string())?;
        let mut page = made.pages().get(n as PdfPageIndex).map_err(|e| e.to_string())?;
        let turn = (page.rotation().map(degrees).unwrap_or(0) + take.turn).rem_euclid(360);
        page.set_rotation(rotation(turn));
        let Some(numbers) = &plan.numbers else { continue };
        // (the page's box, as PDFium shows it: its crop box, else its media box)
        let r = page.boundaries().crop().or_else(|_| page.boundaries().media()).map(|b| b.bounds).map_err(|e| e.to_string())?;
        let b = [r.left().value, r.bottom().value, r.right().value, r.top().value];
        let shown_w = if turn % 180 == 0 { b[2] - b[0] } else { b[3] - b[1] };
        let mut text = PdfPageTextObject::new(&made, number_text(numbers, n), font, PdfPoints::new(NUMBER_PT)).map_err(|e| e.to_string())?;
        let width = text.width().map(|w| w.value).unwrap_or(NUMBER_PT * 0.56 * number_text(numbers, n).len() as f32);
        // (upright as the page is shown: turned against the page's own turn, at the foot it shows)
        let (x, y) = unturned(turn, b, number_left(&numbers.at, shown_w, width), NUMBER_MARGIN_PT);
        text.rotate_counter_clockwise_degrees(turn as f32).map_err(|e| e.to_string())?;
        text.translate(PdfPoints::new(x), PdfPoints::new(y)).map_err(|e| e.to_string())?;
        page.objects_mut().add_text_object(text).map_err(|e| e.to_string())?;
    }
    made.save_to_bytes().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_number_lies_at_the_foot_of_the_page_as_it_is_shown() {
        // (an A4 page: 595 by 842)
        let b = [0.0, 0.0, 595.0, 842.0];
        // (not turned: its foot)
        assert_eq!(unturned(0, b, 100.0, 28.0), (100.0, 28.0));
        // (turned a quarter clockwise: shown 842 wide, its foot the page's own right edge)
        assert_eq!(unturned(90, b, 100.0, 28.0), (567.0, 100.0));
        // (upside down: its own top)
        assert_eq!(unturned(180, b, 100.0, 28.0), (495.0, 814.0));
        // (turned three quarters: its own left edge)
        assert_eq!(unturned(270, b, 100.0, 28.0), (28.0, 742.0));
        // (a box not at the origin)
        assert_eq!(unturned(0, [10.0, 20.0, 605.0, 862.0], 0.0, 0.0), (10.0, 20.0));
    }

    #[test]
    fn a_number_is_written_and_placed_as_asked() {
        let si = Numbers { prefix: "S".into(), start: 1, at: "centre".into() };
        assert_eq!(number_text(&si, 0), "S1");
        assert_eq!(number_text(&Numbers { prefix: String::new(), start: 12, at: "right".into() }, 2), "14");
        assert_eq!(number_left("centre", 595.0, 15.0), 290.0);
        assert_eq!(number_left("left", 595.0, 15.0), NUMBER_MARGIN_PT);
        assert_eq!(number_left("right", 595.0, 15.0), 595.0 - NUMBER_MARGIN_PT - 15.0);
    }

    /// PDFium, bound for as long as the tests run; none where it is not here.
    fn pdfium() -> Option<&'static Pdfium> {
        let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&crate::pdf::library_dir())).ok()?;
        Some(Box::leak(Box::new(Pdfium::new(bindings))))
    }

    /// A PDF of `n` A4 pages, each saying which it is ("A1", "A2"…), as its bytes.
    fn pages(pdfium: &Pdfium, name: &str, n: usize) -> Vec<u8> {
        let mut doc = pdfium.create_new_pdf().unwrap();
        let font = doc.fonts_mut().helvetica();
        for i in 0..n {
            let mut page = doc.pages_mut().create_page_at_end(PdfPagePaperSize::a4()).unwrap();
            page.objects_mut().create_text_object(PdfPoints::new(72.0), PdfPoints::new(700.0), format!("{name}{}", i + 1), font, PdfPoints::new(24.0)).unwrap();
        }
        doc.save_to_bytes().unwrap()
    }

    #[test]
    fn pages_are_taken_in_order_turned_and_numbered_from_one_pdf_or_several_none_changed() {
        let Some(pdfium) = pdfium() else {
            eprintln!("PDFium is not here: node scripts/fetch-pdfium.mjs");
            return;
        };
        let (a, b) = (pages(pdfium, "A", 3), pages(pdfium, "B", 2));
        let mut sources = HashMap::new();
        sources.insert("a".to_string(), pdfium.load_pdf_from_byte_vec(a.clone(), None).unwrap());
        sources.insert("b".to_string(), pdfium.load_pdf_from_byte_vec(b, None).unwrap());
        let take = |sha: &str, page: PdfPageIndex, turn: i32| Take { sha: sha.into(), page, turn };
        // (the third page first, then the first turned a quarter, then the other PDF's second; numbered S1, S2, S3)
        let plan = Plan {
            pages: vec![take("a", 2, 0), take("a", 0, 90), take("b", 1, 0)],
            numbers: Some(Numbers { prefix: "S".into(), start: 1, at: "centre".into() }),
        };
        let made = pdfium.load_pdf_from_byte_vec(make(pdfium, &sources, &plan).unwrap(), None).unwrap();
        assert_eq!(made.pages().len(), 3);
        // (what each page has written on it, object by object: PDFium's page text reads a turned page within its unturned box, and finds nothing)
        let said: Vec<String> = made.pages().iter().map(|p| p.objects().iter().filter_map(|o| o.as_text_object().map(|t| t.text())).collect::<Vec<_>>().join(" ")).collect();
        for (i, (from, number)) in [("A3", "S1"), ("A1", "S2"), ("B2", "S3")].iter().enumerate() {
            assert!(said[i].contains(from) && said[i].contains(number), "page {}: {:?}", i + 1, said[i]);
        }
        assert_eq!(made.pages().get(1).unwrap().rotation().unwrap(), PdfPageRenderRotation::Degrees90);
        assert_eq!(made.pages().get(0).unwrap().rotation().unwrap(), PdfPageRenderRotation::None);
        // (each number at the foot of the page as it is shown, in its middle: on the turned page, against the page's own right edge)
        let number_at = |page: &PdfPage, text: &str| {
            page.objects().iter().find(|o| o.as_text_object().is_some_and(|t| t.text() == text)).map(|o| o.bounds().unwrap().to_rect())
        };
        let first = number_at(&made.pages().get(0).unwrap(), "S1").unwrap();
        assert!((first.bottom().value - NUMBER_MARGIN_PT).abs() < 6.0, "{first:?}");
        assert!(((first.left().value + first.right().value) / 2.0 - 595.0 / 2.0).abs() < 2.0, "{first:?}");
        let turned = number_at(&made.pages().get(1).unwrap(), "S2").unwrap();
        assert!(turned.right().value > 595.0 - NUMBER_MARGIN_PT - 12.0 && turned.right().value <= 595.0 - NUMBER_MARGIN_PT + 1.0, "{turned:?}");
        assert!(((turned.bottom().value + turned.top().value) / 2.0 - 842.0 / 2.0).abs() < 2.0, "{turned:?}");
        // (the PDF taken from as it was)
        assert_eq!(sources["a"].pages().len(), 3);
        assert!(!sources["a"].save_to_bytes().unwrap().is_empty());
        // (a page not there, and nothing to take: said)
        assert!(make(pdfium, &sources, &Plan { pages: vec![take("a", 7, 0)], numbers: None }).is_err());
        assert!(make(pdfium, &sources, &Plan { pages: vec![], numbers: None }).is_err());
        assert!(make(pdfium, &sources, &Plan { pages: vec![take("c", 0, 0)], numbers: None }).is_err());
        // (pages alone, unnumbered and unturned: nothing written on them)
        let plain = pdfium.load_pdf_from_byte_vec(make(pdfium, &sources, &Plan { pages: vec![take("b", 0, 0)], numbers: None }).unwrap(), None).unwrap();
        let words: Vec<String> = plain.pages().get(0).unwrap().objects().iter().filter_map(|o| o.as_text_object().map(|t| t.text())).collect();
        assert_eq!(words, ["B1"]);
    }

    #[test]
    fn a_plan_reads_as_the_page_sends_it() {
        let plan: Plan = serde_json::from_str(r#"{"pages":[{"sha":"a","page":2,"turn":90},{"sha":"b","page":0}],"numbers":{"prefix":"S","start":1,"at":"centre"}}"#).unwrap();
        assert_eq!(plan.pages[0], Take { sha: "a".into(), page: 2, turn: 90 });
        assert_eq!(plan.pages[1].turn, 0);
        assert_eq!(plan.numbers.unwrap().prefix, "S");
    }
}
