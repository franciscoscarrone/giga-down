import { AppError, toAppError } from "@/core/errors";
import type { MediaItem, MediaResult, Provider } from "@/core/types";
import {
  positiveInt,
  qualityForSize,
  selectedVideoIndex,
  USER_AGENT,
  withSizes,
} from "@/platforms/media";
import { authorFromTitle, browserFriendlyUrl, decodeEntities, isInstagramCdn } from "../common";
import { parseInstagramUrl, type InstagramRef } from "../detect";

/**
 * Adaptador de vxinstagram (https://vxinstagram.com), un servicio open source (MIT) para que los
 * links de Instagram se vean bien en Discord. No tiene API: se lee su página.
 *
 * - `GET /reel/<código>/` o `/p/<código>/` devuelve HTML con etiquetas Open Graph y, en el cuerpo,
 *   un `<video><source src>` o un `<img src>` por cada medio del post, ya con el link del CDN de
 *   Instagram. Si no puede resolver un código responde 404, exista el post o no.
 * - `/reels/` no existe en el servicio: hay que pedir `/reel/`.
 * - Si el primer medio de un álbum es una foto (o hay varios videos), las etiquetas Open Graph
 *   solo traen una imagen: hay que mirar el cuerpo para encontrar todos los videos.
 * - Los links `instagram.*.fna.fbcdn.net` no se pueden bajar desde el navegador tal como vienen
 *   (ver `browserFriendlyUrl`).
 * - Corre en el servidor de una persona y le pide todo a Snapsave. Desde noviembre de 2026 responde
 *   404 a casi todo (solo resuelve lo que tiene en caché), por eso detrás está `snapsave.ts`, que va
 *   directo a la misma fuente. Se deja primero porque, cuando anda, es más rápido y trae el autor y
 *   el texto del post.
 */

export const VXINSTAGRAM_ORIGIN = "https://vxinstagram.com";

const META_TAG = /<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g;
const MEDIA_TAG = /<(source|img)\s[^>]*?\bsrc="([^"]+)"/g;
const POST_CODE_IN_URL = /\/(?:reel|p|tv)\/([\w-]+)/;

export interface VxMedia {
  url: string;
  isVideo: boolean;
}

export interface VxPage {
  metas: ReadonlyMap<string, string>;
  /** Las fotos y videos del post, en orden. */
  media: readonly VxMedia[];
}

export function parseVxPage(html: string): VxPage {
  const metas = new Map<string, string>();
  for (const [, name, content] of html.matchAll(META_TAG)) {
    if (name && !metas.has(name)) metas.set(name, decodeEntities(content ?? ""));
  }
  const media = [...html.matchAll(MEDIA_TAG)]
    .map(([, tag, src]) => ({ isVideo: tag === "source", url: decodeEntities(src ?? "") }))
    .filter((item) => isInstagramCdn(item.url));
  return { metas, media };
}

/** Traduce la página de vxinstagram al modelo de la app (sin tamaños: los completa el proveedor). */
export function normalizeVxPage(page: VxPage, ref: InstagramRef, sourceUrl: string): MediaResult {
  const videos = page.media.filter((item) => item.isVideo);
  if (videos.length === 0) {
    if (page.media.length > 0 || page.metas.has("og:image")) {
      throw new AppError("NO_VIDEO", "vxinstagram: el post no tiene videos.");
    }
    throw new AppError("PROVIDER_ERROR", "vxinstagram: la página no trae fotos ni videos.");
  }

  // El tamaño solo aparece si el primer medio es un video: en un álbum, los demás no lo informan.
  const firstWidth = positiveInt(Number(page.metas.get("og:video:width")));
  const firstHeight = positiveInt(Number(page.metas.get("og:video:height")));
  const id = POST_CODE_IN_URL.exec(page.metas.get("og:url") ?? "")?.[1] ?? ref.code;

  const items = videos.map((video, index): MediaItem => {
    const width = index === 0 ? firstWidth : undefined;
    const height = index === 0 ? firstHeight : undefined;
    const quality = width && height ? qualityForSize(width, height) : "sd";
    return {
      id: videos.length > 1 ? `${id}-${index + 1}` : id,
      width,
      height,
      variants: [
        {
          id: quality,
          quality,
          watermark: false,
          url: browserFriendlyUrl(video.url),
          mimeType: "video/mp4",
        },
      ],
    };
  });

  const author = authorFromTitle(page.metas.get("og:title"));
  return {
    platform: "instagram",
    provider: "vxinstagram",
    id,
    sourceUrl,
    author: author ?? { username: ref.username ?? "desconocido" },
    title: page.metas.get("og:description")?.trim() ?? "",
    items,
    selectedIndex: selectedVideoIndex(
      page.media.map((item) => item.isVideo),
      ref.mediaNumber,
    ),
  };
}

export interface VxInstagramProviderOptions {
  fetch?: typeof fetch;
  /** Pide el tamaño de cada MP4 con un HEAD al CDN (por defecto, sí). */
  probeSizes?: boolean;
}

export function createVxInstagramProvider(options: VxInstagramProviderOptions = {}): Provider {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const probeSizes = options.probeSizes ?? true;

  /** El cuerpo de la página es un extra; `og:video` es para lo que existe el servicio. */
  async function videoFromOpenGraph(
    ogVideo: string,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    if (isInstagramCdn(ogVideo)) return ogVideo;
    const offload = new URL(ogVideo, VXINSTAGRAM_ORIGIN);
    if (offload.origin !== VXINSTAGRAM_ORIGIN) return undefined;
    const response = await doFetch(offload, {
      signal,
      redirect: "manual",
      headers: { "user-agent": USER_AGENT },
      cache: "no-store",
    });
    const location = response.headers.get("location");
    return location && isInstagramCdn(location) ? location : undefined;
  }

  return {
    id: "vxinstagram",
    async resolve(url, { signal }) {
      const ref = parseInstagramUrl(new URL(url));
      if (!ref) throw new AppError("UNSUPPORTED_URL");

      let page: VxPage;
      try {
        const response = await doFetch(`${VXINSTAGRAM_ORIGIN}${ref.path}`, {
          signal,
          headers: { accept: "text/html", "user-agent": USER_AGENT },
          cache: "no-store",
        });
        // Su 404 no prueba que el post no exista: el servicio lo devuelve ante cualquier falla.
        if (response.status === 404) {
          throw new AppError("PROVIDER_ERROR", "vxinstagram: HTTP 404 (no lo pudo resolver)");
        }
        if (response.status === 429) throw new AppError("RATE_LIMITED", "vxinstagram: HTTP 429");
        if (!response.ok) {
          throw new AppError("PROVIDER_ERROR", `vxinstagram: HTTP ${response.status}`);
        }
        page = parseVxPage(await response.text());

        const ogVideo = page.metas.get("og:video");
        if (ogVideo && !page.media.some((item) => item.isVideo)) {
          const video = await videoFromOpenGraph(ogVideo, signal);
          if (video) page = { ...page, media: [{ url: video, isVideo: true }] };
        }
      } catch (error) {
        throw toAppError(error, "PROVIDER_ERROR");
      }

      const media = normalizeVxPage(page, ref, url);
      return probeSizes
        ? { ...media, items: await withSizes(media.items, doFetch, signal) }
        : media;
    },
  };
}

export const vxInstagramProvider = createVxInstagramProvider();
