// Small date helpers shared by the document list's bulk-duplicate feature.

// "YYYY-MM" for the month after the current one (default bulk-duplicate target).
export function nextMonthValue(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Moves a "YYYY-MM-DD" date into the target "YYYY-MM" month, clamping the day
// to the target month's length (e.g. Jan 31 -> Feb 28).
export function dateInMonth(sourceDate: string, targetMonth: string): string {
  const day = Number(sourceDate.slice(8, 10)) || 1;
  const [y, m] = targetMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${targetMonth}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
