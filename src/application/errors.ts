/** Error codes the application raises; drivers map these to transport statuses. */
export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "conflict"
  | "validation";

/** A transport-agnostic application error. The HTTP layer maps `code` to a status. */
export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
