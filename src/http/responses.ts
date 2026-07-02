import { ApplicationError, type ErrorCode } from "../application/index.ts";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  validation: 422,
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Map any thrown value to a JSON error response. */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApplicationError) {
    return json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      STATUS[err.code],
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: { code: "internal", message } }, 500);
}
