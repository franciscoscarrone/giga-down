import { describe, expect, it } from "vitest";
import { isInstagramPostUrl, parseInstagramUrl } from "./detect";

const parse = (href: string) => parseInstagramUrl(new URL(href));

describe("isInstagramPostUrl", () => {
  it.each([
    "https://www.instagram.com/reel/Chunk8-jurw/",
    "https://www.instagram.com/reel/Chunk8-jurw",
    "https://instagram.com/reel/Chunk8-jurw/",
    "https://m.instagram.com/reel/Chunk8-jurw/",
    "https://www.instagram.com/reels/Cop84x6u7CP/",
    "https://www.instagram.com/p/DSzVXzKDy-M/",
    "https://instagram.com/p/-Cmh1cukG2/",
    "https://www.instagram.com/tv/BkfuX9UB-eK/",
    "https://www.instagram.com/marvelskies.fc/reel/CWqAgUZgCku/",
    "https://www.instagram.com/un_usuario/p/DSzVXzKDy-M/",
    "http://instagram.com/p/9o6LshA7zy/embed/",
    "https://www.instagram.com/p/9o6LshA7zy/embed/captioned/",
    "https://www.instagram.com/share/reel/BAGkPZ3Lm9/",
    "https://www.instagram.com/share/p/BAGkPZ3Lm9/",
    "https://www.instagram.com/share/BAGkPZ3Lm9",
    "https://vxinstagram.com/reel/Chunk8-jurw/",
    "https://www.ddinstagram.com/reel/Chunk8-jurw/",
    "https://kkinstagram.com/p/DSzVXzKDy-M/",
    "https://instagr.am/p/DSzVXzKDy-M/",
  ])("reconoce %s", (href) => {
    expect(isInstagramPostUrl(new URL(href))).toBe(true);
  });

  it.each([
    // Lo que agrega el botón Compartir de la app.
    "https://www.instagram.com/reel/Chunk8-jurw/?igsh=MWlqNzVzcHV4Yzc3NQ==",
    "https://www.instagram.com/reel/Chunk8-jurw/?utm_source=ig_web_copy_link",
    "https://www.instagram.com/p/DSzVXzKDy-M/?img_index=2",
  ])("reconoce links con parámetros: %s", (href) => {
    expect(isInstagramPostUrl(new URL(href))).toBe(true);
  });

  it.each([
    "https://www.instagram.com/",
    "https://www.instagram.com/instagram/",
    "https://www.instagram.com/instagram/reels/",
    "https://www.instagram.com/reels/",
    "https://www.instagram.com/reels/audio/1234567890123/",
    "https://www.instagram.com/stories/instagram/3456789012345678901/",
    "https://www.instagram.com/explore/tags/reel/",
    "https://www.instagram.com/reel/",
    "https://www.instagram.com/reel/abc/",
    "https://www.instagram.com/p/DSzVXzKDy-M/liked_by/",
    "https://www.instagram.com.evil.example/reel/Chunk8-jurw/",
    "https://notinstagram.com/reel/Chunk8-jurw/",
    "ftp://instagram.com/reel/Chunk8-jurw/",
  ])("rechaza %s", (href) => {
    expect(isInstagramPostUrl(new URL(href))).toBe(false);
  });
});

describe("parseInstagramUrl", () => {
  it("lee el código y usa la ruta canónica", () => {
    expect(parse("https://www.instagram.com/reel/Chunk8-jurw/?igsh=abc")).toEqual({
      code: "Chunk8-jurw",
      path: "/reel/Chunk8-jurw/",
      mediaNumber: undefined,
    });
  });

  it.each([
    ["https://www.instagram.com/reels/Cop84x6u7CP/", "/reel/Cop84x6u7CP/"],
    ["https://www.instagram.com/marvelskies.fc/reel/CWqAgUZgCku/", "/reel/CWqAgUZgCku/"],
    ["https://www.instagram.com/un_usuario/p/DSzVXzKDy-M/", "/p/DSzVXzKDy-M/"],
    ["https://www.instagram.com/tv/BkfuX9UB-eK/", "/p/BkfuX9UB-eK/"],
    ["https://www.instagram.com/p/9o6LshA7zy/embed/captioned/", "/p/9o6LshA7zy/"],
    ["https://www.instagram.com/share/reel/BAGkPZ3Lm9/", "/share/reel/BAGkPZ3Lm9/"],
    ["https://www.instagram.com/share/BAGkPZ3Lm9", "/share/BAGkPZ3Lm9/"],
  ])("%s → %s", (href, path) => {
    expect(parse(href)?.path).toBe(path);
  });

  it.each([
    ["https://www.instagram.com/p/DSzVXzKDy-M/?img_index=3", 3],
    ["https://vxinstagram.com/p/DSzVXzKDy-M/2/", 2],
    ["https://www.instagram.com/p/DSzVXzKDy-M/?img_index=0", undefined],
    ["https://www.instagram.com/p/DSzVXzKDy-M/?img_index=abc", undefined],
  ])("%s pide el elemento %s", (href, mediaNumber) => {
    expect(parse(href)?.mediaNumber).toBe(mediaNumber);
  });
});
