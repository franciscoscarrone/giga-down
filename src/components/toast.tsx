"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";

interface ToastProps {
  message: string | null;
  onDismiss(): void;
  durationMs?: number;
}

/** Aviso breve abajo de la pantalla. La región es `status`: se anuncia sin interrumpir. */
export function Toast({ message, onDismiss, durationMs = 6_000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {message && (
        <div className="pointer-events-auto flex max-w-md animate-rise items-start gap-3 rounded-2xl bg-fg py-3 pr-2 pl-4 text-sm text-bg shadow-card">
          <p className="py-1.5">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar aviso"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full transition hover:bg-bg/15"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
