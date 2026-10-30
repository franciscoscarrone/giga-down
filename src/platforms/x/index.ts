import type { Platform } from "@/core/types";
import { isXStatusUrl } from "./detect";
import { fxTwitterProvider } from "./providers/fxtwitter";
import { syndicationProvider } from "./providers/syndication";

export const x: Platform = {
  id: "x",
  name: "X",
  watermarked: false,
  // Todos los MP4 de X son H.264: HD (720p) se reproduce en todos lados y pesa poco.
  defaultQuality: "hd",
  detect: isXStatusUrl,
  // FxTwitter ve más (cards, posts sensibles); el endpoint de embeds de X es el respaldo.
  providers: [fxTwitterProvider, syndicationProvider],
};
