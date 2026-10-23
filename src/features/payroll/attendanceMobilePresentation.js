// A missing punch today must not relabel a historical day as today's attendance.
export function findAttendanceDay(days = [], workDate) {
  return days.find((day) => day.workDate === workDate) || null;
}
