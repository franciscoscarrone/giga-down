import { describe, expect, it } from "vitest";
import { isTikTokVideoUrl } from "./detect";

const detect = (href: string) => isTikTokVideoUrl(new URL(href));

describe("isTikTokVideoUrl", () => {
  it.each([
    "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    "https://www.tiktok.com/@user.name_1/video/7234567890123456789/",
    "https://tiktok.com/@scout2015/video/6718335390845095173",
    "https://m.tiktok.com/v/6718335390845095173.html",
    "https://www.tiktok.com/t/ZT8abc123/",
    "https://www.tiktok.com/embed/v2/6718335390845095173",
    "https://vm.tiktok.com/ZMabc123/",
    "https://vm.tiktok.com/ZMabc123",
    "https://vt.tiktok.com/ZSxyz789/",
    "http://vm.tiktok.com/ZMabc123/",
  ])("reconoce %s", (href) => {
    expect(detect(href)).toBe(true);
  });

  it.each([
    "https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1&sender_device=pc",
    "https://vm.tiktok.com/ZMabc123/?_r=1&utm_source=copy",
    "https://www.tiktok.com/@scout2015/video/6718335390845095173#comentarios",
  ])("reconoce links con parámetros: %s", (href) => {
    expect(detect(href)).toBe(true);
  });

  it.each([
    "https://www.tiktok.com/",
    "https://www.tiktok.com/@scout2015",
    "https://www.tiktok.com/@scout2015/photo/7234567890123456789",
    "https://www.tiktok.com/@scout2015/video/abc",
    "https://vm.tiktok.com/",
    "https://vm.tiktok.com/ZMabc/extra/",
    "https://tiktok.com.evil.example/@a/video/1",
    "https://nottiktok.com/@a/video/1",
    "https://www.youtube.com/shorts/abc123",
    "ftp://www.tiktok.com/@a/video/1",
  ])("rechaza %s", (href) => {
    expect(detect(href)).toBe(false);
  });
});
