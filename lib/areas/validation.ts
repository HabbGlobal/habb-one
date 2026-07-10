export const AREA_CAPACITY_RANGE_ERROR =
  "Max. employees per day cannot be lower than min. employees per day.";

// null means "no bound" for either side, so only a same-set comparison can fail.
export function isValidAreaCapacityRange(
  minEmployeesPerDay: number | null,
  maxEmployeesPerDay: number | null
): boolean {
  if (minEmployeesPerDay == null || maxEmployeesPerDay == null) return true;
  return maxEmployeesPerDay >= minEmployeesPerDay;
}
