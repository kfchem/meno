// Tests: plugins' set-ups as their manifests and locks give them, hand-written - each kind Meno sets up and each way a
// lock or a file is fetched that Meno says where from (lib/plugins/setUpSources): packages from the index, a package
// fixed to a repository's archive, a model on Hugging Face, a program fetched whole, conda packages, and PyPI's beside
// them in a pixi lock. Meno carries no plugin; these stand for any.
import type { SetUpFile } from "../lib/plugins/setUpSources";

export type SetUpCase = { id: string; environment: "uv" | "pixi"; lock: string; downloads: SetUpFile[] };

export const SET_UPS: readonly SetUpCase[] = [
  {
    id: "from-the-index",
    environment: "uv",
    lock: "alpha-chem==2026.3.6 \\\n    --hash=sha256:" + "a".repeat(64) + "\nnumpy==2.3.2 \\\n    --hash=sha256:" + "b".repeat(64) + "\n",
    downloads: [],
  },
  {
    id: "from-a-repository",
    environment: "uv",
    lock:
      "torch==2.6.0 \\\n    --hash=sha256:" + "c".repeat(64) + "\n" +
      "reader @ https://github.com/example/reader/archive/0123456789abcdef0123456789abcdef01234567.tar.gz \\\n    --hash=sha256:" + "d".repeat(64) + "\n",
    downloads: [{ name: "Its model", url: "https://huggingface.co/example/reader/resolve/0123456789abcdef/model.pth" }],
  },
  {
    id: "python-alone-and-a-program",
    environment: "uv",
    lock: "# Python alone\n",
    downloads: [{ name: "The program 1.2.3", url: "https://downloads.example.org/release/program-1.2.3-macos-arm64.dmg" }],
  },
  {
    id: "conda-alone",
    environment: "pixi",
    lock: "version: 6\npackages:\n- conda: https://conda.anaconda.org/conda-forge/osx-arm64/beta-6.7.1-h0123456_0.conda\n",
    downloads: [],
  },
  {
    id: "conda-and-pypi",
    environment: "pixi",
    lock:
      "version: 6\npackages:\n- conda: https://conda.anaconda.org/conda-forge/noarch/gamma-1.0.0-pyhd8ed1ab_0.conda\n" +
      "- pypi: https://files.pythonhosted.org/packages/01/23/gamma_extra-2.0.0-py3-none-any.whl\n",
    downloads: [],
  },
];
