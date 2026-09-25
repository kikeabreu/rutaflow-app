import { useEffect, useState } from "react";

// Paleta de marca Ruleto Drive. `C` es un objeto compartido y MUTABLE a propósito:
// todo el código de la app (componentes, helpers, objetos literales fuera de render)
// lee C.accent/C.bg/etc. como si fueran constantes, así que cambiar de tema muta las
// propiedades de este mismo objeto en vez de reemplazarlo, y un solo hook en la raíz
// fuerza el re-render que hace visibles los valores nuevos.
export const PALETTES = {
  dark: {
    bg: "#0A1F1A", card: "#0F2B24", card2: "#13352C", border: "#1E4A3E", bord2: "#2A5C4D",
    accent: "#4ADE80", teal: "#00C9A7", warn: "#F0A500", danger: "#FF4055", well: "#081712",
    dim: "#3E6E60", muted: "#7FA396", text: "#EAFBF3",
  },
  light: {
    bg: "#F3F4F6", card: "#FFFFFF", card2: "#F7F9F8", border: "#E1E5E3", bord2: "#CBD3CF",
    accent: "#0F2D27", teal: "#0D9488", warn: "#B45309", danger: "#DC2626", well: "#EAEDEB",
    dim: "#B9C2BE", muted: "#6B7280", text: "#111827",
  },
};

// Verde+mica de marca, siempre igual en los dos temas: para rellenos sólidos de
// botón que llevan texto negro encima (un accent oscuro en modo claro dejaría ese
// texto negro ilegible).
export const ACCENT_FILL = "#4ADE80";

export const THEME_KEY = "ruleto_theme";

function systemPrefersLight() {
  try {
    return typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

export function getInitialTheme() {
  try {
    const saved = typeof window !== "undefined" && window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return systemPrefersLight() ? "light" : "dark";
}

let mode = getInitialTheme();
export const C = { ...PALETTES[mode] };
const listeners = new Set();

export function getThemeMode() {
  return mode;
}

export function setTheme(next) {
  const resolved = next === "light" ? "light" : "dark";
  if (resolved === mode) return;
  mode = resolved;
  Object.assign(C, PALETTES[mode]);
  try { window.localStorage.setItem(THEME_KEY, mode); } catch {}
  listeners.forEach(fn => fn(mode));
}

export function toggleTheme() {
  setTheme(mode === "light" ? "dark" : "light");
}

// Se suscribe a los cambios de tema y fuerza un re-render del árbol que lo llama.
// Solo necesita invocarse una vez cerca de la raíz: como C se muta en el mismo
// objeto, cualquier componente hijo que lea C.xxx en su render ve el valor nuevo
// en cuanto la raíz vuelve a renderizar.
export function useTheme() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);
  return { mode, C, setTheme, toggleTheme };
}
