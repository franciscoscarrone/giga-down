import { safeStorage, type KeyValueStore } from "./storage";

/**
 * Valor persistido en localStorage con la interfaz que espera `useSyncExternalStore`.
 * El snapshot se cachea por el string guardado, así React recibe la misma referencia
 * mientras el valor no cambie.
 */
export interface PersistentStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  getServerSnapshot(): T;
  set(value: T): void;
}

interface Options<T> {
  key: string;
  /** Valor inicial, en el servidor y cuando no hay nada guardado o lo guardado es inválido. */
  fallback: T;
  decode(raw: string): T | undefined;
  /** `null` borra la clave. */
  encode(value: T): string | null;
  storage?: KeyValueStore;
}

export function createPersistentStore<T>({
  key,
  fallback,
  decode,
  encode,
  storage = safeStorage,
}: Options<T>): PersistentStore<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;

  const emit = () => listeners.forEach((listener) => listener());
  const onStorageEvent = (event: StorageEvent) => {
    if (event.key === key || event.key === null) emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) window.addEventListener("storage", onStorageEvent);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorageEvent);
      };
    },
    getSnapshot() {
      const raw = storage.get(key);
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = raw === null ? fallback : (decode(raw) ?? fallback);
      }
      return cachedValue;
    },
    getServerSnapshot() {
      return fallback;
    },
    set(value) {
      const raw = encode(value);
      if (raw === null) storage.remove(key);
      else storage.set(key, raw);
      emit();
    },
  };
}
