import diastereomers from "./testdata/diastereomers.json";
import { readsBackAsGiven } from "./testdata/readBack";

// (written by scripts/layout/diastereomers.py)
readsBackAsGiven("the one-centre diastereomers of the bridged molecules", diastereomers.molecules);
