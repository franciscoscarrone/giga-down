import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA. `share_target` hace que GigaDown aparezca en el menú Compartir de
 * Android (una vez instalada): TikTok manda el link en `text` y la app lo lee al abrir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GigaDown",
    short_name: "GigaDown",
    description: "Pegá el link de un video y bajalo sin marca de agua.",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f9f6",
    theme_color: "#f9f9f6",
    categories: ["utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
