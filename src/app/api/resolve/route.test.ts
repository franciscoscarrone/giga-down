import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/core/errors";
import { mediaResultSchema } from "@/core/types";
import { ACCESS_KEY_HEADER } from "@/lib/api-contract";
import { registry } from "@/platforms";
import fixture from "@/platforms/tiktok/providers/__fixtures__/tikwm-video.json";
import fxFixture from "@/platforms/x/providers/__fixtures__/fxtwitter-multi.json";
import { POST } from "./route";

const TIKTOK_URL = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
const SECRET = "clave-super-secreta-de-prueba";

const fetchMock = vi.fn<typeof fetch>();

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const tikwmReplies = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ACCESS_KEY", "");
  // El adaptador de tikwm espacia los pedidos 1,1 s: adelantamos el reloj para no esperar.
  vi.setSystemTime(Date.now() + 60_000);
});

describe("POST /api/resolve", () => {
  it("resuelve un link de TikTok y devuelve { ok: true, data: MediaResult }", async () => {
    tikwmReplies(fixture);

    const response = await post({ url: `  ${TIKTOK_URL}  ` });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.ok).toBe(true);
    expect(mediaResultSchema.parse(body.data)).toMatchObject({
      platform: "tiktok",
      provider: "tikwm",
      id: "6718335390845095173",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://www.tikwm.com/api/");
  });

  it("detecta un link de X y lo resuelve con su plataforma", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(fxFixture)));
    // Los HEAD al CDN de X para conocer el tamaño de cada calidad.
    fetchMock.mockImplementation(
      async () => new Response(null, { headers: { "content-length": "1000000" } }),
    );

    const response = await post({
      url: "https://x.com/UltimaShadowX/status/1577719286659006464/video/2?s=46",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mediaResultSchema.parse(body.data)).toMatchObject({
      platform: "x",
      provider: "fxtwitter",
      id: "1577719286659006464",
      selectedIndex: 1,
    });
    expect(body.data.items).toHaveLength(4);
    expect(body.data.items[0].variants[0].size).toBe(1_000_000);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://api.fxtwitter.com/2/status/");
  });

  it("acepta el texto que comparte la app de TikTok", async () => {
    tikwmReplies(fixture);
    const response = await post({ url: `Mirá este video ${TIKTOK_URL} 😂` });
    expect(response.status).toBe(200);
  });

  describe("validación", () => {
    it.each([
      ["body que no es JSON", "esto no es json"],
      ["body sin url", {}],
      ["url que no es string", { url: 123 }],
      ["url vacía", { url: "   " }],
      ["url demasiado larga", { url: `https://vm.tiktok.com/${"a".repeat(3_000)}` }],
    ])("responde 400 INVALID_REQUEST ante %s", async (_label, body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: "INVALID_REQUEST", message: expect.any(String) },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("responde 422 UNSUPPORTED_URL si el link no es de una red soportada", async () => {
      const response = await post({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("UNSUPPORTED_URL");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("auth", () => {
    beforeEach(() => {
      vi.stubEnv("ACCESS_KEY", SECRET);
    });

    it("responde 401 UNAUTHORIZED si falta la clave, sin llamar al proveedor", async () => {
      const response = await post({ url: TIKTOK_URL });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("responde 401 si la clave es incorrecta y no la devuelve en la respuesta", async () => {
      const response = await post({ url: TIKTOK_URL }, { [ACCESS_KEY_HEADER]: "otra" });
      const text = await response.text();
      expect(response.status).toBe(401);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("otra");
    });

    it("valida la clave antes que el body", async () => {
      const response = await post("no es json");
      expect(response.status).toBe(401);
    });

    it("resuelve si la clave es correcta", async () => {
      tikwmReplies(fixture);
      const response = await post({ url: TIKTOK_URL }, { [ACCESS_KEY_HEADER]: SECRET });
      expect(response.status).toBe(200);
    });
  });

  describe("errores del proveedor", () => {
    it("responde 404 NOT_FOUND si tikwm no encuentra el video", async () => {
      tikwmReplies({ code: -1, msg: "Url parsing is failed! Please check url." });
      const response = await post({ url: TIKTOK_URL });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: "NOT_FOUND", message: expect.any(String) },
      });
    });

    it("responde 502 PROVIDER_ERROR si tikwm se cae", async () => {
      tikwmReplies({ error: "boom" }, 500);
      const response = await post({ url: TIKTOK_URL });
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("PROVIDER_ERROR");
    });

    // El reintento ante el límite de tikwm ya está cubierto en tikwm.test.ts;
    // acá solo importa cómo la API expone el error.
    it("responde 429 RATE_LIMITED con Retry-After", async () => {
      vi.spyOn(registry, "resolve").mockRejectedValueOnce(new AppError("RATE_LIMITED"));

      const response = await post({ url: TIKTOK_URL });

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("2");
      expect((await response.json()).error.code).toBe("RATE_LIMITED");
    });

    it("responde 504 TIMEOUT si el proveedor no contesta a tiempo", async () => {
      vi.spyOn(registry, "resolve").mockRejectedValueOnce(new AppError("TIMEOUT"));
      const response = await post({ url: TIKTOK_URL });
      expect(response.status).toBe(504);
      expect((await response.json()).error.code).toBe("TIMEOUT");
    });

    it("responde 500 INTERNAL_ERROR ante un error inesperado, sin filtrar el detalle", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(registry, "resolve").mockRejectedValueOnce(new Error("detalle interno"));

      const response = await post({ url: TIKTOK_URL });
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text).error.code).toBe("INTERNAL_ERROR");
      expect(text).not.toContain("detalle interno");
    });
  });
});
