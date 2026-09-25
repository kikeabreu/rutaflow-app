// src/tourBus.js
//
// Puente mínimo entre la app y la guía de onboarding.
//
// El tour necesita saber cuándo el conductor COMPLETÓ una acción de verdad
// (guardó su configuración, envió una pregunta a la IA, cerró el modal), no
// cuándo tocó un elemento. Detectar clics no sirve: tocar "Guardar" no es lo
// mismo que guardar, y dictar por voz ni siquiera pasa por un clic.
//
// Algunos avisos llevan un valor porque el paso depende de cuál fue: qué
// pestaña se abrió, qué modo de captura se eligió, qué tipo de registro.
//
// La app emite; la guía escucha. Si la guía no está abierta, no pasa nada.

export const TOUR_EVENTS = {
  TAB_CHANGED: "tab-changed",               // valor: id de la pestaña
  CONFIG_CHANGED: "config-changed",
  PLATFORM_CHANGED: "platform-changed",     // nombre o comisión
  PLATFORM_TOGGLED: "platform-toggled",     // el círculo de activar/desactivar
  CONFIG_SAVED: "config-saved",
  AI_MESSAGE_SENT: "ai-message-sent",
  AI_VOICE_STARTED: "ai-voice-started",
  AI_SPOKEN: "ai-spoken",
  SHIFT_STARTED: "shift-started",
  TRIP_MODAL_OPENED: "trip-modal-opened",
  TRIP_MODE_CHANGED: "trip-mode-changed",   // valor: manual | gps | photo
  TRIP_FIELD_FILLED: "trip-field-filled",   // valor: nombre del campo
  TRIP_SAVED: "trip-saved",
  TRIP_MODAL_CLOSED: "trip-modal-closed",
  QUICK_OPENED: "quick-opened",
  QUICK_TYPE_CHANGED: "quick-type-changed", // valor: tipo de registro
  QUICK_CLOSED: "quick-closed",
};

const CHANNEL = "rutaflow-tour";

export function emitTourEvent(name, value) {
  if (typeof window === "undefined" || !name) return;
  window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { name, value } }));
}

export function onTourEvent(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (e) => handler(e?.detail?.name, e?.detail?.value);
  window.addEventListener(CHANNEL, listener);
  return () => window.removeEventListener(CHANNEL, listener);
}
