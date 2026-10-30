import { qualityRank, type MediaVariant, type Quality } from "@/core/types";

export const QUALITY_LABEL: Record<Quality, string> = {
  low: "Baja",
  sd: "Estándar",
  hd: "HD",
  fhd: "Full HD",
  uhd: "4K",
};

export const QUALITY_NOTE: Record<Quality, string> = {
  low: "Pesa menos",
  sd: "Se reproduce en todo",
  hd: "Más nítido",
  fhd: "Muy nítido",
  uhd: "Máxima calidad",
};

export function variantLabel(variant: MediaVariant): string {
  return variant.watermark
    ? `${QUALITY_LABEL[variant.quality]} con marca`
    : QUALITY_LABEL[variant.quality];
}

/**
 * Variante preseleccionada: la calidad buscada (la preferida o, si no hay, la de la plataforma)
 * o la más cercana a ella, y ante un empate la mejor. Solo cae en una con marca si no hay otra.
 */
export function pickDefaultVariant(
  variants: readonly MediaVariant[],
  target: Quality,
): MediaVariant | undefined {
  const clean = variants.filter((v) => !v.watermark);
  const distance = (v: MediaVariant) => Math.abs(qualityRank(v.quality) - qualityRank(target));
  const [closest] = [...clean].sort(
    (a, b) => distance(a) - distance(b) || qualityRank(b.quality) - qualityRank(a.quality),
  );
  return closest ?? variants[0];
}
