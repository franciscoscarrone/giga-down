import { unstable_rethrow } from "next/navigation";
import type { AuthStatus } from "@/lib/api-contract";
import { errorResponse, okResponse } from "@/lib/api-response";
import { assertAuthorized } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

/**
 * GET /api/auth → { required }
 * Valida la clave del header (si hay una configurada). La usa la pantalla de clave
 * para avisar en el momento si la clave es incorrecta.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { accessKey } = getServerEnv();
    assertAuthorized(request, accessKey);
    return okResponse<AuthStatus>({ required: Boolean(accessKey) });
  } catch (error) {
    unstable_rethrow(error); // deja pasar las señales internas de Next (p. ej. prerender)
    return errorResponse(error);
  }
}
