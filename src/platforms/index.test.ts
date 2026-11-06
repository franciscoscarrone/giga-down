import { describe, expect, it } from "vitest";
import { platformById, platformNames, registry } from "./index";

describe("plataformas habilitadas", () => {
  it("arma los textos de la UI con la conjunción correcta en español", () => {
    expect(platformNames("conjunction")).toBe("TikTok, X e Instagram");
    expect(platformNames("disjunction")).toBe("TikTok, X o Instagram");
  });

  it.each([
    ["https://www.tiktok.com/@scout2015/video/6718335390845095173", "tiktok"],
    ["https://x.com/historyinmemes/status/1790637656616943991", "x"],
    ["https://www.instagram.com/reel/Chunk8-jurw/", "instagram"],
    ["Mirá este reel https://www.instagram.com/reel/Chunk8-jurw/?igsh=abc 😂", "instagram"],
  ])("%s es de %s", (link, id) => {
    expect(registry.match(link)?.platform.id).toBe(id);
    expect(platformById(id)?.id).toBe(id);
  });
});
