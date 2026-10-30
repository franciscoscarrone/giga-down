import { qualitySchema, type Quality } from "@/core/types";
import { createPersistentStore } from "./persistent-store";

/** Clave de acceso guardada en el dispositivo (solo si la app la pide). */
export const accessKeyStore = createPersistentStore<string | null>({
  key: "gigadown:access-key",
  fallback: null,
  decode: (raw) => raw || undefined,
  encode: (value) => value || null,
});

/** Última calidad elegida: se preselecciona en el próximo video. */
export const qualityPreferenceStore = createPersistentStore<Quality | null>({
  key: "gigadown:quality",
  fallback: null,
  decode: (raw) => qualitySchema.safeParse(raw).data,
  encode: (value) => value,
});
