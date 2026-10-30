import type { ErrorCode } from "@/core/errors";
import { apiResponseSchema, mediaResultSchema, type MediaResult } from "@/core/types";
import {
  ACCESS_KEY_HEADER,
  API_ROUTES,
  authStatusSchema,
  type AuthStatus,
  type ResolveRequest,
} from "@/lib/api-contract";
import type { z } from "zod";

/** Además de los códigos de la API, el cliente puede quedarse sin conexión. */
export type ClientErrorCode = ErrorCode | "NETWORK_ERROR";
export interface ClientError {
  code: ClientErrorCode;
  message: string;
}
export type ClientResult<T> = { ok: true; data: T } | { ok: false; error: ClientError };

const resolveResponseSchema = apiResponseSchema(mediaResultSchema);
const authResponseSchema = apiResponseSchema(authStatusSchema);

async function call<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<ClientResult<T>>,
): Promise<ClientResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Sin conexión." } };
  }

  const json: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;

  return {
    ok: false,
    error: {
      code: response.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
      message: `Respuesta inesperada del servidor (HTTP ${response.status}).`,
    },
  };
}

const keyHeader = (accessKey: string | null): Record<string, string> =>
  accessKey ? { [ACCESS_KEY_HEADER]: accessKey } : {};

export function resolveMedia(
  url: string,
  accessKey: string | null,
  signal?: AbortSignal,
): Promise<ClientResult<MediaResult>> {
  const body: ResolveRequest = { url };
  return call(
    API_ROUTES.resolve,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...keyHeader(accessKey) },
      body: JSON.stringify(body),
      signal,
    },
    resolveResponseSchema,
  );
}

export function checkAccessKey(
  accessKey: string,
  signal?: AbortSignal,
): Promise<ClientResult<AuthStatus>> {
  return call(
    API_ROUTES.auth,
    { headers: keyHeader(accessKey), cache: "no-store", signal },
    authResponseSchema,
  );
}
