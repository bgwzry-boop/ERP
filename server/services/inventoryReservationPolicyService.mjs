export const releasableInventoryReservationStatuses = Object.freeze([
  "生效",
  "active",
  "reserved",
  "部分释放",
  "partially_released",
]);
const releasableStatuses = new Set(releasableInventoryReservationStatuses);

export function createInventoryReservationPolicyService() {
  return Object.freeze({
    isReleasableInventoryReservation,
  });
}

export function isReleasableInventoryReservation(reservation) {
  return releasableStatuses.has(String(reservation?.status ?? "").trim());
}
