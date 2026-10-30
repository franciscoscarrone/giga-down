"use client";

import { useId, useState, type FormEvent } from "react";
import { checkAccessKey } from "@/lib/client/api";
import { ERROR_COPY } from "@/lib/client/messages";
import { LockIcon } from "./icons";

interface AccessGateProps {
  onUnlock(key: string): void;
  /** Mensaje cuando la clave guardada dejó de ser válida. */
  reason?: string;
}

export function AccessGate({ onUnlock, reason }: AccessGateProps) {
  const inputId = useId();
  const errorId = useId();
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = key.trim();
    if (!value) {
      setError("Ingresá la clave.");
      return;
    }
    setChecking(true);
    setError(null);
    const result = await checkAccessKey(value);
    setChecking(false);
    if (result.ok) onUnlock(value);
    else
      setError(
        result.error.code === "UNAUTHORIZED"
          ? "Esa clave no es correcta."
          : ERROR_COPY[result.error.code].title,
      );
  }

  return (
    <section
      aria-labelledby="gate-title"
      className="mx-auto mt-10 w-full max-w-md animate-rise rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-card sm:mt-20 sm:p-8"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
        <LockIcon className="size-6" />
      </span>
      <h1 id="gate-title" className="mt-5 font-display text-2xl font-extrabold tracking-tight">
        Esta app es privada
      </h1>
      <p className="mt-2 text-muted">
        {reason ?? "Ingresá la clave una vez y queda guardada en este dispositivo."}
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          Clave de acceso
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`min-h-12 rounded-[var(--radius-control)] border bg-surface px-4 text-base transition outline-none focus:border-fg ${
            error ? "border-danger" : "border-border-strong"
          }`}
        />
        {error && (
          <p id={errorId} role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking}
          className="mt-1 inline-flex min-h-14 items-center justify-center rounded-[var(--radius-control)] bg-primary px-6 font-semibold text-primary-fg transition hover:bg-primary-hover active:scale-[0.985] disabled:cursor-progress disabled:opacity-70"
        >
          {checking ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </section>
  );
}
