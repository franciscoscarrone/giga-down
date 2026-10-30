import { describe, expect, it } from "vitest";
import { extractUrl, normalizedHost } from "./url";

describe("extractUrl", () => {
  it("devuelve el link tal cual si el texto es solo un link", () => {
    expect(extractUrl("https://vm.tiktok.com/ZMabc123/")?.href).toBe(
      "https://vm.tiktok.com/ZMabc123/",
    );
  });

  it("extrae el link de un texto compartido", () => {
    const shared = "Mirá este video de @alguien en TikTok https://vm.tiktok.com/ZMabc123/ 🔥";
    expect(extractUrl(shared)?.href).toBe("https://vm.tiktok.com/ZMabc123/");
  });

  it("acepta un host sin protocolo", () => {
    expect(extractUrl("  vm.tiktok.com/ZMabc123/ ")?.href).toBe("https://vm.tiktok.com/ZMabc123/");
  });

  it("saca la puntuación final que se pega al link", () => {
    expect(extractUrl("mirá esto: https://www.tiktok.com/t/ZT8abc/).")?.href).toBe(
      "https://www.tiktok.com/t/ZT8abc/",
    );
  });

  it("conserva los parámetros", () => {
    const url = extractUrl("https://www.tiktok.com/@a/video/1?is_from_webapp=1&sender_device=pc");
    expect(url?.searchParams.get("sender_device")).toBe("pc");
  });

  it.each(["", "   ", "hola", "ftp://example.com/archivo", "javascript:alert(1)", "tiktok"])(
    "devuelve null para %j",
    (input) => {
      expect(extractUrl(input)).toBeNull();
    },
  );
});

describe("normalizedHost", () => {
  it("pasa a minúsculas y quita www.", () => {
    expect(normalizedHost(new URL("https://WWW.TikTok.com/x"))).toBe("tiktok.com");
  });
});
