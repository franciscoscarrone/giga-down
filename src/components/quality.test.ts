import { describe, expect, it } from "vitest";
import type { MediaVariant, Quality } from "@/core/types";
import { pickDefaultVariant } from "./quality";

const variant = (quality: Quality, watermark = false): MediaVariant => ({
  id: watermark ? `${quality}-wm` : quality,
  quality,
  watermark,
  url: `https://cdn.example/${quality}.mp4`,
  mimeType: "video/mp4",
});

const pick = (variants: MediaVariant[], target: Quality) =>
  pickDefaultVariant(variants, target)?.id;

describe("pickDefaultVariant", () => {
  it("elige la calidad buscada si existe", () => {
    expect(pick([variant("sd"), variant("hd")], "sd")).toBe("sd");
    expect(pick([variant("low"), variant("sd"), variant("hd")], "hd")).toBe("hd");
  });

  it("si no existe, elige la más cercana", () => {
    expect(pick([variant("sd"), variant("hd")], "fhd")).toBe("hd");
    expect(pick([variant("low"), variant("sd")], "hd")).toBe("sd");
  });

  it("ante un empate de distancia, elige la mejor", () => {
    expect(pick([variant("sd"), variant("fhd")], "hd")).toBe("fhd");
  });

  it("no elige una variante con marca si hay alguna sin marca", () => {
    expect(pick([variant("hd", true), variant("low")], "hd")).toBe("low");
  });

  it("si solo hay variantes con marca, devuelve la primera", () => {
    expect(pick([variant("sd", true)], "hd")).toBe("sd-wm");
  });
});
