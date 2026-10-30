import type { ClientError } from "@/lib/client/api";
import { ERROR_COPY } from "@/lib/client/messages";
import { AlertIcon, RetryIcon } from "./icons";

const STEPS = [
  ["Copiá el link", "En TikTok: Compartir → Copiar enlace."],
  ["Pegalo acá", "Con el botón Pegar se busca solo."],
  ["Descargá", "Sin marca de agua, directo a tu dispositivo."],
] as const;

export function EmptyState() {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border-strong p-5 sm:p-6">
      <div
        aria-hidden="true"
        className="mx-auto mb-6 hidden aspect-[9/16] w-40 flex-col justify-end gap-2 rounded-[1.75rem] border-[6px] border-surface-2 bg-surface p-3 shadow-card lg:flex"
      >
        <span className="h-2 w-3/4 rounded-full bg-surface-2" />
        <span className="h-2 w-1/2 rounded-full bg-surface-2" />
        <span className="mt-2 flex h-8 items-center justify-center rounded-lg bg-accent font-mono text-[10px] font-bold text-accent-fg">
          ↓ MP4
        </span>
      </div>
      <ol className="flex flex-col gap-4">
        {STEPS.map(([title, detail], index) => (
          <li key={title} className="flex gap-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-sm font-semibold">
              {index + 1}
            </span>
            <span className="flex flex-col pt-0.5">
              <span className="font-semibold">{title}</span>
              <span className="text-sm text-muted">{detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ResultSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card"
      aria-hidden="true"
    >
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="aspect-[9/16] w-[5.75rem] shrink-0 animate-shimmer rounded-xl bg-surface-2 sm:w-28" />
        <div className="flex flex-1 flex-col gap-2.5 pt-1">
          <div className="h-2.5 w-16 animate-shimmer rounded-full bg-surface-2" />
          <div className="h-4 w-full animate-shimmer rounded-full bg-surface-2" />
          <div className="h-4 w-4/5 animate-shimmer rounded-full bg-surface-2" />
          <div className="h-3 w-1/2 animate-shimmer rounded-full bg-surface-2" />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="h-14 animate-shimmer rounded-[var(--radius-control)] bg-surface-2" />
          <div className="h-14 animate-shimmer rounded-[var(--radius-control)] bg-surface-2" />
        </div>
        <div className="h-14 animate-shimmer rounded-[var(--radius-control)] bg-surface-2" />
      </div>
    </div>
  );
}

interface ErrorPanelProps {
  error: ClientError;
  onRetry(): void;
  onNewLink(): void;
}

export function ErrorPanel({ error, onRetry, onNewLink }: ErrorPanelProps) {
  const copy = ERROR_COPY[error.code];
  return (
    <div
      role="alert"
      className="animate-rise rounded-[var(--radius-card)] border border-danger/35 bg-danger-soft p-5 sm:p-6"
    >
      <div className="flex gap-3">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">{copy.title}</h2>
          <p className="text-sm text-muted">{copy.hint}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 pl-8">
        {copy.retry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2 rounded-[0.625rem] bg-primary px-4 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.98]"
          >
            <RetryIcon className="size-4" />
            Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={onNewLink}
          className="inline-flex min-h-11 items-center rounded-[0.625rem] border border-border-strong bg-surface px-4 text-sm font-semibold transition hover:border-fg active:scale-[0.98]"
        >
          Probar otro link
        </button>
      </div>
    </div>
  );
}
