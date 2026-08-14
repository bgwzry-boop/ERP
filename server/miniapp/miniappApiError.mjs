export class MiniappApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "MiniappApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function toMiniappErrorResponse(error) {
  if (error instanceof MiniappApiError) {
    return {
      statusCode: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return {
    statusCode: 500,
    body: { code: "MINIAPP_INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" },
  };
}
