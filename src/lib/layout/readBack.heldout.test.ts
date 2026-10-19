import heldOut from "../../../scripts/layout/heldout.json";
import { readsBackAsGiven } from "./testdata/readBack";

readsBackAsGiven("the held-out natural products", heldOut.molecules, 16_000); // (aconitine)
