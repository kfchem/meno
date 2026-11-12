/** What is open below Quick Add's first row (./QuickAdd): nothing, the calculations, the SMILES field, or a group's row. */
export type QuickPanel = "none" | "calculations" | "smiles" | "scheme" | "marks" | "projections";

/** What is open below the row once `id`'s button is pressed: its own, or none where it was open already - one at a time. */
export const toggledPanel = (open: QuickPanel, id: QuickPanel): QuickPanel => (open === id ? "none" : id);
