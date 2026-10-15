/**
 * A measurement's value as it is typed over it (components/Molecule3DView
 * `MeasureField`): a true minus or a hyphen, a decimal point or comma; NaN
 * where nothing, or nothing that is a number, is written - which leaves the
 * measurement as it was. (`Number("")` is 0, which would have set it to as
 * little as it goes.)
 */
export function typedValue(text: string): number {
  const t = text.trim();
  return t ? Number(t.replace("−", "-").replace(",", ".")) : NaN;
}
