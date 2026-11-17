/**
 * Which rings are aromatic in a structure as drawn: each atom's pi electrons
 * by how it stands in its ring system, counted by Meno's rule
 * (lib/chem/perception/aromatic, where the rule is stated and its sources
 * cited) - the rule lib/chem/kekulize and lib/chem/conformersSought take.
 * Worked out in the core (perception/flatRings, foundation part 14 B), and
 * re-exported here for the callers that import it from this file.
 */
export { aromaticAtoms, MOST_PI, piElectrons, type PiState } from "./perception/aromatic";
export { aromaticIn, pairKey, ringSystems } from "./perception/flatRings";
