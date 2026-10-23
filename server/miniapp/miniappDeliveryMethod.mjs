export function normalizeIntakeDeliveryMethod(value) {
  return ({"到厂自提":"自提", "送货上门":"送货", "快递 / 快运到厂提货":"快递快运"})[value] ?? value;
}
