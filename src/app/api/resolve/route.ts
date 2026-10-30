import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/core/errors";
import { resolveRequestSchema } from "@/lib/api-contract";
import { errorResponse, okResponse } from "@/lib/api-response";
import { assertAuthorized } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { registry } from "@/platforms";

/**
 * POST /api/resolve  { url } → MediaResult
 * Solo devuelve metadatos y links (JSON chico): el video nunca pasa por acá.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const env = getServerEnv();
    assertAuthorized(request, env.accessKey);

    const body = resolveRequestSchema.safeParse(await request.json().catch(() => undefined));
    if (!body.success) {
      throw new AppError(
        "INVALID_REQUEST",
        'El body tiene que ser JSON con la forma { "url": string }.',
      );
    }

    const media = await registry.resolve(body.data.url, {
      signal: request.signal,
      timeoutMs: env.providerTimeoutMs,
    });
    return okResponse(media);
  } catch (error) {
    unstable_rethrow(error); // deja pasar las señales internas de Next (p. ej. prerender)
    return errorResponse(error);
  }
}
