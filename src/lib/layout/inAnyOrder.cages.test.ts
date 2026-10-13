import { drawsAlikeInAnyOrder } from "./testdata/inAnyOrder";

// (cages of three-bonded CH whose atoms ranks refined by their neighbours
// never part, though they are not all alike: canonical.ts takes each first
// in turn, L8's review of #319)
drawsAlikeInAnyOrder("cages ranks leave alike", [
  { name: "cuneane", smiles: "C12C3C4C3C2C5C4C51" },
  { name: "basketane", smiles: "C12C3C4C5C3C2C5C4CC1" },
]);
