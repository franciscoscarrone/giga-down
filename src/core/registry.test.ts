import { describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
import { createRegistry } from "./registry";
import type { MediaResult, Platform, Provider } from "./types";

const result = (provider: string): MediaResult => ({
  platform: "fake",
  provider,
  id: "123",
  sourceUrl: "https://fake.example/v/123",
  author: { username: "alguien" },
  title: "Un video",
  variants: [
    {
      id: "hd",
      quality: "hd",
      watermark: false,
      url: "https://cdn.example/hd.mp4",
      mimeType: "video/mp4",
    },
    {
      id: "wm",
      quality: "sd",
      watermark: true,
      url: "https://cdn.example/wm.mp4",
      mimeType: "video/mp4",
    },
    {
      id: "sd",
      quality: "sd",
      watermark: false,
      url: "https://cdn.example/sd.mp4",
      mimeType: "video/mp4",
    },
  ],
});

const ok = (id: string): Provider => ({ id, resolve: vi.fn(async () => result(id)) });
const failing = (id: string, error: unknown): Provider => ({
  id,
  resolve: vi.fn(async () => {
    throw error;
  }),
});

const platformWith = (...providers: Provider[]): Platform => ({
  id: "fake",
  name: "Fake",
  detect: (url) => url.hostname === "fake.example",
  providers,
});

describe("registry.match", () => {
  const registry = createRegistry([platformWith(ok("a"))]);

  it("encuentra la plataforma dentro de un texto", () => {
    expect(registry.match("mirá https://fake.example/v/1 !")?.platform.id).toBe("fake");
  });

  it("devuelve null si ninguna plataforma reconoce el link", () => {
    expect(registry.match("https://otra.example/v/1")).toBeNull();
    expect(registry.match("no es un link")).toBeNull();
  });
});

describe("registry.resolve", () => {
  it("lanza UNSUPPORTED_URL si ninguna plataforma reconoce el link", async () => {
    const registry = createRegistry([platformWith(ok("a"))]);
    await expect(registry.resolve("https://otra.example/v/1")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL",
    });
  });

  it("usa el primer proveedor si funciona y no llama a los demás", async () => {
    const first = ok("primero");
    const second = ok("segundo");
    const registry = createRegistry([platformWith(first, second)]);

    const media = await registry.resolve("https://fake.example/v/123");

    expect(media.provider).toBe("primero");
    expect(second.resolve).not.toHaveBeenCalled();
  });

  it("pasa al siguiente proveedor si uno falla (fallback)", async () => {
    const onProviderError = vi.fn();
    const broken = failing("roto", new AppError("PROVIDER_ERROR"));
    const registry = createRegistry([platformWith(broken, ok("respaldo"))], { onProviderError });

    const media = await registry.resolve("https://fake.example/v/123");

    expect(media.provider).toBe("respaldo");
    expect(onProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "roto",
        error: expect.objectContaining({ code: "PROVIDER_ERROR" }),
      }),
    );
  });

  it("trata un resultado que no cumple el contrato como fallo y sigue", async () => {
    const invalid: Provider = { id: "invalido", resolve: async () => ({ nada: true }) as never };
    const registry = createRegistry([platformWith(invalid, ok("respaldo"))]);

    await expect(registry.resolve("https://fake.example/v/123")).resolves.toMatchObject({
      provider: "respaldo",
    });
  });

  it("si todos fallan, informa el error más relevante", async () => {
    const registry = createRegistry([
      platformWith(
        failing("a", new AppError("TIMEOUT")),
        failing("b", new AppError("NOT_FOUND")),
        failing("c", new Error("boom")),
      ),
    ]);

    await expect(registry.resolve("https://fake.example/v/123")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("convierte errores desconocidos en PROVIDER_ERROR", async () => {
    const registry = createRegistry([platformWith(failing("a", new TypeError("fetch failed")))]);
    await expect(registry.resolve("https://fake.example/v/123")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("corta con TIMEOUT a un proveedor colgado y prueba el siguiente", async () => {
    const hanging: Provider = { id: "colgado", resolve: () => new Promise(() => {}) };
    const registry = createRegistry([platformWith(hanging, ok("respaldo"))], { timeoutMs: 20 });

    await expect(registry.resolve("https://fake.example/v/123")).resolves.toMatchObject({
      provider: "respaldo",
    });
  });

  it("le pasa al proveedor una señal que se aborta por timeout", async () => {
    let seen: AbortSignal | undefined;
    const slow: Provider = {
      id: "lento",
      resolve: (_url, { signal }) => {
        seen = signal;
        return new Promise(() => {});
      },
    };
    const registry = createRegistry([platformWith(slow)], { timeoutMs: 20 });

    await expect(registry.resolve("https://fake.example/v/123")).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(seen?.aborted).toBe(true);
  });

  it("ordena las variantes: sin marca primero y de menor a mayor calidad", async () => {
    const registry = createRegistry([platformWith(ok("a"))]);
    const media = await registry.resolve("https://fake.example/v/123");
    expect(media.variants.map((v) => v.id)).toEqual(["sd", "hd", "wm"]);
  });

  it("lanza PROVIDER_ERROR si la plataforma no tiene proveedores", async () => {
    const registry = createRegistry([platformWith()]);
    await expect(registry.resolve("https://fake.example/v/123")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});
