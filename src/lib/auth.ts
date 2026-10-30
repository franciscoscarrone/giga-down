import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@/core/errors";
import { ACCESS_KEY_HEADER } from "./api-contract";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Compara la clave recibida con la configurada en tiempo constante.
 * Sin clave configurada, la app está abierta.
 */
export function isAuthorized(provided: string | null, expected: string | undefined): boolean {
  if (!expected) return true;
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

/** Lanza UNAUTHORIZED si el pedido no trae la clave correcta. Nunca loguea la clave. */
export function assertAuthorized(request: Request, expected: string | undefined): void {
  if (!isAuthorized(request.headers.get(ACCESS_KEY_HEADER), expected)) {
    throw new AppError("UNAUTHORIZED");
  }
}
