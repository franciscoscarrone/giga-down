import { normalizedHost } from "@/core/url";

/** Links cortos que genera el botón "Compartir" de la app (vm. en general, vt. en algunas regiones). */
const SHORT_LINK_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
const MAIN_HOSTS = new Set(["tiktok.com", "m.tiktok.com"]);

const SHORT_LINK_PATH = /^\/[A-Za-z0-9_-]+\/?$/;
const VIDEO_PATHS = [
  /^\/@[^/]+\/video\/\d+\/?$/, // https://www.tiktok.com/@usuario/video/7234567890123456789
  /^\/t\/[A-Za-z0-9_-]+\/?$/, // https://www.tiktok.com/t/ZT8abc123/
  /^\/v\/\d+(?:\.html)?\/?$/, // https://m.tiktok.com/v/7234567890123456789.html
  /^\/embed(?:\/v2)?\/\d+\/?$/, // https://www.tiktok.com/embed/v2/7234567890123456789
];

/** ¿Es un link a un video de TikTok? No hace pedidos de red. */
export function isTikTokVideoUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = normalizedHost(url);
  if (SHORT_LINK_HOSTS.has(host)) return SHORT_LINK_PATH.test(url.pathname);
  if (MAIN_HOSTS.has(host)) return VIDEO_PATHS.some((pattern) => pattern.test(url.pathname));
  return false;
}
