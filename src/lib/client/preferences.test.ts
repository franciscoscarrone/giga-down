import { describe, expect, it } from "vitest";
import { decodeQualityPreferences } from "./preferences";

describe("decodeQualityPreferences", () => {
  it("lee la calidad elegida en cada red", () => {
    expect(decodeQualityPreferences('{"tiktok":"sd","x":"hd"}')).toEqual({ tiktok: "sd", x: "hd" });
  });

  it("migra el formato viejo (una sola calidad, que era de TikTok)", () => {
    expect(decodeQualityPreferences("hd")).toEqual({ tiktok: "hd" });
  });

  it("descarta lo que no entiende", () => {
    expect(decodeQualityPreferences("{roto")).toBeUndefined();
    expect(decodeQualityPreferences('{"x":"8k"}')).toBeUndefined();
    expect(decodeQualityPreferences("ultra")).toBeUndefined();
  });
});
