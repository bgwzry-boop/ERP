export function createCommandResultHttpAdapterService(dependencies = {}) {
  const { sendBusinessError, sendJson, sendNotFound } = dependencies;
  for (const [name, value] of Object.entries({ sendBusinessError, sendJson, sendNotFound })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  return Object.freeze({
    sendCommandRecord,
    sendCommandResponse,
  });

  function sendCommandRecord(response, result, options = {}) {
    return sendCommandResult(response, result, { ...options, payloadMode: "record" });
  }

  function sendCommandResponse(response, result, options = {}) {
    return sendCommandResult(response, result, { ...options, payloadMode: "response" });
  }

  function sendCommandResult(response, result, options) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new TypeError("command result must be an object");
    }
    if (result.notFound) {
      return sendNotFound(response, result.code || options.notFoundCode);
    }
    if (result.error) {
      return sendBusinessError(
        response,
        result.statusCode,
        result.code,
        result.message,
        options.includeErrorDetails === true ? result.details : undefined,
      );
    }
    const statusCode = options.useResultStatusCode === true
      ? result.statusCode ?? options.statusCode ?? 200
      : options.statusCode ?? 200;
    const payload = options.payloadMode === "record" ? result : result.response;
    return sendJson(response, statusCode, payload);
  }
}
