/** Piezas que comparten los proveedores de Instagram. */

const CDN_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/;

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

/**
 * Solo se aceptan links del CDN de Instagram: los servicios de terceros no pueden mandar a nadie a
 * otro sitio.
 */
export function isInstagramCdn(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && CDN_HOST.test(hostname);
  } catch {
    return false;
  }
}

/**
 * `instagram.*.fna.fbcdn.net` les responde a los navegadores con un redirect a video.xx.fbcdn.net
 * sin cabecera CORS, así que el `fetch` de la descarga falla (a Node no se lo hace: no se ve desde
 * el servidor). El mismo link pedido directo a ese host responde con CORS abierto. Los de
 * `scontent-*.cdninstagram.com` no tienen el problema.
 */
export function browserFriendlyUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith(".fna.fbcdn.net")) return url;
  parsed.hostname = "video.xx.fbcdn.net";
  return parsed.href;
}

/**
 * "Nombre (@usuario)", con el nombre vacío en algunas cuentas. La página de Instagram agrega
 * " • Instagram reel" (o "photo", o lo que sea en otro idioma) al final.
 */
const AUTHOR_TITLE = /^(.*?)\s*\(@([\w.]+)\)\s*(?:•.*)?$/s;

/** Lee el autor de un título del estilo "Nombre (@usuario)". Si tiene otra forma, nada. */
export function authorFromTitle(
  title: string | undefined,
): { username: string; displayName?: string } | undefined {
  const match = AUTHOR_TITLE.exec(title ?? "");
  if (!match?.[2]) return undefined;
  return { username: match[2], displayName: match[1]?.trim() || undefined };
}
