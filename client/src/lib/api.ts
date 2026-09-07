import { useEffect, useState } from "react";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Async<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/** Small fetch-on-mount hook. Enough for the Hub's read-only pages. */
export function useApi<T>(path: string): Async<T> {
  const [state, setState] = useState<Async<T>>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    getJson<T>(path, controller.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ error: err.message, loading: false });
      });
    return () => controller.abort();
  }, [path]);

  return state;
}

/** Builds an /api query string, dropping empty values. */
export function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
