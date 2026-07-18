const releasableStatuses = new Set([
  "生效",
  "active",
  "reserved",
  "部分释放",
  "partially_released",
]);

export function createInventoryReservationPolicyService() {
  return Object.freeze({
    isReleasableInventoryReservation,
  });
}

function isReleasableInventoryReservation(reservation) {
  return releasableStatuses.has(String(reservation?.status ?? "").trim());
}
