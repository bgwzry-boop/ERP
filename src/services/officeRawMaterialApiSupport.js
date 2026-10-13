import { toOfficeApiError } from "./officeApiClientCore.js";

export function toRawMaterialApiError(json, status, fallbackMessage) {
  return toOfficeApiError(json, status, fallbackMessage, {
    sanitizeMessage: ({ message }) => {
      const rawMessage = cleanText(message);
      const unsafe = /(?:foreign key|constraint|sqlstate|insert\s+or\s+update|relation\s+.+does not exist|request body exceeds|load failed|failed to fetch)/iu.test(rawMessage);
      return unsafe ? fallbackMessage : rawMessage || fallbackMessage;
    },
  });
}

export function toNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function cleanText(value) {
  return String(value ?? "").trim();
}
