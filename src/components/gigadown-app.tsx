"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaResult } from "@/core/types";
import { useHydrated, useNow, usePersistentStore } from "@/hooks/use-client-state";
import { resolveMedia, type ClientError } from "@/lib/client/api";
import { addToHistory, historyStore } from "@/lib/client/history";
import { accessKeyStore } from "@/lib/client/preferences";
import { registry } from "@/platforms";
import { AccessGate } from "./access-gate";
import { HistoryList } from "./history-list";
import { LockIcon } from "./icons";
import { Wordmark } from "./logo";
import { ResultCard } from "./result-card";
import { EmptyState, ErrorPanel, ResultSkeleton } from "./states";
import { Toast } from "./toast";
import { UrlForm } from "./url-form";

type ResolveState =
  | { status: "idle" }
  | { status: "loading"; input: string }
  | { status: "success"; input: string; media: MediaResult; resolvedAt: number }
  | { status: "error"; input: string; error: ClientError };

/** Link que llega por `?url=` (Atajo de iPhone) o por el share target de Android (`?text=`). */
function readSharedLink(search: string): string | null {
  const params = new URLSearchParams(search);
  const candidates = ["url", "text", "title"]
    .map((name) => params.get(name)?.trim())
    .filter((value): value is string => Boolean(value));
  return candidates.find((value) => registry.match(value)) ?? candidates[0] ?? null;
}

export function GigaDownApp({ authRequired }: { authRequired: boolean }) {
  const hydrated = useHydrated();
  const now = useNow();
  const accessKey = usePersistentStore(accessKeyStore);
  const history = usePersistentStore(historyStore);

  const [input, setInput] = useState("");
  const [state, setState] = useState<ResolveState>({ status: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [gateReason, setGateReason] = useState<string | undefined>();

  const abortRef = useRef<AbortController | null>(null);
  const sharedConsumedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  const locked = authRequired && hydrated && !accessKey;

  const resolve = useCallback(
    async (raw: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "loading", input: raw });

      let result: Awaited<ReturnType<typeof resolveMedia>>;
      try {
        result = await resolveMedia(raw, accessKey, controller.signal);
      } catch {
        return; // Cancelado por un pedido más nuevo.
      }
      if (controller.signal.aborted) return;

      if (result.ok) {
        setState({ status: "success", input: raw, media: result.data, resolvedAt: Date.now() });
        historyStore.set(addToHistory(historyStore.getSnapshot(), result.data));
        return;
      }
      if (result.error.code === "UNAUTHORIZED" && authRequired) {
        setGateReason("La clave guardada ya no es válida. Ingresala de nuevo.");
        accessKeyStore.set(null);
      }
      setState({ status: "error", input: raw, error: result.error });
    },
    [accessKey, authRequired],
  );

  // Link compartido: se resuelve solo, una vez, cuando la app está lista (y desbloqueada).
  useEffect(() => {
    if (sharedConsumedRef.current || !hydrated || locked) return;
    sharedConsumedRef.current = true;
    const shared = readSharedLink(window.location.search);
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      setInput(shared);
      void resolve(shared);
    });
  }, [hydrated, locked, resolve]);

  // En celular el resultado queda debajo del formulario: lo traemos a la vista.
  useEffect(() => {
    if (state.status !== "success" && state.status !== "error") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.status]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  function startOver() {
    abortRef.current?.abort();
    setState({ status: "idle" });
    setInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    inputRef.current?.focus({ preventScroll: true });
  }

  function lock() {
    accessKeyStore.set(null);
    setGateReason(undefined);
    startOver();
  }

  const loading = state.status === "loading";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pt-8">
        <Link href="/" aria-label="GigaDown, volver al inicio" className="rounded-xl py-1">
          <Wordmark />
        </Link>
        {authRequired && accessKey && (
          <button
            type="button"
            onClick={lock}
            className="inline-flex min-h-11 items-center gap-2 rounded-[0.625rem] px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <LockIcon className="size-4" />
            Bloquear
          </button>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6 lg:px-8">
        {locked ? (
          <AccessGate
            reason={gateReason}
            onUnlock={(key) => {
              accessKeyStore.set(key);
              setGateReason(undefined);
              setState({ status: "idle" });
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-x-16 gap-y-10 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:pt-20">
            <section aria-labelledby="hero-title" className="flex flex-col gap-8">
              <div>
                <p className="font-mono text-xs font-medium tracking-[0.18em] text-muted uppercase">
                  Descargador personal
                </p>
                <h1
                  id="hero-title"
                  className="mt-3 font-display text-[2.75rem] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl"
                >
                  Pegá el link.{" "}
                  <span className="underline decoration-accent decoration-[0.14em] underline-offset-[0.12em]">
                    Bajá el video.
                  </span>
                </h1>
                <p className="mt-5 max-w-md text-lg text-muted">
                  Videos de TikTok{" "}
                  <mark className="rounded-md bg-accent px-1.5 text-accent-fg">
                    sin marca de agua
                  </mark>
                  , directo a tu dispositivo. Sin publicidad y sin vueltas.
                </p>
              </div>

              <div className="max-w-xl">
                <UrlForm
                  value={input}
                  onChange={setInput}
                  onSubmit={(value) => void resolve(value)}
                  busy={loading}
                  inputRef={inputRef}
                />
              </div>
            </section>

            <section
              ref={resultRef}
              aria-label="Resultado"
              aria-live="polite"
              aria-busy={loading}
              className="scroll-mt-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
            >
              <div className="flex flex-col gap-4 lg:sticky lg:top-8">
                {state.status === "idle" && <EmptyState />}
                {state.status === "loading" && (
                  <>
                    <p className="sr-only">Buscando el video…</p>
                    <ResultSkeleton />
                  </>
                )}
                {state.status === "success" && (
                  <ResultCard
                    key={`${state.media.platform}:${state.media.id}:${state.resolvedAt}`}
                    media={state.media}
                    onNotice={setNotice}
                    onRefresh={() => void resolve(state.media.sourceUrl)}
                  />
                )}
                {state.status === "error" && (
                  <ErrorPanel
                    error={state.error}
                    onRetry={() => void resolve(state.input)}
                    onNewLink={startOver}
                  />
                )}
              </div>
            </section>

            <div className="max-w-xl lg:row-start-2">
              <HistoryList
                entries={history}
                now={now}
                disabled={loading}
                onSelect={(entry) => {
                  setInput(entry.sourceUrl);
                  void resolve(entry.sourceUrl);
                }}
                onClear={() => historyStore.set([])}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs text-muted sm:px-6 lg:px-8">
        <p className="border-t border-border pt-5">
          Uso personal. Los videos se descargan directo desde la plataforma: nunca pasan por este
          servidor.
        </p>
      </footer>

      <Toast message={notice} onDismiss={dismissNotice} />
    </div>
  );
}
