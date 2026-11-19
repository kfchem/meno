/** What is open below Quick Add's first row (./QuickAdd): nothing, the calculations, the SMILES field, or a group's row. */
export type QuickPanel = "none" | "calculations" | "smiles" | "scheme" | "marks" | "projections";

/** What is open below the row once `id`'s button is pressed: its own, or none where it was open already - one at a time. */
export const toggledPanel = (open: QuickPanel, id: QuickPanel): QuickPanel => (open === id ? "none" : id);

/**
 * Whether Quick Add's Calculations rows are made, with `open` below its row now and `made` whether they were: from the first
 * time Calculations is open - not as Quick Add opens shut on them - and kept from then on, so that they ease shut whole.
 */
export const calcMadeWith = (open: QuickPanel, made: boolean): boolean => made || open === "calculations";
