import { z } from "zod";
import { AppError, toAppError } from "@/core/errors";
import type { MediaItem, MediaResult, MediaVariant, Provider } from "@/core/types";
import { positiveInt, selectedVideoIndex, USER_AGENT, withSizes } from "@/platforms/media";
import { INSTAGRAM_ORIGIN } from "../author";
import { browserFriendlyUrl, cdnVideoDetails, isInstagramCdn } from "../common";
import { parseInstagramUrl, type InstagramRef } from "../detect";

/**
 * Lee el post de su página pública en Instagram: lo mismo que recibe cualquiera que abre el link
 * sin sesión. No es una API: la página trae, en un `<script type="application/json">`, los datos
 * con los que el reproductor web arma el post.
 *
 * - Los datos están bajo `xig_polaris_media.if_not_gated_logged_out`. Si el post tiene alguna
 *   restricción (edad, contenido sensible) viene vacío, y en cuentas privadas no está.
 * - `media_type`: 1 foto, 2 video, 8 álbum (con `carousel_media`).
 * - `video_versions` trae los MP4 progresivos (con audio y video juntos), casi siempre en
 *   `instagram.*.fna.fbcdn.net` (ver `browserFriendlyUrl`). `video_dash_manifest` no se usa: separa
 *   audio y video.
 * - Trae autor, texto del post, medidas y portada. La duración y la calidad salen del link del CDN.
 * - `has_audio: false` es literal: el MP4 no tiene pista de audio (pasa con algunos reels con
 *   música con licencia), y ninguna otra fuente la tiene.
 */

const PAGE_TIMEOUT_MS = 8_000;
const MEDIA_TYPE = { photo: 1, video: 2, album: 8 } as const;

const imageSchema = z.object({ url: z.string() });

const mediaSchema = z.object({
  code: z.string().optional(),
  media_type: z.number(),
  original_width: z.number().nullish(),
  original_height: z.number().nullish(),
  has_audio: z.boolean().nullish(),
  video_versions: z.array(z.object({ url: z.string() })).nullish(),
  image_versions2: z.object({ candidates: z.array(imageSchema) }).nullish(),
});
type PageMedia = z.infer<typeof mediaSchema>;

const postSchema = mediaSchema.extend({
  code: z.string(),
  user: z.object({ username: z.string(), full_name: z.string().nullish() }).nullish(),
  caption: z.object({ text: z.string().nullish() }).nullish(),
  carousel_media: z.array(mediaSchema).nullish(),
});
export type PagePost = z.infer<typeof postSchema>;

const SCRIPT_OPEN = '<script type="application/json"';
const POLARIS_KEY = '"xig_polaris_media"';

/** Busca una clave en cualquier nivel del JSON (los datos vienen muy anidados y cambian de lugar). */
function findKey(node: unknown, key: string): unknown {
  if (!node || typeof node !== "object") return undefined;
  if (!Array.isArray(node) && key in node) return (node as Record<string, unknown>)[key];
  for (const value of Object.values(node)) {
    const found = findKey(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * El post tal como lo describe la página. `null` si la página lo nombra pero no lo muestra sin
 * sesión; `undefined` si la página no trae los datos (login, otra página, cambió el formato).
 */
export function extractPagePost(html: string): PagePost | null | undefined {
  for (let at = html.indexOf(POLARIS_KEY); at !== -1; at = html.indexOf(POLARIS_KEY, at + 1)) {
    const open = html.lastIndexOf(SCRIPT_OPEN, at);
    const start = html.indexOf(">", open) + 1;
    const end = html.indexOf("</script>", at);
    if (open === -1 || start === 0 || end === -1) continue;

    let polaris: unknown;
    try {
      polaris = findKey(JSON.parse(html.slice(start, end)), "xig_polaris_media");
    } catch {
      continue;
    }
    if (!polaris || typeof polaris !== "object") continue;
    const media = (polaris as Record<string, unknown>).if_not_gated_logged_out;
    if (!media) return null;
    const parsed = postSchema.safeParse(media);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

/** Un MP4 por calidad, solo del CDN de Instagram y listos para bajar desde el navegador. */
function variantsOf(media: PageMedia): MediaVariant[] {
  const variants = new Map<string, MediaVariant>();
  for (const { url } of media.video_versions ?? []) {
    if (!isInstagramCdn(url)) continue;
    const quality = cdnVideoDetails(url).quality ?? "sd";
    if (variants.has(quality)) continue;
    variants.set(quality, {
      id: quality,
      quality,
      watermark: false,
      url: browserFriendlyUrl(url),
      mimeType: "video/mp4",
    });
  }
  return [...variants.values()];
}

const isVideo = (media: PageMedia) =>
  media.media_type === MEDIA_TYPE.video && variantsOf(media).length > 0;

/** Traduce el post de la página al modelo de la app (sin tamaños: los completa el proveedor). */
export function normalizePagePost(
  post: PagePost,
  ref: InstagramRef,
  sourceUrl: string,
): MediaResult {
  const media = post.media_type === MEDIA_TYPE.album ? (post.carousel_media ?? []) : [post];
  const playable = media.map(isVideo);
  const videos = media.filter((_, index) => playable[index]);
  if (videos.length === 0) {
    if (media.some((item) => item.media_type === MEDIA_TYPE.video)) {
      throw new AppError("PROVIDER_ERROR", "instagram: el video no trae un MP4 del CDN");
    }
    throw new AppError("NO_VIDEO", "instagram: el post no tiene videos.");
  }

  const items = videos.map((video, index): MediaItem => {
    const variants = variantsOf(video);
    const cover = video.image_versions2?.candidates[0]?.url;
    return {
      id: videos.length > 1 ? `${post.code}-${index + 1}` : post.code,
      hasAudio: video.has_audio ?? undefined,
      coverUrl: cover && isInstagramCdn(cover) ? cover : undefined,
      durationSeconds: cdnVideoDetails(variants[0]!.url).durationSeconds,
      width: positiveInt(video.original_width ?? undefined),
      height: positiveInt(video.original_height ?? undefined),
      variants,
    };
  });

  return {
    platform: "instagram",
    provider: "instagram",
    id: post.code,
    sourceUrl,
    author: post.user
      ? { username: post.user.username, displayName: post.user.full_name || undefined }
      : { username: ref.username ?? "desconocido" },
    title: post.caption?.text?.trim() ?? "",
    items,
    selectedIndex: selectedVideoIndex(playable, ref.mediaNumber),
  };
}

export interface InstagramPageProviderOptions {
  fetch?: typeof fetch;
  /** Pide el tamaño de cada MP4 con un HEAD al CDN (por defecto, sí). */
  probeSizes?: boolean;
}

export function createInstagramPageProvider(options: InstagramPageProviderOptions = {}): Provider {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const probeSizes = options.probeSizes ?? true;

  return {
    id: "instagram",
    async resolve(url, { signal }) {
      const ref = parseInstagramUrl(new URL(url));
      if (!ref) throw new AppError("UNSUPPORTED_URL");

      let post: PagePost | null | undefined;
      try {
        const response = await doFetch(`${INSTAGRAM_ORIGIN}${ref.path}`, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]),
          headers: { accept: "text/html", "user-agent": USER_AGENT },
          cache: "no-store",
        });
        if (response.status === 404) throw new AppError("NOT_FOUND", "instagram: HTTP 404");
        if (response.status === 429) throw new AppError("RATE_LIMITED", "instagram: HTTP 429");
        if (!response.ok) {
          throw new AppError("PROVIDER_ERROR", `instagram: HTTP ${response.status}`);
        }
        post = extractPagePost(await response.text());
      } catch (error) {
        throw toAppError(error, "PROVIDER_ERROR");
      }
      // Sin datos no se sabe si el post existe: que decida el siguiente proveedor.
      if (post === null) {
        throw new AppError("PROVIDER_ERROR", "instagram: el post no se muestra sin sesión");
      }
      if (!post) throw new AppError("PROVIDER_ERROR", "instagram: la página no trae el post");

      const result = normalizePagePost(post, ref, url);
      return probeSizes
        ? { ...result, items: await withSizes(result.items, doFetch, signal) }
        : result;
    },
  };
}

export const instagramPageProvider = createInstagramPageProvider();
