import type { MediaAuthor } from "@/core/types";
import { USER_AGENT } from "@/platforms/media";
import { authorFromTitle, decodeEntities } from "./common";

/**
 * El autor de un post, leído de las etiquetas de la página pública de Instagram: lo mismo que ve
 * cualquiera que abre el link sin sesión, o un bot que arma la vista previa de un link.
 *
 * - `twitter:title` trae "Nombre (@usuario) • Instagram reel".
 * - `og:url` trae la ruta con el usuario adelante (instagram.com/usuario/reel/CODIGO/).
 *
 * Es un extra: si Instagram pide login, tarda o cambia la página, no hay autor y listo.
 */

export const INSTAGRAM_ORIGIN = "https://www.instagram.com";

const LOOKUP_TIMEOUT_MS = 5_000;
const META_TAG = /<meta\s+(?:property|name)="(twitter:title|og:url)"\s+content="([^"]*)"/g;
const USER_IN_URL = /^\/([\w.]{1,30})\/(?:reel|p|tv)\//;

export function parseAuthorMeta(html: string): MediaAuthor | undefined {
  const metas = new Map<string, string>();
  for (const [, name, content] of html.matchAll(META_TAG)) {
    if (name && !metas.has(name)) metas.set(name, decodeEntities(content ?? ""));
  }

  const fromTitle = authorFromTitle(metas.get("twitter:title"));
  if (fromTitle) return fromTitle;

  try {
    const username = USER_IN_URL.exec(new URL(metas.get("og:url") ?? "").pathname)?.[1];
    return username ? { username } : undefined;
  } catch {
    return undefined;
  }
}

/** Nunca falla: ante cualquier problema devuelve `undefined`. */
export async function fetchPostAuthor(
  path: string,
  doFetch: typeof fetch,
  signal: AbortSignal,
): Promise<MediaAuthor | undefined> {
  try {
    const response = await doFetch(`${INSTAGRAM_ORIGIN}${path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(LOOKUP_TIMEOUT_MS)]),
      headers: { accept: "text/html", "user-agent": USER_AGENT },
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    return parseAuthorMeta(await response.text());
  } catch {
    return undefined;
  }
}
