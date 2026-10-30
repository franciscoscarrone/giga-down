import type { MediaVariant, Quality } from "@/core/types";

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

/** Variante preseleccionada: la calidad preferida si existe; si no, Estándar; si no, la primera. */
export function pickDefaultVariant(
  variants: readonly MediaVariant[],
  preferred: Quality | null,
): MediaVariant | undefined {
  const clean = variants.filter((v) => !v.watermark);
  return (
    clean.find((v) => v.quality === preferred) ??
    clean.find((v) => v.quality === "sd") ??
    clean[0] ??
    variants[0]
  );
}
