import type { ApiResponse, ApiRequest } from "./types";
export function isCommittedResult(
  value:
    | {
        requestId: string;
        operation: ApiRequest["operation"];
        result: ApiResponse;
      }
    | undefined,
  requestId: string,
) {
  return (
    !!value &&
    value.requestId === requestId &&
    value.result.success &&
    ["createCompany", "updateCompany", "skip"].includes(value.operation) &&
    ["ADDED", "UPDATED", "SKIPPED"].includes(value.result.status)
  );
}
