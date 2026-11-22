import { describe, expect, it } from "vitest";
import {
  authorFromTitle,
  browserFriendlyUrl,
  cdnVideoDetails,
  decodeEntities,
  isInstagramCdn,
} from "./common";

describe("isInstagramCdn", () => {
  it.each([
    ["https://scontent-ams4-1.cdninstagram.com/o1/a.mp4", true],
    ["https://instagram.fein1-2.fna.fbcdn.net/o1/a.mp4", true],
    ["https://video.xx.fbcdn.net/o1/a.mp4", true],
    ["http://scontent-ams4-1.cdninstagram.com/o1/a.mp4", false],
    ["https://cdninstagram.com.evil.example/a.mp4", false],
    ["https://d.rapidcdn.app/v2?token=abc", false],
    ["no es un link", false],
  ])("%s → %s", (url, expected) => {
    expect(isInstagramCdn(url)).toBe(expected);
  });
});

describe("browserFriendlyUrl", () => {
  it("deja igual los links que ya se pueden bajar desde el navegador", () => {
    const scontent = "https://scontent-ams4-1.cdninstagram.com/o1/a.mp4?_nc_cat=1&oe=6AEDBFD4";
    expect(browserFriendlyUrl(scontent)).toBe(scontent);
  });

  it("al cambiar el host no toca la ruta ni la firma del link", () => {
    const signed =
      "https://instagram.fein1-2.fna.fbcdn.net/o1/v/t2/AQN_x-y.mp4?_nc_ht=instagram.fein1-2.fna.fbcdn.net&efg=eyJ2Ijoi%3D%3D&oh=00_AQSH&oe=6AEF4302";
    expect(browserFriendlyUrl(signed)).toBe(
      "https://video.xx.fbcdn.net/o1/v/t2/AQN_x-y.mp4?_nc_ht=instagram.fein1-2.fna.fbcdn.net&efg=eyJ2Ijoi%3D%3D&oh=00_AQSH&oe=6AEF4302",
    );
  });
});

describe("authorFromTitle", () => {
  it.each([
    ["Instagram (@instagram)", { username: "instagram", displayName: "Instagram" }],
    [" (@suaraberkelas)", { username: "suaraberkelas", displayName: undefined }],
    ["Nike (@nike) • Instagram reel", { username: "nike", displayName: "Nike" }],
    [
      "Nat Geo (@natgeo) • Fotos y videos de Instagram",
      { username: "natgeo", displayName: "Nat Geo" },
    ],
    ["Otra cosa", undefined],
    ["Alguien (@alguien) dijo algo", undefined],
    [undefined, undefined],
  ])("%j → %j", (title, expected) => {
    expect(authorFromTitle(title)).toEqual(expected);
  });
});

describe("decodeEntities", () => {
  it.each([
    ["&#x201C;Hola&#x201D;", "“Hola”"],
    ["uno&#xA;dos", "uno\ndos"],
    ["&#x1F422;", "🐢"],
    [
      "Tom &amp; Jerry &lt;3 &quot;ok&quot; &apos;si&apos; &#39;no&#39;",
      `Tom & Jerry <3 "ok" 'si' 'no'`,
    ],
    ["&desconocida; queda igual", "&desconocida; queda igual"],
    ["&#x110000; fuera de rango", "&#x110000; fuera de rango"],
    ["sin nada", "sin nada"],
  ])("%j → %j", (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });
});

describe("cdnVideoDetails", () => {
  /** Etiquetas reales; la medida es la del MP4 que bajó el navegador. */
  it.each([
    ["vertical de 720x1280", "xpv_progressive.INSTAGRAM.CLIPS.C3.720.dash_baseline_1_v1", "hd"],
    [
      "horizontal de 1280x720",
      "xpv_progressive.INSTAGRAM.CLIPS.C3.1280.progressive_h264-basic-gen2_720p",
      "hd",
    ],
    ["horizontal sin sufijo", "xpv_progressive.INSTAGRAM.CLIPS.C3.1276.dash_baseline_1_v1", "hd"],
    ["vertical de 480x854", "xpv_progressive.INSTAGRAM.CLIPS.C3.480.dash_baseline_2_v1", "sd"],
    ["sin medida", "xpv_progressive.INSTAGRAM.CLIPS.dash_baseline_1_v1", undefined],
  ])("lee calidad y duración del parámetro efg: %s", (_label, tag, quality) => {
    const efg = Buffer.from(JSON.stringify({ vencode_tag: tag, duration_s: 15 })).toString(
      "base64",
    );
    const url = `https://scontent.cdninstagram.com/a.mp4?efg=${encodeURIComponent(efg)}`;
    expect(cdnVideoDetails(url)).toEqual({ quality, durationSeconds: 15 });
  });

  it("sin efg, o si no se puede leer, no inventa nada", () => {
    expect(cdnVideoDetails("https://scontent.cdninstagram.com/a.mp4")).toEqual({});
    expect(cdnVideoDetails("https://scontent.cdninstagram.com/a.mp4?efg=%%%")).toEqual({});
  });
});
