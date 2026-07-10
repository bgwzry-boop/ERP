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
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

export function buildRequestBodyTooLargeError(maxBytes) {
  const error = new Error(`Request body exceeds the ${maxBytes}-byte JSON limit.`);
  error.statusCode = 413;
  error.code = "REQUEST_BODY_TOO_LARGE";
  return error;
}
