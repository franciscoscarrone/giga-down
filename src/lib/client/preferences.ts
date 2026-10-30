import { z } from "zod";
import { qualitySchema, type PlatformId, type Quality } from "@/core/types";
import { createPersistentStore } from "./persistent-store";

/** Clave de acceso guardada en el dispositivo (solo si la app la pide). */
export const accessKeyStore = createPersistentStore<string | null>({
  key: "gigadown:access-key",
  fallback: null,
  decode: (raw) => raw || undefined,
  encode: (value) => value || null,
});

export type QualityPreferences = Partial<Record<PlatformId, Quality>>;

const qualityPreferencesSchema = z.record(z.string(), qualitySchema);

/** Lee lo guardado. Antes había una sola calidad para todo, que era de TikTok. */
export function decodeQualityPreferences(raw: string): QualityPreferences | undefined {
  const legacy = qualitySchema.safeParse(raw);
  if (legacy.success) return { tiktok: legacy.data };
  try {
    return qualityPreferencesSchema.safeParse(JSON.parse(raw)).data;
  } catch {
    return undefined;
  }
}

const NO_PREFERENCES: QualityPreferences = {};

/**
 * Última calidad elegida en cada red: se preselecciona en el próximo video de esa red.
 * Va por red porque las calidades no se corresponden (la Estándar de TikTok es 576p y la de X,
 * 360p).
 */
export const qualityPreferenceStore = createPersistentStore<QualityPreferences>({
  key: "gigadown:quality",
  fallback: NO_PREFERENCES,
  decode: decodeQualityPreferences,
  encode: (value) => (Object.keys(value).length ? JSON.stringify(value) : null),
});
