// src/tourBus.js
//
// Puente mínimo entre la app y la guía de onboarding.
//
// El tour necesita saber cuándo el conductor COMPLETÓ una acción de verdad
// (guardó su configuración, envió una pregunta a la IA, escuchó la respuesta),
// no cuándo tocó un elemento. Detectar clics no sirve: tocar "Guardar" no es
// lo mismo que guardar, y dictar por voz ni siquiera pasa por un clic.
//
// La app emite; la guía escucha. Si la guía no está abierta, no pasa nada.

export const TOUR_EVENTS = {
  CONFIG_CHANGED: "config-changed",
  PLATFORM_CHANGED: "platform-changed",
  CONFIG_SAVED: "config-saved",
  AI_MESSAGE_SENT: "ai-message-sent",
  AI_VOICE_STARTED: "ai-voice-started",
  AI_SPOKEN: "ai-spoken",
  SHIFT_STARTED: "shift-started",
  QUICK_OPENED: "quick-opened",
  TRIP_SAVED: "trip-saved",
};

const CHANNEL = "rutaflow-tour";

export function emitTourEvent(name) {
  if (typeof window === "undefined" || !name) return;
  window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { name } }));
}

export function onTourEvent(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (e) => handler(e?.detail?.name);
  window.addEventListener(CHANNEL, listener);
  return () => window.removeEventListener(CHANNEL, listener);
}
