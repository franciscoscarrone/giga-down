import { DEFAULT_TIMEOUT_MS } from "@/core/registry";

export interface ServerEnv {
  /** Clave de acceso. `undefined` = app abierta. */
  accessKey: string | undefined;
  providerTimeoutMs: number;
}

const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

/** Lee la configuración del servidor en cada pedido (así los tests pueden cambiarla). */
export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const timeout = Number(source.PROVIDER_TIMEOUT_MS);
  const validTimeout =
    Number.isInteger(timeout) && timeout >= MIN_TIMEOUT_MS && timeout <= MAX_TIMEOUT_MS;

  return {
    accessKey: source.ACCESS_KEY?.trim() || undefined,
    providerTimeoutMs: validTimeout ? timeout : DEFAULT_TIMEOUT_MS,
  };
}
