import { AppError, type ErrorCode, toAppError } from "./errors";
import {
  mediaResultSchema,
  sortVariants,
  type MediaResult,
  type Platform,
  type Provider,
} from "./types";
import { extractUrl } from "./url";

export interface RegistryOptions {
  /** Timeout por proveedor, en ms. Si uno se pasa, se prueba el siguiente. */
  timeoutMs?: number;
  /** Se llama cada vez que un proveedor falla (aunque después otro resuelva). */
  onProviderError?: (event: { platform: string; provider: string; error: AppError }) => void;
}

export interface ResolveOptions {
  /** Cancela todo (por ejemplo, si el cliente cortó la conexión). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PlatformMatch {
  platform: Platform;
  url: URL;
}

export interface Registry {
  readonly platforms: readonly Platform[];
  /** Busca la plataforma de un link (o de un texto que contenga un link). Sin red. */
  match(input: string): PlatformMatch | null;
  /** Resuelve el link probando los proveedores de su plataforma en orden. */
  resolve(input: string, options?: ResolveOptions): Promise<MediaResult>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Si todos los proveedores fallan, se informa el error más útil para el usuario:
 * un "no existe" definitivo le gana a un problema transitorio.
 */
const ERROR_PRIORITY: readonly ErrorCode[] = [
  "NOT_FOUND",
  "UNSUPPORTED_URL",
  "RATE_LIMITED",
  "TIMEOUT",
  "PROVIDER_ERROR",
];

function mostRelevant(errors: readonly AppError[]): AppError | undefined {
  const rank = (e: AppError) => {
    const index = ERROR_PRIORITY.indexOf(e.code);
    return index === -1 ? ERROR_PRIORITY.length : index;
  };
  return [...errors].sort((a, b) => rank(a) - rank(b))[0];
}

async function runProvider(
  provider: Provider,
  url: string,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<MediaResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new AppError("TIMEOUT", `${provider.id} superó ${timeoutMs} ms`)),
    timeoutMs,
  );
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });

  try {
    // La carrera contra el abort cubre a proveedores que ignoren la señal.
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
        once: true,
      });
    });
    const result = await Promise.race([
      provider.resolve(url, { signal: controller.signal }),
      aborted,
    ]);

    const parsed = mediaResultSchema.safeParse(result);
    if (!parsed.success) {
      throw new AppError("PROVIDER_ERROR", `${provider.id} devolvió un resultado inválido`, {
        cause: parsed.error,
      });
    }
    return { ...parsed.data, variants: sortVariants(parsed.data.variants) };
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

export function createRegistry(
  platforms: readonly Platform[],
  options: RegistryOptions = {},
): Registry {
  const match = (input: string): PlatformMatch | null => {
    const url = extractUrl(input);
    if (!url) return null;
    const platform = platforms.find((p) => p.detect(url));
    return platform ? { platform, url } : null;
  };

  return {
    platforms,
    match,
    async resolve(input, resolveOptions = {}) {
      const found = match(input);
      if (!found) throw new AppError("UNSUPPORTED_URL");

      const { platform, url } = found;
      const timeoutMs = resolveOptions.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const errors: AppError[] = [];

      for (const provider of platform.providers) {
        try {
          return await runProvider(provider, url.href, timeoutMs, resolveOptions.signal);
        } catch (thrown) {
          const error = toAppError(thrown, "PROVIDER_ERROR");
          errors.push(error);
          options.onProviderError?.({ platform: platform.id, provider: provider.id, error });
          if (resolveOptions.signal?.aborted) break;
        }
      }

      throw (
        mostRelevant(errors) ??
        new AppError("PROVIDER_ERROR", `${platform.name} no tiene proveedores configurados.`)
      );
    },
  };
}
