/**
 * Aviso de instalación de Chromium (`beforeinstallprompt`). Chrome lo manda una sola vez por
 * carga, y puede llegar con la pantalla de la clave todavía abierta. Por eso se captura acá, al
 * cargar el módulo, y no dentro del componente que muestra el botón.
 */

export type InstallState = "waiting" | "ready" | "prompting" | "installed";

/** No está en los tipos del DOM: es una API de Chromium. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPrompt {
  subscribe(listener: () => void): () => void;
  getSnapshot(): InstallState;
  getServerSnapshot(): InstallState;
  /** Abre el cuadro de Chrome. Cada aviso sirve una sola vez. */
  prompt(): Promise<void>;
}

export function createInstallPrompt(target: EventTarget): InstallPrompt {
  const listeners = new Set<() => void>();
  let saved: BeforeInstallPromptEvent | null = null;
  let state: InstallState = "waiting";

  const setState = (next: InstallState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  target.addEventListener("beforeinstallprompt", (event) => {
    // Frena la barra propia de Chrome: la instalación se ofrece desde la sección.
    event.preventDefault();
    saved = event as BeforeInstallPromptEvent;
    setState("ready");
  });
  target.addEventListener("appinstalled", () => {
    saved = null;
    setState("installed");
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    getServerSnapshot: () => "waiting",
    async prompt() {
      if (!saved) return;
      const event = saved;
      saved = null;
      setState("prompting");
      try {
        const { outcome } = await event.prompt();
        if (outcome === "accepted") setState("installed");
        else setState(saved ? "ready" : "waiting");
      } catch {
        setState(saved ? "ready" : "waiting");
      }
    },
  };
}

export const installPrompt = createInstallPrompt(
  typeof window === "undefined" ? new EventTarget() : window,
);
