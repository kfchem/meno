"""Tests for the PySCF plugin's worker (src-tauri/resources/plugins/pyscf/worker.py).

They need PySCF and cclib, so they run in an environment pixi makes from the
plugin's lock:

    cp src-tauri/resources/plugins/pyscf/pixi.* /tmp/pyscf-env/
    pixi install --frozen --manifest-path /tmp/pyscf-env/pixi.toml
    /tmp/pyscf-env/.pixi/envs/default/bin/python -m unittest scripts/calc/test_reader_pyscf.py

The outputs they read are not in the repository (docs/WORKSPACE.md, stage
3): cclib's samples in calc-samples/ (as for the cclib reader's tests), and
water.molden in calc-samples/cube/, written by PySCF itself. Those tests are
skipped where the files are not there.
"""

import base64
import importlib.util
import json
import pathlib
import unittest

import numpy

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/pyscf/worker.py"
SAMPLES = ROOT / "calc-samples"
spec = importlib.util.spec_from_file_location("reader_pyscf", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
ANGSTROM_PER_BOHR = 0.529177210903


def ask(op, path, **more):
    line = json.dumps({"id": 1, "op": op, "name": path.name, "text": path.read_text(encoding="utf-8"), **more})
    a = worker.answer(line)
    if not a["ok"]:
        raise AssertionError(a["error"])
    return a["result"]


def sample(rel):
    path = SAMPLES / rel
    if not path.exists():
        raise unittest.SkipTest(f"no {rel} in calc-samples/")
    return path


def result(r, id_):
    return next((x for x in r["results"] if x["id"] == id_), None)


def integral(grid, f):
    """The sum of `f` of a grid's values times each point's volume (bohr³)."""
    values = numpy.frombuffer(base64.b64decode(grid["values"]), dtype="<f4")
    step = [a[k] / ANGSTROM_PER_BOHR for k, a in enumerate(grid["axes"])]
    assert len(values) == grid["counts"][0] * grid["counts"][1] * grid["counts"][2]
    return float(f(values.astype(float)).sum() * step[0] * step[1] * step[2])


class Protocol(unittest.TestCase):
    def test_says_what_it_is_and_answers_a_failure_rather_than_crashing(self):
        # (it says its version in its ready line, not when asked)
        a = worker.answer(json.dumps({"id": 3, "op": "ping"}))
        self.assertEqual((a["id"], a["ok"]), (3, False))
        self.assertFalse(worker.answer(json.dumps({"id": 4, "op": "read", "name": "x.out", "text": "nothing\n"}))["ok"])
        self.assertFalse(worker.answer(json.dumps({"id": 5, "op": "run", "code": "1"}))["ok"])

    def test_shares_no_code_with_another_reader(self):
        self.assertNotIn("import reader_", WORKER.read_text(encoding="utf-8"))


class Molden(unittest.TestCase):
    def test_a_molden_file_its_molecule_its_orbitals_and_their_densities_each_a_promise(self):
        r = ask("read", sample("cube/water.molden"))
        self.assertEqual(r["atoms"], ["O", "H", "H"])
        self.assertEqual(len(r["frames"]), 1)
        orbitals = result(r, "orbitals")
        names = [row["cells"][0] for row in orbitals["rows"]]
        self.assertEqual(names[orbitals["focus"]], "LUMO")
        self.assertTrue(all(row["surface"]["ask"].startswith("orbital:0:") for row in orbitals["rows"]))
        self.assertEqual(result(r, "densities")["rows"][0]["surface"], {"ask": "density:total"})

    def test_an_orbital_asked_for_is_on_a_grid_its_whole_square_one(self):
        r = ask("read", sample("cube/water.molden"))
        homo = next(row for row in result(r, "orbitals")["rows"] if row["cells"][0] == "HOMO")
        g = ask("ask", sample("cube/water.molden"), key=homo["surface"]["ask"])
        self.assertTrue(g["signed"])
        self.assertEqual(g["iso"], 0.05)
        self.assertTrue(all(c <= worker.SIDE_MOST for c in g["counts"]))
        self.assertAlmostEqual(integral(g, lambda v: v * v), 1.0, delta=0.02)

    def test_the_density_asked_for_is_its_occupied_orbitals_squared_point_by_point(self):
        path = sample("cube/water.molden")
        g = ask("ask", path, key="density:total")
        self.assertNotIn("signed", g)
        self.assertEqual(g["iso"], 0.002)
        density = numpy.frombuffer(base64.b64decode(g["values"]), dtype="<f4")
        # (water: five orbitals, two electrons each - on the same grid)
        squares = sum(
            2 * numpy.frombuffer(base64.b64decode(ask("ask", path, key=f"orbital:0:{i}")["values"]), dtype="<f4").astype(float) ** 2
            for i in range(5)
        )
        self.assertLess(float(numpy.abs(density - squares).max()), 1e-3 * float(density.max()))


class Outputs(unittest.TestCase):
    def test_gaussian_with_its_basis_its_orbitals_drawn(self):
        path = sample("Gaussian/dvb_sp.out")
        r = ask("read", path)
        self.assertEqual(len(r["atoms"]), 20)
        self.assertEqual(r["program"], "Gaussian")
        # (what the calculation was, as the program names it)
        self.assertEqual((r["method"], r["basis"]), ("B3LYP", "STO-3G"))
        # (only what it is for: no charges or vibrations - the cclib reader's)
        self.assertEqual({x["id"] for x in r["results"]}, {"orbitals", "densities"})
        homo = next(row for row in result(r, "orbitals")["rows"] if row["cells"][0] == "HOMO")
        self.assertAlmostEqual(integral(ask("ask", path, key=homo["surface"]["ask"]), lambda v: v * v), 1.0, delta=0.02)

    def test_orca_its_p_functions_put_in_molden_order_and_drawn(self):
        path = sample("ORCA/dvb_sp_hf.out")
        r = ask("read", path)
        homo = next(row for row in result(r, "orbitals")["rows"] if row["cells"][0] == "HOMO")
        self.assertAlmostEqual(integral(ask("ask", path, key=homo["surface"]["ask"]), lambda v: v * v), 1.0, delta=0.02)
        # (the valence's share of the density, away from the nuclei, as the grid has it: some, and no more than every electron)
        self.assertTrue(0 < integral(ask("ask", path, key="density:total"), lambda v: numpy.minimum(v, 1.0)) < 70.0)

    def test_an_output_without_its_basis_says_to_open_a_molden_file(self):
        r = ask("read", sample("ORCA/dvb_gopt.out"))
        self.assertEqual(r["method"], "DFT")
        self.assertGreater(len(r["frames"]), 1)
        self.assertIsNone(result(r, "orbitals"))
        self.assertEqual(result(r, "surfaces")["value"], "open a Molden file the program wrote")


if __name__ == "__main__":
    unittest.main()
