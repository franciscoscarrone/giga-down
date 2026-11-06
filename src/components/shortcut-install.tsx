"use client";

import { useDeviceOS } from "@/hooks/use-client-state";
import { platformNames } from "@/platforms";
import { DownloadIcon, ShareIcon } from "./icons";

/** El nombre del archivo es el nombre con el que iOS instala el atajo. */
const SHORTCUT_FILE = "GigaDown.shortcut";

const STEPS = [
  "Desde Safari, tocá el botón y aceptá la descarga.",
  "Abrí el archivo desde las descargas de Safari o desde Archivos → Descargas, y confirmá en Atajos.",
  `En ${platformNames("disjunction")}: Compartir → más opciones → GigaDown.`,
] as const;

/** Instalación del Atajo. Solo en iOS: en Android, GigaDown recibe links como app instalada. */
export function ShortcutInstall() {
  const os = useDeviceOS();
  if (os !== "ios") return null;

  return (
    <section
      aria-labelledby="shortcut-title"
      className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <ShareIcon className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="shortcut-title" className="font-display text-lg font-semibold tracking-tight">
            Agregá GigaDown a Compartir
          </h2>
          <p className="text-sm text-muted">
            Mandá un video a GigaDown desde el menú de compartir, sin copiar el link.
          </p>
        </div>
      </div>

      <a
        href={`/${SHORTCUT_FILE}`}
        download={SHORTCUT_FILE}
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 text-base font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.985]"
      >
        <DownloadIcon className="size-5" />
        Agregar el atajo
      </a>

      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
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
