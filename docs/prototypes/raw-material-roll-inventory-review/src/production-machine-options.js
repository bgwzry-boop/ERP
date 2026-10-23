const processMachineTypes = Object.freeze({
  制袋: "bag_making",
  丝印: "screen_printing",
});

export function eligibleProductionMachines(machines, processType) {
  const machineType = processMachineTypes[processType];
  if (!machineType) return [];
  return (machines || []).filter(machine =>
    machine.enabled !== false && machine.status !== "inactive" && machine.machineType === machineType);
}

export function isSelectedProductionMachineAllowed(machines, machineId) {
  return Boolean(machineId) && machines.some(machine => (machine.machineId || machine.id) === machineId);
}
