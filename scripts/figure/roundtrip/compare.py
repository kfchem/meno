"""Stage 5 of the round trip (README.md): what was drawn, and what was read
back, against the truth - with the RDKit plugin's Python.

Each MOL block is read by RDKit as a MOL file is (its wedges and its double
bonds' geometry giving the stereochemistry) and compared with the truth by
canonical SMILES, stereochemistry, isotopes and charges kept. Where they
differ, what differs: the formula, the bonds, the charges, the isotopes or
the stereochemistry alone (the same SMILES without it). A reaction's read
is compared side by side - its reactants, agents and products, each the
molecules read there - and where a side differs, which. Written to
.roundtrip/report.json and .roundtrip/report.md.

    <chem python> scripts/figure/roundtrip/compare.py [--read=<folder under .roundtrip>]

`--read` compares the reads kept there (read.stage.ts's RT_READ), and
writes its report there.
"""

import json
import pathlib
import sys
from collections import defaultdict

from rdkit import Chem, RDLogger
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

RDLogger.DisableLog("rdApp.*")
ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / ".roundtrip"


def flat(smiles):
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    Chem.RemoveStereochemistry(m)
    return Chem.MolToSmiles(m)


def plain(smiles):
    """The SMILES with no isotopes and no charges: the skeleton and its bond orders."""
    m = Chem.MolFromSmiles(smiles, sanitize=False)
    if m is None:
        return None
    for a in m.GetAtoms():
        a.SetIsotope(0)
    Chem.RemoveStereochemistry(m)
    return Chem.MolToSmiles(m)


def verdict(truth, molblock):
    """'ok', or what differs from the truth."""
    if not molblock:
        return "not drawn or not read", None
    m = Chem.MolFromMolBlock(molblock, removeHs=True)
    if m is None:
        m = Chem.MolFromMolBlock(molblock, sanitize=False, removeHs=False)
        return ("unreadable as a molecule" if m is None else "not a valid molecule (valence)"), None
    got = Chem.MolToSmiles(m)
    if got == truth:
        return "ok", got
    t = Chem.MolFromSmiles(truth)
    if CalcMolFormula(m) != CalcMolFormula(t):
        return f"formula {CalcMolFormula(m)} for {CalcMolFormula(t)}", got
    if flat(got) == flat(truth):
        return "stereochemistry", got
    if plain(got) == plain(truth):
        tc = sorted(a.GetFormalCharge() for a in t.GetAtoms() if a.GetFormalCharge())
        gc = sorted(a.GetFormalCharge() for a in m.GetAtoms() if a.GetFormalCharge())
        return ("charges" if tc != gc else "isotopes"), got
    return "bonds", got


SIDES = ("reactants", "agents", "products")


def reaction_verdict(truth, r):
    """'ok', or which sides of a reaction differ from the truth; and what was read on each."""
    if r.get("none"):
        return f"nothing read: {r['none']}", None
    if not r.get("arrows"):
        return "no arrow read", None
    got = {}
    for k in SIDES:
        molblock = (r.get("sides") or {}).get(k) or ""
        m = Chem.MolFromMolBlock(molblock, removeHs=True) if molblock else None
        if molblock and m is None:
            return f"{k}: not a valid molecule (valence)", None
        got[k] = sorted(Chem.MolToSmiles(f) for f in Chem.GetMolFrags(m, asMols=True)) if m else []
    wrong = [k for k in SIDES if got[k] != truth[k]]
    if wrong:
        return "sides differ: " + ", ".join(f"{k} ({len(got[k])} for {len(truth[k])})" for k in wrong), got
    return ("ok" if r["arrows"] == 1 else f"arrows: {r['arrows']} for 1"), got


def main():
    data = json.loads((OUT / "corpus.json").read_text())
    corpus = {m["name"]: m for m in data["molecules"]}
    reactions = {r["name"]: r for r in data.get("reactions", [])}
    drawn = json.loads((OUT / "drawn.json").read_text())
    at = next((OUT / a[7:] for a in sys.argv[1:] if a.startswith("--read=")), OUT)
    read_path = at / "read.json"
    read = json.loads(read_path.read_text())["read"] if read_path.exists() else []
    rows = []
    for d in drawn["drawn"]:
        m = corpus[d["name"]]
        v, got = verdict(m["truth"], d.get("mol"))
        rows.append({"name": d["name"], "category": m["category"], "stage": "drawn", "preset": "", "variant": "", "verdict": v, "got": got, "truth": m["truth"], **({"warning": d["warning"]} if d.get("warning") else {})})
    for r in read:
        if r["name"] in reactions:
            rx = reactions[r["name"]]
            v, got = reaction_verdict(rx, r)
            pluses = max(0, len(rx["reactants"]) - 1) + max(0, len(rx["products"]) - 1)
            rows.append({"name": r["name"], "category": "reaction", "stage": "read", "preset": r["preset"], "variant": r["variant"], "verdict": v, "got": got, "truth": rx["smiles"], "pluses": f"{r.get('pluses', 0)} for {pluses}"})
            continue
        m = corpus[r["name"]]
        v, got = verdict(m["truth"], r.get("mol"))
        if r.get("none"):
            v = f"nothing read: {r['none']}"
        rows.append({"name": r["name"], "category": m["category"], "stage": "read", "preset": r["preset"], "variant": r["variant"], "verdict": v, "got": got, "truth": m["truth"]})
    (at / "report.json").write_text(json.dumps(rows, indent=1))
    # the match rate: drawn, then read by preset and by variant
    lines = ["# Round trip", ""]
    drawn_rows = [r for r in rows if r["stage"] == "drawn"]
    ok = sum(r["verdict"] == "ok" for r in drawn_rows)
    lines.append(f"Drawn: {ok} of {len(drawn_rows)} as the truth ({100 * ok / max(1, len(drawn_rows)):.1f}%)")
    table = defaultdict(lambda: [0, 0])
    for r in rows:
        if r["stage"] != "read":
            continue
        for key in ((r["preset"], r["variant"]), (r["preset"], "all"), ("all", r["variant"]), ("all", "all")):
            table[key][0] += r["verdict"] == "ok"
            table[key][1] += 1
    if table:
        presets = sorted({k[0] for k in table if k[0] != "all"}) + ["all"]
        variants = sorted({k[1] for k in table if k[1] != "all"}) + ["all"]
        lines += ["", "Read back, as the truth (of those drawn as the truth or not):", "", "| preset | " + " | ".join(variants) + " |", "|---" * (len(variants) + 1) + "|"]
        for p in presets:
            cells = []
            for v in variants:
                good, n = table.get((p, v), [0, 0])
                cells.append(f"{good}/{n} ({100 * good / n:.1f}%)" if n else "-")
            lines.append(f"| {p} | " + " | ".join(cells) + " |")
    kinds = defaultdict(list)
    for r in rows:
        if r["verdict"] != "ok":
            kinds[(r["stage"], r["verdict"].split(" ")[0] if r["verdict"].startswith("formula") else r["verdict"])].append(r)
    lines += ["", "What differs:", ""]
    for (stage, kind), rs in sorted(kinds.items(), key=lambda kv: -len(kv[1])):
        names = sorted({r["name"] for r in rs})
        lines.append(f"- {stage}, {kind}: {len(rs)} ({', '.join(names[:12])}{', ...' if len(names) > 12 else ''})")
    (at / "report.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
