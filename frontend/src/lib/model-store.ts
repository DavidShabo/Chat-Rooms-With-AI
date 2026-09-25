"use client";

import { useSyncExternalStore } from "react";

const KEY = "pixi:model";

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Private mode or blocked storage.
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep other tabs in sync too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setStoredModel(model: string) {
  try {
    localStorage.setItem(KEY, model);
  } catch {
    // The choice still applies for this render.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Reads the saved model without an effect, so the server render and the
 * first client render agree (both use `fallback`) and no cascading state
 * update is needed after mount.
 */
export function useStoredModel(fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => read() ?? fallback,
    () => fallback
  );
}
