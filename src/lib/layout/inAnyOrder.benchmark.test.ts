import benchmark from "../../../scripts/layout/molecules.json";
import { drawsAlikeInAnyOrder } from "./testdata/inAnyOrder";

drawsAlikeInAnyOrder("the layout benchmark", benchmark.molecules, 8_600); // (tacrolimus)
