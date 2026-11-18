export function normalizeRawMaterialScanCode(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\*|\*$/g, "")
    .replace(/^RAW-MATERIAL:/i, "")
    .trim()
    .toUpperCase();
}
