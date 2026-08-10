export async function readBinaryRequestBody(request, maxBytes, declaredBytes = undefined) {
  const contentLength = Number(request.headers["content-length"]);
  const expectedBytes = Number(declaredBytes);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw binaryBodyTooLarge(maxBytes);
  if (Number.isFinite(expectedBytes) && expectedBytes > maxBytes) throw binaryBodyTooLarge(maxBytes);
  if (Number.isFinite(contentLength) && Number.isFinite(expectedBytes) && contentLength !== expectedBytes) {
    throw binaryBodyError(400, "ATTACHMENT_SIZE_MISMATCH", "附件实际传输大小与申报大小不一致。");
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) throw binaryBodyTooLarge(maxBytes);
    chunks.push(chunk);
  }
  if (receivedBytes <= 0) throw binaryBodyError(422, "ATTACHMENT_CONTENT_EMPTY", "附件内容为空，请重新选择文件。");
  if (Number.isFinite(expectedBytes) && receivedBytes !== expectedBytes) {
    throw binaryBodyError(400, "ATTACHMENT_SIZE_MISMATCH", "附件实际传输大小与申报大小不一致。");
  }
  return Buffer.concat(chunks, receivedBytes);
}

function binaryBodyTooLarge(maxBytes) {
  return binaryBodyError(413, "ATTACHMENT_FILE_TOO_LARGE", `附件超过 ${formatSize(maxBytes)} 上限。`);
}

function binaryBodyError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function formatSize(bytes) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
}
