"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useDeviceOS, useIsStandalone } from "@/hooks/use-client-state";
import { installPrompt } from "@/lib/client/install-prompt";
import { platformNames } from "@/platforms";
import { CheckIcon, DownloadIcon, ShareIcon } from "./icons";

/** El nombre del archivo es el nombre con el que iOS instala el atajo. */
const SHORTCUT_FILE = "GigaDown.shortcut";

const USE_STEP = `En ${platformNames("disjunction")}: Compartir → más opciones → GigaDown.`;

const IOS_STEPS = [
  "Desde Safari, tocá el botón y aceptá la descarga.",
  "Abrí el archivo desde las descargas de Safari o desde Archivos → Descargas, y confirmá en Atajos.",
  USE_STEP,
];

/** Chrome tarda en habilitar el botón, y otros navegadores no lo tienen: siempre hay otra vía. */
const ANDROID_MANUAL_STEPS = [
  "Desde Chrome, tocá ⋮ → Instalar app (o Agregar a la pantalla principal) y confirmá con Instalar.",
  USE_STEP,
];

const ANDROID_BUTTON_STEPS = ["Tocá el botón y confirmá con Instalar.", USE_STEP];

const PRIMARY_ACTION =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-base font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.985] disabled:cursor-progress disabled:opacity-70";

function SetupCard({ steps, children }: { steps: readonly string[]; children?: ReactNode }) {
  return (
    <section
      aria-labelledby="share-setup-title"
      className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <ShareIcon className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="share-setup-title" className="font-display text-lg font-semibold tracking-tight">
            Agregá GigaDown a Compartir
          </h2>
          <p className="text-sm text-muted">
            Mandá un video a GigaDown desde el menú de compartir, sin copiar el link.
          </p>
        </div>
      </div>

      {children}

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-xs font-semibold">
              {index + 1}
            </span>
            <span className="text-muted">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function IosSetup() {
  return (
    <SetupCard steps={IOS_STEPS}>
      <a href={`/${SHORTCUT_FILE}`} download={SHORTCUT_FILE} className={PRIMARY_ACTION}>
        <DownloadIcon className="size-5" />
        Agregar el atajo
      </a>
    </SetupCard>
  );
}

function AndroidSetup() {
  const state = useSyncExternalStore(
    installPrompt.subscribe,
    installPrompt.getSnapshot,
    installPrompt.getServerSnapshot,
  );

  if (state === "installed") {
    return (
      <SetupCard steps={[USE_STEP]}>
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 text-sm font-medium"
        >
          <CheckIcon className="size-5 shrink-0" />
          Listo, GigaDown se está instalando. Puede tardar un momento en aparecer en Compartir.
        </p>
      </SetupCard>
    );
  }

  if (state === "waiting") return <SetupCard steps={ANDROID_MANUAL_STEPS} />;

  return (
    <SetupCard steps={ANDROID_BUTTON_STEPS}>
      <button
        type="button"
        disabled={state === "prompting"}
        onClick={() => void installPrompt.prompt()}
        className={PRIMARY_ACTION}
      >
        <DownloadIcon className="size-5" />
        Instalar GigaDown
      </button>
    </SetupCard>
  );
}

/** Cómo sumar GigaDown al menú Compartir. Dentro de la app instalada ya no hace falta. */
export function ShareSetup() {
  const os = useDeviceOS();
  const standalone = useIsStandalone();

  if (os === "ios") return <IosSetup />;
  if (os === "android" && !standalone) return <AndroidSetup />;
  return null;
}
