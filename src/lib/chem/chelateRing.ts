/**
 * Two donors of one metal that its ligand joins by a ring of this many atoms or fewer, the metal counted, are never
 * across: a chelate's five- or six-membered ring cannot span the metal (found in the chemistry check). Larger rings may - a porphyrin's
 * opposite N, joined only by a ring of ten - so a filled arrangement may put those across; one read stands as read. Read by identity
 * and by the SMILES reader, which refuses a mark that puts two such donors across; kept here so that the reader stays clear of
 * identity's own imports.
 */
export const CHELATE_RING = 7;
