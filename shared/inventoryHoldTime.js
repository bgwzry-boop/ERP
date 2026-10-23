// Factory wall-clock inputs use China time, independent of browser/server TZ.
export function normalizeInventoryHoldTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  if (typeof value !== 'string') return '';
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) return '';
  const [,year,month,day,hour,minute,second='00',fraction='',zone='+08:00'] = match;
  const wall = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}`;
  const wallDate = new Date(`${wall}Z`);
  if (!Number.isFinite(wallDate.getTime()) || wallDate.toISOString().slice(0,19) !== wall.slice(0,19)) return '';
  const instant = new Date(`${wall}${zone}`);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : '';
}
