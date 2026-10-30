import { describe, expect, it } from "vitest";
import { isXStatusUrl, parseXStatusUrl } from "./detect";

const parse = (href: string) => parseXStatusUrl(new URL(href));

describe("isXStatusUrl", () => {
  it.each([
    "https://x.com/historyinmemes/status/1790637656616943991",
    "https://x.com/historyinmemes/status/1790637656616943991/",
    "https://www.x.com/historyinmemes/status/1790637656616943991",
    "https://twitter.com/starwars/status/665052190608723968",
    "https://mobile.twitter.com/starwars/status/665052190608723968",
    "https://mobile.x.com/starwars/status/665052190608723968",
    "https://x.com/i/status/1790637656616943991",
    "https://twitter.com/i/web/status/910031516746514432",
    "https://twitter.com/starwars/statuses/665052190608723968",
    "https://fxtwitter.com/historyinmemes/status/1790637656616943991",
    "https://fixupx.com/historyinmemes/status/1790637656616943991",
    "https://vxtwitter.com/historyinmemes/status/1790637656616943991",
    "https://x.com/UltimaShadowX/status/1577719286659006464/video/2",
    "https://x.com/UltimaShadowX/status/1577719286659006464/photo/1",
    "http://x.com/historyinmemes/status/1790637656616943991",
  ])("reconoce %s", (href) => {
    expect(isXStatusUrl(new URL(href))).toBe(true);
  });

  it.each([
    // Lo que agrega el botón Compartir de la app.
    "https://x.com/historyinmemes/status/1790637656616943991?s=46&t=AbCdEf123",
    "https://x.com/historyinmemes/status/1790637656616943991?s=20",
    "https://twitter.com/historyinmemes/status/1790637656616943991#m",
  ])("reconoce links con parámetros: %s", (href) => {
    expect(isXStatusUrl(new URL(href))).toBe(true);
  });

  it.each([
    "https://x.com/",
    "https://x.com/historyinmemes",
    "https://x.com/historyinmemes/status/",
    "https://x.com/historyinmemes/status/abc",
    "https://x.com/historyinmemes/status/1790637656616943991/video/5",
    "https://x.com/historyinmemes/status/1790637656616943991/likes",
    "https://x.com/un_usuario_demasiado_largo/status/1790637656616943991",
    "https://x.com/search?q=video",
    "https://x.com.evil.example/a/status/1",
    "https://notx.com/a/status/1",
    "https://t.co/Zgzhvix8ES",
    "ftp://x.com/a/status/1",
  ])("rechaza %s", (href) => {
    expect(isXStatusUrl(new URL(href))).toBe(false);
  });
});

describe("parseXStatusUrl", () => {
  it("lee el id del post", () => {
    expect(parse("https://x.com/historyinmemes/status/1790637656616943991?s=46")).toEqual({
      id: "1790637656616943991",
      mediaNumber: undefined,
    });
  });

  it("lee qué foto o video pide el link", () => {
    expect(parse("https://x.com/UltimaShadowX/status/1577719286659006464/video/3")).toEqual({
      id: "1577719286659006464",
      mediaNumber: 3,
    });
  });
});
