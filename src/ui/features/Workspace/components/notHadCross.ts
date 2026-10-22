/**
 * The mark of a file a workspace keeps that could not be had - damaged in
 * its file, or not in it (lib/doc/notHad): a picture's sheet, or a PDF's
 * page, crossed from corner to corner, as long as it is so.
 */
import * as THREE from "three";

/** Its two lines, corner to corner of a sheet a unit wide and high about its middle: scaled to the sheet it crosses. */
export const NOT_HAD_CROSS = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0], 3));

/** The colour it is drawn in: the page's grey for what it names. */
export const NOT_HAD_COLOR = "#59636e";
