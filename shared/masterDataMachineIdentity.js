const defaultBagMachinePattern = /^([1-9])号(?:制袋)?机$/;

export function resolveImportedMasterDataMachineId({ explicitMachineId, machineName, workshop } = {}) {
  const explicit = cleanText(explicitMachineId).toUpperCase();
  if (explicit) return explicit;
  return resolveCanonicalDefaultBagMachineId({ machineName, workshop })
    || buildLegacyImportedMachineId(machineName, workshop);
}

export function resolveCanonicalDefaultBagMachineId({ machineName, workshop } = {}) {
  const match = cleanText(machineName).replace(/\s+/g, "").match(defaultBagMachinePattern);
  if (!match) return "";
  const number = Number(match[1]);
  if (cleanText(workshop) !== `${Math.ceil(number / 3)}号车间`) return "";
  return `BAG-${String(number).padStart(2, "0")}`;
}

export function buildDefaultBagMachineLegacyIds(number) {
  const workshop = `${Math.ceil(number / 3)}号车间`;
  return [
    buildLegacyImportedMachineId(`${number}号机`, workshop),
    buildLegacyImportedMachineId(`${number}号制袋机`, workshop),
  ];
}

export function buildLegacyImportedMachineId(machineName, workshop) {
  const name = cleanText(machineName);
  if (!name) return "";
  return `MACH-IMP-${stableHash(`${name}|${cleanText(workshop)}`)}`;
}

export function resolveConfiguredMasterDataMachine(machines = [], machineId = "") {
  const targetId = cleanText(machineId).toUpperCase();
  if (!targetId) return null;
  return (Array.isArray(machines) ? machines : []).find((machine) => {
    if (cleanText(machine?.machineId ?? machine?.id).toUpperCase() === targetId) return true;
    return getMasterDataMachineLegacyIds(machine).includes(targetId);
  }) ?? null;
}

export function getMasterDataMachineLegacyIds(machine = {}) {
  const aliases = machine?.settings?.legacyMachineIds;
  return [...new Set((Array.isArray(aliases) ? aliases : []).map((value) => cleanText(value).toUpperCase()).filter(Boolean))];
}

function stableHash(value) {
  let hash = 2166136261;
  const text = cleanText(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
