import type { Platform } from "@/core/types";
import { isInstagramPostUrl } from "./detect";
import { instagramPageProvider } from "./providers/instagram-page";
import { snapsaveProvider } from "./providers/snapsave";

export const instagram: Platform = {
  id: "instagram",
  name: "Instagram",
  watermarked: false,
  // Cada video viene en un solo MP4, así que no hay nada que elegir.
  defaultQuality: "hd",
  detect: isInstagramPostUrl,
  // Primero la página pública del post (rápida y completa); Snapsave, si Instagram no la muestra.
  providers: [instagramPageProvider, snapsaveProvider],
};
