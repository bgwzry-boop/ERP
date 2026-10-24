const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const FACTORY_OFFSET_MS = 8 * 60 * MINUTE_MS;

export const ATTENDANCE_MINUTE_CALCULATION_VERSION = "factory-cn-lunch-20261024-v2";
export const SILK_SCREEN_MINUTE_CALCULATION_VERSION = "factory-silk-actual-rest-20261024-v1";
export const REVIEWED_ATTENDANCE_MINUTE_VERSION = "reviewed-minute-snapshot-v1";
export const LEGACY_REVIEWED_ATTENDANCE_MINUTE_VERSION = "legacy-reviewed-pairwise-v1";

// The server resolves this option from employee facts, never the review body.
// Silk-screen work has no fixed lunch deduction: actual rest is reviewed instead.
export function calculateAttendanceWorkMinutes(timestamps = [], { excludeLunch = true } = {}) {
  const segments = [];
  let rawWorkMinutes = 0;
  let workMinutes = 0;
  for (let index = 0; index + 1 < timestamps.length; index += 2) {
    const start = Date.parse(timestamps[index]);
    const end = Date.parse(timestamps[index + 1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    let unpaidMilliseconds = 0;
    const firstFactoryDay = Math.floor((start + FACTORY_OFFSET_MS) / DAY_MS);
    const lastFactoryDay = Math.floor((end - 1 + FACTORY_OFFSET_MS) / DAY_MS);
    for (let day = firstFactoryDay; excludeLunch && day <= lastFactoryDay; day += 1) {
      const lunchStart = day * DAY_MS - FACTORY_OFFSET_MS + 12 * 60 * MINUTE_MS;
      const lunchEnd = lunchStart + 60 * MINUTE_MS;
      unpaidMilliseconds += Math.max(0, Math.min(end, lunchEnd) - Math.max(start, lunchStart));
    }
    const rawMinutes = Math.round((end - start) / MINUTE_MS);
    const paidMinutes = Math.max(0, Math.round((end - start - unpaidMilliseconds) / MINUTE_MS));
    segments.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      rawWorkMinutes: rawMinutes,
      unpaidBreakMinutes: rawMinutes - paidMinutes,
      workMinutes: paidMinutes,
    });
    rawWorkMinutes += rawMinutes;
    workMinutes += paidMinutes;
  }
  return {
    version: excludeLunch ? ATTENDANCE_MINUTE_CALCULATION_VERSION : SILK_SCREEN_MINUTE_CALCULATION_VERSION,
    factoryTimeZone: "Asia/Shanghai",
    breakRule: excludeLunch ? "fixed_lunch" : "actual_rest_review",
    unpaidBreak: excludeLunch ? "12:00–13:00 +08:00" : null,
    rawWorkMinutes,
    unpaidBreakMinutes: rawWorkMinutes - workMinutes,
    workMinutes,
    segments,
  };
}
