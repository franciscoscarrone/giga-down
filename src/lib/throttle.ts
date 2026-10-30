/** Espera `ms` milisegundos; se corta si la señal se aborta. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Espaciador de llamadas: garantiza al menos `minIntervalMs` entre el inicio de una llamada y
 * la siguiente dentro de la misma instancia. Sirve para respetar límites del tipo
 * "1 pedido por segundo" sin reintentos agresivos.
 */
export function createThrottle(minIntervalMs: number, now: () => number = Date.now) {
  let nextSlot = 0;

  return async function waitTurn(signal?: AbortSignal): Promise<void> {
    const current = now();
    const startAt = Math.max(current, nextSlot);
    nextSlot = startAt + minIntervalMs;
    if (startAt > current) await sleep(startAt - current, signal);
  };
}
