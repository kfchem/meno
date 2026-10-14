/**
 * Office's own clip format ("Art::GVML ClipFormat" on Windows,
 * com.microsoft.Art--GVML-ClipFormat on a Mac): a small package - a zip -
 * holding a DrawingML picture and its image. Word and PowerPoint, on either
 * system, take the image from it byte for byte, keep it so in the document,
 * and hand the same package back when the picture is copied again - which
 * is how a structure carried in the image finds its way back to Meno.
 *
 * Written here from DrawingML's own parts, the package holds the picture
 * alone (no theme: Word and PowerPoint take it without one).
 */
import { unzip, zipStored } from "../binary/zip";

const EMU_PER_PT = 12700;

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A clip-format package of one picture: `image` (an EMF or a PNG),
 * `widthPt` by `heightPt` points, named and described for the document's
 * accessibility.
 */
export function gvmlPicture(
  image: Uint8Array,
  kind: "emf" | "png",
  widthPt: number,
  heightPt: number,
  name = "Structure",
  description = "",
): Uint8Array {
  const cx = Math.max(1, Math.round(widthPt * EMU_PER_PT));
  const cy = Math.max(1, Math.round(heightPt * EMU_PER_PT));
  const type = kind === "emf" ? "image/x-emf" : "image/png";
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const contentTypes =
    xml +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    `<Default Extension="${kind}" ContentType="${type}"/>` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/clipboard/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
    "</Types>";
  const packageRels =
    xml +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${rel}/drawing" Target="clipboard/drawings/drawing1.xml"/>` +
    "</Relationships>";
  const xfrm = `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
  const drawing =
    xml +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas">' +
    '<lc:lockedCanvas xmlns:lc="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas">' +
    '<a:nvGrpSpPr><a:cNvPr id="0" name=""/><a:cNvGrpSpPr/></a:nvGrpSpPr>' +
    `<a:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm></a:grpSpPr>` +
    "<a:pic>" +
    `<a:nvPicPr><a:cNvPr id="2" name="${escapeXml(name)}" descr="${escapeXml(description)}"/>` +
    '<a:cNvPicPr><a:picLocks noChangeAspect="1"/></a:cNvPicPr></a:nvPicPr>' +
    `<a:blipFill><a:blip xmlns:r="${rel}" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>` +
    `<a:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></a:spPr>` +
    "</a:pic></lc:lockedCanvas></a:graphicData></a:graphic>";
  const drawingRels =
    xml +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${rel}/image" Target="../media/image1.${kind}"/>` +
    "</Relationships>";
  return zipStored([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: packageRels },
    { name: "clipboard/drawings/drawing1.xml", data: drawing },
    { name: "clipboard/drawings/_rels/drawing1.xml.rels", data: drawingRels },
    { name: `clipboard/media/image1.${kind}`, data: image },
  ]);
}

/**
 * The images in a clip-format package - Office's, or Meno's - by name: only
 * they are inflated, and none are had from a package that is no zip, or
 * whose images would come to more than a zip is unpacked to (binary/zip).
 */
export function gvmlImages(pkg: Uint8Array): { name: string; data: Uint8Array }[] {
  const files = unzip(pkg, (name) => /(^|\/)media\/[^/]+$/.test(name));
  return files ? [...files].map(([name, data]) => ({ name, data })) : [];
}
