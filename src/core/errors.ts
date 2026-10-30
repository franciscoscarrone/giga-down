import { z } from "zod";

/**
 * Códigos de error de la app. La UI decide qué mensaje humano mostrar para cada uno,
 * así que el `message` que viaja en la API es orientativo (para logs y depuración).
 */
export const ERROR_CODES = [
  "UNSUPPORTED_URL",
  "NOT_FOUND",
  "NO_VIDEO",
  "PROVIDER_ERROR",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "TIMEOUT",
  "INVALID_REQUEST",
  "INTERNAL_ERROR",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNSUPPORTED_URL: 422,
  NOT_FOUND: 404,
  NO_VIDEO: 422,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  TIMEOUT: 504,
  INVALID_REQUEST: 400,
  INTERNAL_ERROR: 500,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_URL: "El link no corresponde a ninguna plataforma soportada.",
  NOT_FOUND: "No se encontró el contenido. Puede ser privado o haber sido borrado.",
  NO_VIDEO: "La publicación no tiene videos.",
  PROVIDER_ERROR: "El proveedor respondió con un error.",
  RATE_LIMITED: "Demasiados pedidos seguidos. Esperá unos segundos.",
  UNAUTHORIZED: "Falta la clave de acceso o es incorrecta.",
  TIMEOUT: "El proveedor tardó demasiado en responder.",
  INVALID_REQUEST: "El pedido no tiene el formato esperado.",
  INTERNAL_ERROR: "Error interno inesperado.",
};

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? DEFAULT_MESSAGES[code], options);
    this.name = "AppError";
    this.code = code;
  }

  get status(): number {
    return HTTP_STATUS_BY_CODE[this.code];
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Convierte cualquier cosa lanzada en un AppError, sin perder el original como `cause`. */
export function toAppError(error: unknown, fallback: ErrorCode = "INTERNAL_ERROR"): AppError {
  if (isAppError(error)) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new AppError("TIMEOUT", undefined, { cause: error });
  }
  return new AppError(fallback, undefined, { cause: error });
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
}
