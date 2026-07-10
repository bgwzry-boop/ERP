export async function readJsonRequestBody(request, maxBytes) {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw buildRequestBodyTooLargeError(maxBytes);
  }

  const chunks = [];
  let receivedBytes = 0;
  let bodyTooLarge = false;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) {
      bodyTooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (bodyTooLarge) throw buildRequestBodyTooLargeError(maxBytes);

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const error = new Error("Request body must be a JSON object");
      error.statusCode = 400;
      error.code = "JSON_OBJECT_REQUIRED";
      throw error;
    }
    return parsed;
  } catch (error) {
    if (error?.code === "JSON_OBJECT_REQUIRED") throw error;
    const invalidJsonError = new Error("Request body must be valid JSON");
    invalidJsonError.statusCode = 400;
    throw invalidJsonError;
  }
}

export function buildRequestBodyTooLargeError(maxBytes) {
  const error = new Error(`Request body exceeds the ${maxBytes}-byte JSON limit.`);
  error.statusCode = 413;
  error.code = "REQUEST_BODY_TOO_LARGE";
  return error;
}
