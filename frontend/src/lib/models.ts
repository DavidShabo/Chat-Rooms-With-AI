/**
 * Client-safe model list.
 *
 * Kept apart from lib/gemini.ts on purpose: that module reaches the
 * filesystem through the tool layer, so importing it from a client
 * component would drag node:fs into the browser bundle.
 */

export const SELECTABLE_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "Newest" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", hint: "" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", hint: "" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", hint: "Balanced" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", hint: "Fastest" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", hint: "" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", hint: "Most capable" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Legacy" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Legacy" },
] as const;

export type SelectableModel = (typeof SELECTABLE_MODELS)[number]["id"];

export function isSelectableModel(value: unknown): value is SelectableModel {
  return SELECTABLE_MODELS.some((model) => model.id === value);
}
