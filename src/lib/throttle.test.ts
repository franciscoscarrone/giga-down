import { afterEach, describe, expect, it, vi } from "vitest";
import { createThrottle, sleep } from "./throttle";

describe("createThrottle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deja pasar la primera llamada sin esperar y espacia las siguientes", async () => {
    vi.useFakeTimers({ now: 0 });
    const waitTurn = createThrottle(1_000);
    const started: number[] = [];

    const calls = [1, 2, 3].map(() => waitTurn().then(() => started.push(Date.now())));
    await vi.runAllTimersAsync();
    await Promise.all(calls);

    expect(started).toEqual([0, 1_000, 2_000]);
  });

  it("no espera si ya pasó el intervalo", async () => {
    vi.useFakeTimers({ now: 0 });
    const waitTurn = createThrottle(1_000);
    await waitTurn();
    vi.setSystemTime(5_000);
    const spy = vi.spyOn(globalThis, "setTimeout");
    await waitTurn();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("sleep", () => {
  it("se corta si la señal se aborta", async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort(new Error("cancelado"));
    await expect(pending).rejects.toThrow("cancelado");
  });
});
