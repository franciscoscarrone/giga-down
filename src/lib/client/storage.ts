/**
 * Acceso a localStorage que nunca rompe la app: si el navegador lo bloquea (modo privado,
 * almacenamiento lleno, cookies deshabilitadas), los valores quedan en memoria mientras
 * dure la pestaña.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createSafeStorage(getBackend: () => Storage | undefined): KeyValueStore {
  const memory = new Map<string, string>();

  return {
    get(key) {
      try {
        const value = getBackend()?.getItem(key);
        if (value !== null && value !== undefined) return value;
      } catch {
        // Sin acceso: seguimos con la copia en memoria.
      }
      return memory.get(key) ?? null;
    },
    set(key, value) {
      memory.set(key, value);
      try {
        getBackend()?.setItem(key, value);
      } catch {
        // Queda solo en memoria.
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        getBackend()?.removeItem(key);
      } catch {
        // Nada que hacer.
      }
    },
  };
}

export const safeStorage = createSafeStorage(() =>
  typeof window === "undefined" ? undefined : window.localStorage,
);
