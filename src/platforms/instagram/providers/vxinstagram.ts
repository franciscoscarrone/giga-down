import { AppError, toAppError } from "@/core/errors";
import type { MediaItem, MediaResult, Provider } from "@/core/types";
import {
  positiveInt,
  qualityForSize,
  selectedVideoIndex,
  USER_AGENT,
  withSizes,
} from "@/platforms/media";
import { parseInstagramUrl, type InstagramRef } from "../detect";

/**
 * Adaptador de vxinstagram (https://vxinstagram.com), un servicio open source (MIT) para que los
 * links de Instagram se vean bien en Discord. No tiene API: se lee su página.
 *
 * - `GET /reel/<código>/` o `/p/<código>/` devuelve HTML con etiquetas Open Graph y, en el cuerpo,
 *   un `<video><source src>` o un `<img src>` por cada medio del post, ya con el link del CDN de
 *   Instagram. Un código que no resuelve responde 404.
 * - `/reels/` no existe en el servicio: hay que pedir `/reel/`.
 * - Si el primer medio de un álbum es una foto (o hay varios videos), las etiquetas Open Graph
 *   solo traen una imagen: hay que mirar el cuerpo para encontrar todos los videos.
 * - Corre en el servidor de una persona y depende de Snapsave: es el punto débil de esta red.
 */

export const VXINSTAGRAM_ORIGIN = "https://vxinstagram.com";

const META_TAG = /<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g;
const MEDIA_TAG = /<(source|img)\s[^>]*?\bsrc="([^"]+)"/g;
const CDN_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/;
/** "Nombre (@usuario)", con el nombre vacío en algunas cuentas. */
const AUTHOR_TITLE = /^(.*?)\s*\(@([\w.]+)\)\s*$/s;
const POST_CODE_IN_URL = /\/(?:reel|p|tv)\/([\w-]+)/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** El texto llega con entidades HTML: "&#x201C;Hola&#x201D;&#xA;&amp; chau". */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#x([\da-f]+)|#(\d+)|(\w+));/gi,
    (whole, hex?: string, decimal?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name] ?? whole;
      const code = hex ? parseInt(hex, 16) : Number(decimal);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

/** Solo se aceptan links del CDN de Instagram: el servicio no puede mandarnos a otro lado. */
function isInstagramCdn(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && CDN_HOST.test(hostname);
  } catch {
    return false;
  }
}

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
      variants: [{ id: quality, quality, watermark: false, url: video.url, mimeType: "video/mp4" }],
    };
  });

  const author = AUTHOR_TITLE.exec(page.metas.get("og:title") ?? "");
  return {
    platform: "instagram",
    provider: "vxinstagram",
    id,
    sourceUrl,
    author: {
      username: author?.[2] ?? "desconocido",
      displayName: author?.[1] || undefined,
    },
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
        if (response.status === 404) throw new AppError("NOT_FOUND", "vxinstagram: HTTP 404");
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
