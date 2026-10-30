const URL_IN_TEXT = /https?:\/\/[^\s<>"'“”]+/i;
const BARE_HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/i;
const TRAILING_PUNCTUATION = /[).,;!?¡¿]+$/;

/**
 * Extrae el primer link http(s) de un texto. Sirve para lo que llega al pegar o compartir:
 * TikTok en Android comparte cosas como "Mirá este video https://vm.tiktok.com/ZM123/".
 * También acepta un host sin protocolo ("vm.tiktok.com/ZM123/").
 */
export function extractUrl(input: string): URL | null {
  const text = input.trim();
  if (!text) return null;

  const candidate =
    text.match(URL_IN_TEXT)?.[0] ?? (BARE_HOST.test(text) ? `https://${text}` : null);
  if (!candidate) return null;

  try {
    const url = new URL(candidate.replace(TRAILING_PUNCTUATION, ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Host en minúsculas y sin "www." para comparar dominios. */
export function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
