import { z } from "zod";
import { errorCodeSchema } from "./errors";

/**
 * Tipos del dominio. Son independientes de Next.js y de cualquier proveedor:
 * cada adaptador traduce su respuesta a `MediaResult`.
 *
 * Los tipos se derivan de esquemas Zod para poder validar también del lado del cliente
 * (respuesta de la API, historial en localStorage) sin duplicar definiciones.
 */

/** Identificador de plataforma ("tiktok", "instagram", ...). Lo define cada plataforma. */
export type PlatformId = string;

/** Calidades ordenadas de menor a mayor. El orden del array es el orden de la UI. */
export const QUALITIES = ["low", "sd", "hd", "fhd", "uhd"] as const;
export const qualitySchema = z.enum(QUALITIES);
export type Quality = z.infer<typeof qualitySchema>;

export function qualityRank(quality: Quality): number {
  return QUALITIES.indexOf(quality);
}

export const mediaVariantSchema = z.object({
  /** Único dentro de un resultado (p. ej. "sd", "hd", "sd-wm"). */
  id: z.string().min(1),
  quality: qualitySchema,
  watermark: z.boolean(),
  url: z.url(),
  /** Tamaño en bytes, si el proveedor lo informa. */
  size: z.number().int().positive().optional(),
  mimeType: z.string().min(1),
});
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

export const mediaAuthorSchema = z.object({
  /** Nombre de usuario (sin @). */
  username: z.string(),
  displayName: z.string().optional(),
  avatarUrl: z.url().optional(),
});
export type MediaAuthor = z.infer<typeof mediaAuthorSchema>;

/** Un video del post. TikTok tiene siempre uno; un post de X puede tener hasta cuatro. */
export const mediaItemSchema = z.object({
  /** Único dentro del resultado (id del video en la plataforma). */
  id: z.string().min(1),
  /** Texto corto para distinguirlo en el selector (p. ej. "GIF" o "De @usuario"). */
  label: z.string().min(1).optional(),
  coverUrl: z.url().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  /** Tamaño del video original en píxeles: la portada se dibuja con su proporción. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Ordenadas de menor a mayor calidad; las variantes con marca de agua van al final. */
  variants: z.array(mediaVariantSchema).min(1),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const mediaResultSchema = z.object({
  platform: z.string().min(1),
  /** Proveedor que resolvió el pedido (útil para depurar el fallback). */
  provider: z.string().min(1),
  /** Id del contenido en la plataforma. */
  id: z.string().min(1),
  /** Link original que pegó el usuario. */
  sourceUrl: z.url(),
  author: mediaAuthorSchema,
  title: z.string(),
  items: z.array(mediaItemSchema).min(1),
  /** Índice del video que pide el link (p. ej. x.com/…/video/2). Sin él, el primero. */
  selectedIndex: z.number().int().nonnegative().optional(),
});
export type MediaResult = z.infer<typeof mediaResultSchema>;

/** El video que pide el link, o el primero si el índice no existe. */
export function selectedItem(media: MediaResult): MediaItem {
  return media.items[media.selectedIndex ?? 0] ?? media.items[0]!;
}

/** Contexto que el registry le pasa a cada proveedor. */
export interface ProviderContext {
  /** Se aborta por timeout o si el cliente cancela. Los proveedores deben pasárselo a `fetch`. */
  signal: AbortSignal;
}

export interface Provider {
  id: string;
  resolve(url: string, context: ProviderContext): Promise<MediaResult>;
}

export interface Platform {
  id: PlatformId;
  name: string;
  /** ¿La plataforma le pone marca de agua a sus videos? Cambia los textos de la descarga. */
  watermarked: boolean;
  /** Calidad que se preselecciona hasta que el usuario elige otra (o la más cercana). */
  defaultQuality: Quality;
  /** ¿Esta URL es de la plataforma? Debe ser pura y sin red: también corre en el navegador. */
  detect(url: URL): boolean;
  /** Proveedores en orden de preferencia. El registry prueba el siguiente si uno falla. */
  providers: readonly Provider[];
}

/** Forma única de todas las respuestas de la API. */
export const apiErrorSchema = z.object({ code: errorCodeSchema, message: z.string() });

export function apiResponseSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: apiErrorSchema }),
  ]);
}

export type ApiResponse<T> =
  { ok: true; data: T } | { ok: false; error: z.infer<typeof apiErrorSchema> };

/** Ordena variantes: primero sin marca de agua, y dentro de cada grupo de menor a mayor calidad. */
export function sortVariants(variants: readonly MediaVariant[]): MediaVariant[] {
  return [...variants].sort(
    (a, b) =>
      Number(a.watermark) - Number(b.watermark) || qualityRank(a.quality) - qualityRank(b.quality),
  );
}
