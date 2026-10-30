import { toAppError } from "@/core/errors";
import type { ApiResponse } from "@/core/types";

const NO_STORE = { "cache-control": "no-store" };

export function okResponse<T>(data: T): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>, { headers: NO_STORE });
}

/** Convierte cualquier error en `{ ok: false, error: { code, message } }` con su status HTTP. */
export function errorResponse(thrown: unknown): Response {
  const error = toAppError(thrown);

  if (error.code === "INTERNAL_ERROR") {
    // Solo el error interno se loguea con detalle; nunca incluye headers ni la clave.
    console.error("[api] error inesperado", error.cause ?? error);
  }

  const headers: Record<string, string> = { ...NO_STORE };
  if (error.code === "RATE_LIMITED") headers["retry-after"] = "2";

  const body: ApiResponse<never> = {
    ok: false,
    error: { code: error.code, message: error.message },
  };
  return Response.json(body, { status: error.status, headers });
}
