import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestPrintBatchApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function createOfficePrintBatchRecord(input, options = {}) {
  const { authState, operatorId, printBatchRecord } = input;

  try {
    const response = await requestPrintBatchApi("/print-batches", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        ...printBatchRecord,
        operatorId: operatorId ?? printBatchRecord?.operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "打印批次记录 API 返回错误。"),
      };
    }

    return {
      source: "api",
      printBatchRecord: json.printBatchRecord,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("PRINT_BATCH_API_UNAVAILABLE", error);
    }
    return {
      source: "local_fallback",
      printBatchRecord,
      error: {
        code: "PRINT_BATCH_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}
