import { buildLegacyImportedMachineId, getMasterDataMachineLegacyIds } from "../../shared/masterDataMachineIdentity.js";

const machineTypes = new Set(["bag_making", "screen_printing", "cutting", "packing", "other"]);

// Compatibility with the confirmed bootstrap map only. Unlisted equipment must
// be maintained with an explicit type before an employee import may bind it.
const defaultMachines = [
  ...Array.from({ length: 9 }, (_, index) => {
    const number = index + 1;
    return {
      id: `BAG-${String(number).padStart(2, "0")}`,
      name: `${number}号制袋机`,
      names: [`${number}号制袋机`, `${number}号机`],
      machineType: "bag_making",
      workshop: `${Math.ceil(number / 3)}号车间`,
    };
  }),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `PRINT-${String(index + 1).padStart(2, "0")}`,
    name: `${index + 1}号丝印机`,
    names: [`${index + 1}号丝印机`],
    machineType: "screen_printing",
    workshop: "丝印车间",
  })),
];

export function resolveEmployeeImportMachine(values = {}, configuredMachines = []) {
  const resolved = resolveMachine(values, configuredMachines);
  if (resolved.failedReason) return resolved;
  const machineName = cleanText(values["机台名称"]);
  const defaultName = cleanText(values["默认机台"]);
  if (machineName && defaultName && normalizeName(machineName) !== normalizeName(defaultName)) {
    const defaultResolved = resolveMachine({ ...values, 机台名称: defaultName, 默认机台: "" }, configuredMachines);
    if (defaultResolved.failedReason || defaultResolved.machineId !== resolved.machineId) {
      return { failedReason: "默认机台与机台名称不一致，请核对员工机台分配。" };
    }
  }
  return resolved;
}

function resolveMachine(values, configuredMachines) {
  const explicitId = cleanText(values["机台编号"]).toUpperCase();
  const name = cleanText(values["机台名称"]) || cleanText(values["默认机台"]);
  const workshop = cleanText(values["机台车间"]) || cleanText(values["默认车间"]);
  if (!explicitId && !name) return { machineId: "", workshop };
  if (cleanText(values["机台车间"]) && cleanText(values["默认车间"])
    && cleanText(values["机台车间"]) !== cleanText(values["默认车间"])) {
    return { failedReason: "默认车间与机台车间不一致，请核对员工机台分配。" };
  }

  const machines = Array.isArray(configuredMachines) ? configuredMachines : [];
  const namedDefault = defaultMachines.find((machine) => matchesDefaultName(machine, name));
  const identifiedDefault = defaultMachines.find((machine) => defaultIds(machine).includes(explicitId));
  if (identifiedDefault && namedDefault && identifiedDefault.id !== namedDefault.id) {
    return { failedReason: "机台编号与机台名称指向不同机台，请核对正式机台资料。" };
  }
  const defaultMachine = identifiedDefault || namedDefault;
  const idMatches = explicitId
    ? machines.filter((machine) => machineIds(machine).includes(explicitId))
    : defaultMachine ? machines.filter((machine) => machineIds(machine).includes(defaultMachine.id)) : [];
  if (idMatches.length > 1) return { failedReason: "机台编号或历史编号对应不唯一，请先核对正式机台资料。" };
  const nameMatches = name ? machines.filter((machine) =>
    (normalizeName(machine.name) === normalizeName(name)
      || (defaultMachine && matchesDefaultName(defaultMachine, machine.name)))
      && (!workshop || cleanText(machine.workshop) === workshop)) : [];
  if (!idMatches.length && nameMatches.length > 1) {
    return { failedReason: "机台名称对应不唯一，请填写正式机台编号。" };
  }
  const existing = idMatches[0] || nameMatches[0];
  if (existing) {
    const machineId = cleanText(existing.machineId ?? existing.id);
    if (explicitId && !machineIds(existing).includes(explicitId)) {
      return { failedReason: "该机台已维护为其他编号，请使用正式机台编号，不能重复新建。" };
    }
    if (workshop && workshop !== cleanText(existing.workshop)) {
      return { failedReason: "导入车间与已维护机台车间不一致，请核对后再导入。" };
    }
    const existingDefault = defaultMachines.find((machine) =>
      defaultIds(machine).some((id) => machineIds(existing).includes(id))
        || (matchesDefaultName(machine, existing.name) && machine.workshop === cleanText(existing.workshop)));
    if (name && normalizeName(name) !== normalizeName(existing.name)
      && !machineIds(existing).includes(name.toUpperCase())
      && !(existingDefault && matchesDefaultName(existingDefault, name))) {
      return { failedReason: "导入机台名称与已维护机台不一致，请核对正式机台编号和名称。" };
    }
    if (!machineTypes.has(cleanText(existing.machineType)) || !cleanText(existing.workshop)) {
      return { failedReason: "已维护机台的类型或车间不完整，请先在机台维护中确认。" };
    }
    return {
      machineId,
      name: cleanText(existing.name),
      machineType: cleanText(existing.machineType),
      workshop: cleanText(existing.workshop),
      existing: true,
    };
  }

  if (!defaultMachine) {
    return { failedReason: "机台未匹配到正式资料，不能从名称猜测类型；请先在机台维护中确认编号、类型和车间。" };
  }
  if (explicitId && !defaultIds(defaultMachine).includes(explicitId)) {
    return { failedReason: "机台编号与已确认的默认机台映射不一致，请先在机台维护中确认。" };
  }
  if ((name && !matchesDefaultName(defaultMachine, name))
    || (workshop && workshop !== defaultMachine.workshop)
    || (!explicitId && !workshop)) {
    return { failedReason: "机台名称或车间与已确认的默认机台映射不一致，请先核对。" };
  }
  return {
    machineId: defaultMachine.id,
    name: defaultMachine.name,
    machineType: defaultMachine.machineType,
    workshop: defaultMachine.workshop,
    existing: false,
  };
}

function defaultIds(machine) {
  return [machine.id, ...machine.names.map((name) => buildLegacyImportedMachineId(name, machine.workshop))];
}

function matchesDefaultName(machine, value) {
  return [machine.id, ...machine.names].some((name) => normalizeName(name) === normalizeName(value));
}

function machineIds(machine) {
  return [cleanText(machine.machineId ?? machine.id).toUpperCase(), ...getMasterDataMachineLegacyIds(machine)];
}

function normalizeName(value) {
  return cleanText(value).replace(/\s+/g, "").toUpperCase();
}

function cleanText(value) {
  return String(value ?? "").trim();
}
