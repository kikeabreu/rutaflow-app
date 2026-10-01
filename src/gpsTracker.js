import { useEffect, useState } from "react";

// Medición GPS de un viaje ("trip") o de km sin pasajero ("dead_km").
// Vive a nivel de módulo, no dentro del modal: cerrar el modal para revisar
// otra cosa no detiene la medición, y el estado se guarda en localStorage para
// recuperarlo al volver a abrirlo (o tras recargar la app).
export const TRACKER_KINDS = ["trip", "dead_km"];
const MIN_STEP_KM = 0.005;

const storageKey = (uid, kind) => `ruleto:${uid}:gps:${kind}`;
const live = new Map(); // key -> { watchId, listeners:Set }

const R = 6371;
const toRad = value => (value * Math.PI) / 180;
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function readTracker(uid, kind) {
  if (!uid) return null;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(uid, kind)) || "null");
    return value && typeof value.startedAt === "number" ? value : null;
  } catch {
    return null;
  }
}

function entry(uid, kind) {
  const key = storageKey(uid, kind);
  if (!live.has(key)) live.set(key, { watchId: null, listeners: new Set() });
  return live.get(key);
}

function write(uid, kind, state) {
  try {
    if (state) localStorage.setItem(storageKey(uid, kind), JSON.stringify(state));
    else localStorage.removeItem(storageKey(uid, kind));
  } catch {}
  entry(uid, kind).listeners.forEach(fn => fn(state));
  return state;
}

function clearWatch(uid, kind) {
  const current = entry(uid, kind);
  if (current.watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(current.watchId);
  }
  current.watchId = null;
}

function watch(uid, kind) {
  const current = entry(uid, kind);
  if (current.watchId != null || typeof navigator === "undefined" || !navigator.geolocation) return;
  current.watchId = navigator.geolocation.watchPosition(
    ({ coords: { latitude: lat, longitude: lon } }) => {
      const state = readTracker(uid, kind);
      if (!state?.running) { clearWatch(uid, kind); return; }
      let distKm = Number(state.distKm) || 0;
      if (state.last) {
        const step = distanceKm(state.last, { lat, lon });
        if (step > MIN_STEP_KM) distKm += step;
      }
      write(uid, kind, { ...state, distKm, last: { lat, lon }, error: "" });
    },
    () => {
      const state = readTracker(uid, kind);
      if (state?.running) write(uid, kind, { ...state, error: "gps" });
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
  );
}

export function startTracker(uid, kind, extra = {}) {
  if (!uid) return null;
  clearWatch(uid, kind);
  const state = write(uid, kind, { running: true, startedAt: Date.now(), distKm: 0, last: null, error: "", ...extra });
  watch(uid, kind);
  return state;
}

// Mezcla datos al estado guardado sin tocar la medición (p. ej. ubicación de inicio).
export function patchTracker(uid, kind, extra) {
  const state = readTracker(uid, kind);
  return state ? write(uid, kind, { ...state, ...extra }) : null;
}

export function stopTracker(uid, kind) {
  clearWatch(uid, kind);
  const state = readTracker(uid, kind);
  if (!state) return null;
  return write(uid, kind, { ...state, running: false, stoppedAt: state.stoppedAt || Date.now() });
}

export function clearTracker(uid, kind) {
  clearWatch(uid, kind);
  write(uid, kind, null);
}

// Retoma el watch tras recargar la app. El tramo entre el último punto y el
// primero nuevo se suma en línea recta, mejor que perderlo.
export function resumeTracker(uid, kind) {
  if (readTracker(uid, kind)?.running) watch(uid, kind);
}

export function subscribeTracker(uid, kind, fn) {
  const current = entry(uid, kind);
  current.listeners.add(fn);
  return () => current.listeners.delete(fn);
}

export const trackerElapsedMs = (state, now = Date.now()) =>
  state ? Math.max(0, (state.running ? now : state.stoppedAt || now) - state.startedAt) : 0;

export function useGpsTracker(uid, kind) {
  const [state, setState] = useState(() => readTracker(uid, kind));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!uid) { setState(null); return undefined; }
    setState(readTracker(uid, kind));
    resumeTracker(uid, kind);
    return subscribeTracker(uid, kind, setState);
  }, [uid, kind]);
  useEffect(() => {
    if (!state?.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.running]);
  return { state, elapsedMs: trackerElapsedMs(state, now) };
}
