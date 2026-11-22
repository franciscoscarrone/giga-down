import type { Platform } from "@/core/types";
import { isInstagramPostUrl } from "./detect";
import { snapsaveProvider } from "./providers/snapsave";
import { vxInstagramProvider } from "./providers/vxinstagram";

export const instagram: Platform = {
  id: "instagram",
  name: "Instagram",
  watermarked: false,
  // Cada video viene en un solo MP4, así que no hay nada que elegir.
  defaultQuality: "hd",
  detect: isInstagramPostUrl,
  // vxinstagram es un intermediario de Snapsave: si contesta, es más rápido y trae más datos.
  providers: [vxInstagramProvider, snapsaveProvider],
};
