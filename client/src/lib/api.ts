import { useCallback, useEffect, useState } from "react";

/**
 * In production the signed-in account arrives on a header from the SSO proxy
 * and the browser sends nothing. In dev mode the account switcher picks an
 * address, which rides along on x-dev-viewer so URLs stay clean.
 */
const DEV_VIEWER_KEY = "forecasters-hub.account";

export function devViewer(): string | null {
  try {
    return localStorage.getItem(DEV_VIEWER_KEY);
  } catch {
    return null;
  }
}

export function setDevViewer(email: string): void {
  try {
    localStorage.setItem(DEV_VIEWER_KEY, email);
  } catch {
    // Blocked storage — the choice lasts for this page load only.
  }
}

function headers(extra?: HeadersInit): HeadersInit {
  const email = devViewer();
  return {
    ...(extra ?? {}),
    ...(email ? { "x-dev-viewer": email } : {}),
  };
}

/**
 * One read, with the server's own message on a failure.
 *
 * Exported because not every read belongs to a component's lifetime: the
 * bell polls on a timer of its own, and going through `useApi` for that
 * would mean a changing path or a nonce in a dependency array to make it
 * refetch — mechanism in place of a plain call.
 */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal, headers: headers() });
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

/** Fetch-on-mount, with a reload for pages that change what they read. */
export function useApi<T>(path: string): Async<T> & { reload: () => void } {
  const [state, setState] = useState<Async<T>>({ loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    getJson<T>(path, controller.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setState({ error: err.message, loading: false });
      });
    return () => controller.abort();
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Sends a write and returns the parsed body, throwing the server's message. */
export async function send<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: headers({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const parsed = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(parsed?.error ?? `Request failed: ${res.status}`);
  return parsed as T;
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
