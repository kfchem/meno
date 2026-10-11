"""Tests for the workers of the plugins that read structures from pictures
(src-tauri/resources/plugins/molscribe/worker.py, .../molnextr/worker.py).

Each stands alone - no code shared - and both are tested alike here. What
needs Python alone runs anywhere, and CI runs it:

    python3 -m unittest scripts/calc/test_plugin_pictures.py

How atoms are put where a picture has them, and which end of a wedge it
draws narrow, need numpy and SciPy - the plugins' environments have them -
and are skipped where they are not installed. The models themselves are
not run here: their trained models are a gigabyte each, downloaded only
when a plugin is added.
"""

import base64
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
PLUGINS = ROOT / "src-tauri/resources/plugins"


def load(plugin):
    spec = importlib.util.spec_from_file_location(f"plugin_{plugin}", PLUGINS / plugin / "worker.py")
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker


WORKERS = {p: load(p) for p in ("molscribe", "molnextr")}

try:
    import numpy as np
    import scipy  # noqa: F401

    SCIENCE = True
except ImportError:
    SCIENCE = False


class Atoms(unittest.TestCase):
    def test_an_element_with_its_charge_or_a_label_as_drawn(self):
        for name, w in WORKERS.items():
            with self.subTest(name):
                self.assertEqual(w.atom_of("C"), {"el": "C"})
                self.assertEqual(w.atom_of("Cl"), {"el": "Cl"})
                # (stereo and hydrogens in brackets are the model's notation, not a label drawn)
                self.assertEqual(w.atom_of("[C@@H]"), {"el": "C"})
                self.assertEqual(w.atom_of("[C@]"), {"el": "C"})
                self.assertEqual(w.atom_of("[Si]"), {"el": "Si"})
                self.assertEqual(w.atom_of("[H]"), {"el": "H"})
                self.assertEqual(w.atom_of("[N+]"), {"el": "N", "charge": 1})
                self.assertEqual(w.atom_of("[O-]"), {"el": "O", "charge": -1})
                self.assertEqual(w.atom_of("[Fe+3]"), {"el": "Fe", "charge": 3})
                self.assertEqual(w.atom_of("[O--]"), {"el": "O", "charge": -2})
                # (aromatic, as SMILES writes it)
                self.assertEqual(w.atom_of("n"), {"el": "N"})
                self.assertEqual(w.atom_of("[nH]"), {"el": "N"})
                # (an isotope is seldom drawn: likely misread, so unsure)
                self.assertEqual(w.atom_of("[2H]"), {"el": "H", "unsure": True})
                # (a group's name, as drawn: Meno reads it as it reads a label typed)
                self.assertEqual(w.atom_of("[OTBS]"), {"label": "OTBS"})
                self.assertEqual(w.atom_of("CO2Me"), {"label": "CO2Me"})
                self.assertEqual(w.atom_of("Ph"), {"label": "Ph"})

    def test_a_wedge_is_said_by_which_end_lies_nearer(self):
        for name, w in WORKERS.items():
            with self.subTest(name):
                self.assertEqual(w.BONDS["single"], (1, None))
                self.assertEqual(w.BONDS["double"], (2, None))
                self.assertEqual(w.BONDS["triple"], (3, None))
                # (the model's 5 at [i][j]: a wedge begun at i, j nearer; 6: j farther)
                self.assertEqual(w.BONDS["solid wedge"], (1, "up"))
                self.assertEqual(w.BONDS["dashed wedge"], (1, "down"))


class Answers(unittest.TestCase):
    def test_answers_only_what_it_reads_and_never_crashes(self):
        for name, w in WORKERS.items():
            with self.subTest(name):
                self.assertEqual(w.answer("not json"), {"ok": False, "error": "not JSON"})
                said = w.answer(json.dumps({"id": 4, "op": "run", "code": "print(1)"}))
                self.assertEqual((said["id"], said["ok"]), (4, False))
                self.assertIn("no such request", said["error"])

    def test_says_where_its_trained_model_is_missing(self):
        for name, w in WORKERS.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as empty:
                w.FILES = empty
                w._model.clear()
                with self.assertRaises(RuntimeError) as e:
                    w.model()
                self.assertIn("trained model is not here", str(e.exception))

    @unittest.skipUnless(SCIENCE, "needs numpy and SciPy")
    def test_a_see_through_picture_is_read_on_white(self):
        from PIL import Image
        import io

        for name, w in WORKERS.items():
            with self.subTest(name):
                im = Image.new("RGBA", (4, 3), (0, 0, 0, 0))
                im.putpixel((1, 1), (0, 0, 0, 255))
                buf = io.BytesIO()
                im.save(buf, "PNG")
                rgb = w.picture_of(base64.b64encode(buf.getvalue()).decode())
                self.assertEqual(rgb.shape, (3, 4, 3))
                self.assertEqual(tuple(rgb[0, 0]), (255, 255, 255))
                self.assertEqual(tuple(rgb[1, 1]), (0, 0, 0))


def drawn(size, lines, width=2):
    """A white picture with black lines drawn on it, each from one point to another, `width` pixels thick."""
    h, w = size
    rgb = np.full((h, w, 3), 255, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    for (x0, y0), (x1, y1), *wide in lines:
        p, q = np.array([x0, y0], float), np.array([x1, y1], float)
        d = q - p
        t = np.clip(((xx - p[0]) * d[0] + (yy - p[1]) * d[1]) / (d @ d), 0, 1)
        dist = np.hypot(xx - (p[0] + t * d[0]), yy - (p[1] + t * d[1]))
        # (a wedge: from nothing at its start to `wide` at its end)
        half = (wide[0] * t / 2) if wide else width / 2
        rgb[dist <= np.maximum(half, width / 2)] = 0
    return rgb


@unittest.skipUnless(SCIENCE, "needs numpy and SciPy")
class Places(unittest.TestCase):
    # a zigzag of four carbons, 40 pixels a bond, as the picture draws it
    PTS = [(40, 80), (75, 60), (110, 80), (145, 60)]
    BONDS = [(0, 1), (1, 2), (2, 3)]

    def picture(self):
        return drawn((140, 190), [(self.PTS[a], self.PTS[b]) for a, b in self.BONDS])

    def test_puts_atoms_given_across_the_structure_where_the_picture_has_them(self):
        xs = [p[0] for p in self.PTS]
        ys = [p[1] for p in self.PTS]
        # (as a model may give them: 0 to 1 across the structure's own extent, each way)
        given = [((x - min(xs)) / (max(xs) - min(xs)), (y - min(ys)) / (max(ys) - min(ys))) for x, y in self.PTS]
        for name, w in WORKERS.items():
            with self.subTest(name):
                got = w.fitted(self.picture(), given, self.BONDS)
                for (x, y), (tx, ty) in zip(got, self.PTS):
                    self.assertLess(np.hypot(x - tx, y - ty), 3, (name, got))

    def test_puts_atoms_given_across_the_cropped_picture_where_the_picture_has_them(self):
        rgb = self.picture()
        dark = rgb.mean(axis=2) < 160
        ys, xs = np.nonzero(dark)
        for name, w in WORKERS.items():
            with self.subTest(name):
                # (as a model may give them: 0 to 1 across the picture as it cropped it, its white round it)
                left, top = xs.min() - w.PAD, ys.min() - w.PAD
                cw, ch = xs.max() + 1 + w.PAD - left, ys.max() + 1 + w.PAD - top
                given = [((x - left) / cw, (y - top) / ch) for x, y in self.PTS]
                got = w.fitted(rgb, given, self.BONDS)
                for (x, y), (tx, ty) in zip(got, self.PTS):
                    self.assertLess(np.hypot(x - tx, y - ty), 3, (name, got))

    def test_tells_which_end_of_a_wedge_is_drawn_narrow(self):
        a, b = (40, 60), (100, 60)
        wedge = drawn((120, 140), [(a, b, 12)]) < 128
        hashed = drawn((120, 140), [((x, 60 - 6 * (x - 40) / 60), (x, 60 + 6 * (x - 40) / 60)) for x in range(44, 101, 7)], width=1.5) < 128
        line = drawn((120, 140), [(a, b)]) < 128
        for name, w in WORKERS.items():
            with self.subTest(name):
                self.assertEqual(w.narrow_end(wedge.any(axis=2), a, b), "a")
                self.assertEqual(w.narrow_end(wedge.any(axis=2), b, a), "b")
                self.assertEqual(w.narrow_end(hashed.any(axis=2), a, b), "a")
                # (as wide all along: not told)
                self.assertIsNone(w.narrow_end(line.any(axis=2), a, b))


if __name__ == "__main__":
    unittest.main()
