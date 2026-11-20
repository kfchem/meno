//! A device-independent bitmap (DIB) made from a PNG: what Windows' programs
//! that take only a bitmap - Paint, and many more - paste from the clipboard
//! (CF_DIB). A copy's picture comes from the page as a PNG alone, and its
//! bitmap is made here, where it costs the page nothing.
//!
//! A BITMAPINFOHEADER and the rows after it, bottom row first, three bytes to
//! a pixel in blue-green-red order, each row filled out to a whole number of
//! words. Transparency is laid over white: a program that reads a fourth byte
//! as nothing would otherwise show the empty parts of the drawing black. Its
//! resolution is the PNG's own (pHYs), where it gives one in pixels to the
//! metre.

const HEADER: usize = 40;

/// The DIB of `png`, or why there is none.
pub fn dib_of_png(png: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = png::Decoder::new(png);
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().map_err(|e| format!("the picture to make a bitmap of: {e}"))?;
    let per_metre = match reader.info().pixel_dims {
        Some(d) if d.unit == png::Unit::Meter => i32::try_from(d.xppu).unwrap_or(0),
        _ => 0,
    };
    let mut pixels = vec![0; reader.output_buffer_size()];
    let frame = reader.next_frame(&mut pixels).map_err(|e| format!("the picture to make a bitmap of: {e}"))?;
    let (width, height) = (frame.width as usize, frame.height as usize);
    let channels = match frame.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err("the picture's colours were not expanded".into()),
    };
    let line = frame.line_size;
    let stride = (width * 3).div_ceil(4) * 4;
    let mut out = vec![0u8; HEADER + stride * height];
    out[0..4].copy_from_slice(&(HEADER as u32).to_le_bytes());
    out[4..8].copy_from_slice(&(width as i32).to_le_bytes());
    // (positive: bottom row first)
    out[8..12].copy_from_slice(&(height as i32).to_le_bytes());
    out[12..14].copy_from_slice(&1u16.to_le_bytes()); // planes
    out[14..16].copy_from_slice(&24u16.to_le_bytes()); // bits to a pixel
    // (16..20: BI_RGB, 0)
    out[20..24].copy_from_slice(&((stride * height) as u32).to_le_bytes());
    out[24..28].copy_from_slice(&per_metre.to_le_bytes());
    out[28..32].copy_from_slice(&per_metre.to_le_bytes());
    for y in 0..height {
        let from = &pixels[y * line..y * line + width * channels];
        let row = HEADER + (height - 1 - y) * stride;
        for x in 0..width {
            let p = &from[x * channels..(x + 1) * channels];
            let (r, g, b, a) = match channels {
                1 => (p[0], p[0], p[0], 255),
                2 => (p[0], p[0], p[0], p[1]),
                3 => (p[0], p[1], p[2], 255),
                _ => (p[0], p[1], p[2], p[3]),
            };
            let a = f64::from(a) / 255.0;
            let over = |c: u8| (f64::from(c) * a + 255.0 * (1.0 - a)).round() as u8;
            out[row + 3 * x] = over(b);
            out[row + 3 * x + 1] = over(g);
            out[row + 3 * x + 2] = over(r);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_of(width: u32, height: u32, color: png::ColorType, pixels: &[u8], per_metre: Option<u32>) -> Vec<u8> {
        let mut out = Vec::new();
        let mut enc = png::Encoder::new(&mut out, width, height);
        enc.set_color(color);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_pixel_dims(per_metre.map(|n| png::PixelDimensions { xppu: n, yppu: n, unit: png::Unit::Meter }));
        enc.add_text_chunk("Meno".into(), "a record".into()).unwrap();
        let mut w = enc.write_header().unwrap();
        w.write_image_data(pixels).unwrap();
        w.finish().unwrap();
        out
    }

    // two pixels across, two down: red, clear / half-clear black, blue
    const RGBA: [u8; 16] = [255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 255, 255];

    #[test]
    fn a_bitmap_is_a_bitmapinfoheader_at_24_bits_bottom_row_first_at_the_pictures_resolution() {
        let dib = dib_of_png(&png_of(2, 2, png::ColorType::Rgba, &RGBA, Some(11811))).unwrap();
        let u32_at = |i: usize| u32::from_le_bytes(dib[i..i + 4].try_into().unwrap());
        let i32_at = |i: usize| i32::from_le_bytes(dib[i..i + 4].try_into().unwrap());
        assert_eq!(u32_at(0), 40);
        assert_eq!((i32_at(4), i32_at(8)), (2, 2));
        assert_eq!(u16::from_le_bytes([dib[14], dib[15]]), 24);
        assert_eq!(u32_at(16), 0);
        // 300 dpi, in pixels to the metre
        assert_eq!(i32_at(24), 11811);
        // rows of 6 bytes filled out to 8
        assert_eq!(dib.len(), 40 + 8 * 2);
        assert_eq!(u32_at(20), 16);
    }

    #[test]
    fn each_pixel_is_blue_green_red_the_pictures_top_row_last_over_white() {
        let dib = dib_of_png(&png_of(2, 2, png::ColorType::Rgba, &RGBA, Some(11811))).unwrap();
        let px = |row: usize, x: usize| dib[40 + row * 8 + 3 * x..40 + row * 8 + 3 * x + 3].to_vec();
        // the bottom row of the picture comes first: half-clear black, blue
        assert_eq!(px(0, 0), [127, 127, 127]);
        assert_eq!(px(0, 1), [255, 0, 0]);
        // then the top row: red, and the clear pixel white
        assert_eq!(px(1, 0), [0, 0, 255]);
        assert_eq!(px(1, 1), [255, 255, 255]);
    }

    #[test]
    fn a_picture_with_no_alpha_or_no_resolution_is_made_a_bitmap_too() {
        let dib = dib_of_png(&png_of(1, 1, png::ColorType::Rgb, &[10, 20, 30], None)).unwrap();
        assert_eq!(&dib[40..43], [30, 20, 10]);
        assert_eq!(i32::from_le_bytes(dib[24..28].try_into().unwrap()), 0);
        let dib = dib_of_png(&png_of(1, 1, png::ColorType::GrayscaleAlpha, &[0, 0], None)).unwrap();
        assert_eq!(&dib[40..43], [255, 255, 255]);
    }

    // (what the tests above leave unheld: the header's planes and y resolution, the rest zero; a pHYs of no unit, an aspect ratio
    //  only, is no resolution; a pixel blended over white rounded to the nearest level, not cut)
    #[test]
    fn the_header_is_whole_a_pixel_over_white_is_rounded_and_a_phys_with_no_unit_is_none() {
        let dib = dib_of_png(&png_of(1, 1, png::ColorType::Rgba, &[200, 100, 50, 100], Some(11811))).unwrap();
        assert_eq!(&dib[40..43], [175, 194, 233]);
        assert_eq!(u16::from_le_bytes([dib[12], dib[13]]), 1, "planes");
        assert_eq!(i32::from_le_bytes(dib[28..32].try_into().unwrap()), 11811, "y resolution as x's");
        assert!(dib[16..20].iter().chain(&dib[32..40]).all(|&b| b == 0), "no compression, no palette");
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, 1, 1);
            enc.set_color(png::ColorType::Rgb);
            enc.set_depth(png::BitDepth::Eight);
            enc.set_pixel_dims(Some(png::PixelDimensions { xppu: 3000, yppu: 3000, unit: png::Unit::Unspecified }));
            let mut w = enc.write_header().unwrap();
            w.write_image_data(&[1, 2, 3]).unwrap();
        }
        let dib = dib_of_png(&out).unwrap();
        assert_eq!((i32::from_le_bytes(dib[24..28].try_into().unwrap()), i32::from_le_bytes(dib[28..32].try_into().unwrap())), (0, 0));
    }

    #[test]
    fn what_is_no_png_gives_no_bitmap() {
        assert!(dib_of_png(b"\x89PNG not one").is_err());
        assert!(dib_of_png(b"").is_err());
    }
}
