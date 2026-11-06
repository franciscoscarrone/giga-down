"use client";

import { useSyncExternalStore } from "react";
import { detectOS, type DeviceOS } from "@/lib/client/device";
import type { PersistentStore } from "@/lib/client/persistent-store";

/** Lee un valor persistido. En el servidor y en la hidratación devuelve el valor por defecto. */
export function usePersistentStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

const noopSubscribe = () => () => {};

/** `true` una vez que el componente corre en el navegador (después de hidratar). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Sistema operativo del dispositivo. `null` en el servidor y en la hidratación. */
export function useDeviceOS(): DeviceOS | null {
  return useSyncExternalStore<DeviceOS | null>(
    noopSubscribe,
    () => detectOS(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  );
}

const MINUTE = 60_000;
const subscribeMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/** Hora actual redondeada al minuto, para textos como "hace 5 minutos". */
export function useNow(): number {
  return useSyncExternalStore(subscribeMinute, currentMinute, () => 0);
}
