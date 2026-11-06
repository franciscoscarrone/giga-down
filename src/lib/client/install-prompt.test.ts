import { describe, expect, it, vi } from "vitest";
import { createInstallPrompt } from "./install-prompt";

function installEvent(prompt = vi.fn(async () => ({ outcome: "accepted" }))) {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });
}

describe("createInstallPrompt", () => {
  it("arranca esperando el aviso de Chrome", () => {
    const install = createInstallPrompt(new EventTarget());
    expect(install.getSnapshot()).toBe("waiting");
    expect(install.getServerSnapshot()).toBe("waiting");
  });

  it("guarda el aviso, frena la barra de Chrome y notifica", () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    const listener = vi.fn();
    install.subscribe(listener);

    const event = installEvent();
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(install.getSnapshot()).toBe("ready");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("guarda un aviso que llega antes de que alguien se suscriba", () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    target.dispatchEvent(installEvent());

    const listener = vi.fn();
    install.subscribe(listener);

    expect(install.getSnapshot()).toBe("ready");
    expect(listener).not.toHaveBeenCalled();
  });

  it("queda instalada si la persona acepta", async () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    const prompt = vi.fn(async () => ({ outcome: "accepted" }));
    target.dispatchEvent(installEvent(prompt));

    await install.prompt();

    expect(prompt).toHaveBeenCalledOnce();
    expect(install.getSnapshot()).toBe("installed");
  });

  it("queda en prompting mientras el cuadro está abierto", async () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    let answer: (choice: { outcome: string }) => void = () => {};
    const prompt = vi.fn(() => new Promise<{ outcome: string }>((resolve) => (answer = resolve)));
    target.dispatchEvent(installEvent(prompt));

    const pending = install.prompt();
    expect(install.getSnapshot()).toBe("prompting");

    answer({ outcome: "accepted" });
    await pending;
    expect(install.getSnapshot()).toBe("installed");
  });

  it("vuelve a esperar si la persona cancela, sin reusar el aviso", async () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    const prompt = vi.fn(async () => ({ outcome: "dismissed" }));
    target.dispatchEvent(installEvent(prompt));

    await install.prompt();
    expect(install.getSnapshot()).toBe("waiting");

    await install.prompt();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("vuelve a esperar si Chrome no puede abrir el cuadro", async () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    target.dispatchEvent(installEvent(vi.fn(async () => Promise.reject(new Error("usado")))));

    await install.prompt();

    expect(install.getSnapshot()).toBe("waiting");
  });

  it("ofrece un aviso nuevo que llegó con el cuadro abierto", async () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    const second = vi.fn(async () => ({ outcome: "accepted" }));
    const first = vi.fn(async () => {
      target.dispatchEvent(installEvent(second));
      return { outcome: "dismissed" };
    });
    target.dispatchEvent(installEvent(first));

    await install.prompt();
    expect(install.getSnapshot()).toBe("ready");

    await install.prompt();
    expect(second).toHaveBeenCalledOnce();
  });

  it("queda instalada con appinstalled y descarta el aviso", async () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    const prompt = vi.fn(async () => ({ outcome: "accepted" }));
    target.dispatchEvent(installEvent(prompt));

    target.dispatchEvent(new Event("appinstalled"));
    expect(install.getSnapshot()).toBe("installed");

    await install.prompt();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("no hace nada si todavía no llegó el aviso", async () => {
    const install = createInstallPrompt(new EventTarget());
    await install.prompt();
    expect(install.getSnapshot()).toBe("waiting");
  });

  it("deja de notificar al desuscribirse", () => {
    const target = new EventTarget();
    const install = createInstallPrompt(target);
    const listener = vi.fn();
    const unsubscribe = install.subscribe(listener);

    unsubscribe();
    target.dispatchEvent(installEvent());

    expect(listener).not.toHaveBeenCalled();
  });
});
