import { describe, expect, it, vi } from "vitest";
import { ACCESS_KEY_HEADER } from "@/lib/api-contract";
import { GET } from "./route";

const get = (key?: string) =>
  GET(
    new Request("http://localhost/api/auth", {
      headers: key === undefined ? {} : { [ACCESS_KEY_HEADER]: key },
    }),
  );

describe("GET /api/auth", () => {
  it("informa que no hace falta clave si no hay una configurada", async () => {
    vi.stubEnv("ACCESS_KEY", "");
    const response = await get();
    expect(await response.json()).toEqual({ ok: true, data: { required: false } });
  });

  it("responde 401 sin clave o con una incorrecta", async () => {
    vi.stubEnv("ACCESS_KEY", "secreta");
    expect((await get()).status).toBe(401);
    expect((await get("incorrecta")).status).toBe(401);
  });

  it("acepta la clave correcta", async () => {
    vi.stubEnv("ACCESS_KEY", "secreta");
    const response = await get("secreta");
    expect(await response.json()).toEqual({ ok: true, data: { required: true } });
  });
});
