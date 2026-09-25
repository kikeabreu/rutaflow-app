// src/dayTracking.js
//
// Kilómetros de la jornada, incluidos los que se hacen sin pasajero.
//
// En el navegador solo se puede medir con navigator.geolocation mientras la
// app está en pantalla: en cuanto el conductor se pasa a Uber o apaga el
// teléfono, el WebView se congela y deja de contar. Justo cuando va manejando.
//
// En Android existe un servicio en primer plano (NativeTrackingService) que
// sigue tomando puntos con la app cerrada, con su notificación visible. Este
// módulo es el que los cobra: los lee, los convierte en distancia y los
// confirma para que no se cuenten dos veces.

import { nativeTracking } from "./nativeTrackingClient";

export function haversineKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Number(null) y Number("") valen 0, así que un punto sin coordenadas se
// colaría como la isla nula frente a África y le sumaría al conductor media
// vuelta al mundo. Hay que descartarlo antes de convertirlo.
const coordenada = (valor, limite) => {
  if (valor === null || valor === undefined || valor === "") return NaN;
  const numero = Number(valor);
  return Number.isFinite(numero) && Math.abs(numero) <= limite ? numero : NaN;
};

/** Los puntos en el orden en que se recorrieron, sin los que vienen rotos. */
export function orderSamples(points) {
  return (Array.isArray(points) ? points : [])
    .filter(p => !Number.isNaN(coordenada(p?.latitude, 90)) && !Number.isNaN(coordenada(p?.longitude, 180)))
    .slice()
    .sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0));
}

/**
 * Distancia recorrida por una tanda de puntos del servicio nativo.
 *
 * Cada corte de continuidad (continuityId) es un hueco real: se perdió la
 * señal o pasaron más de dos minutos entre lecturas. La línea recta que cruza
 * ese hueco no es distancia que el conductor manejó, así que no se suma; si se
 * sumara, un túnel o un rato con el GPS perdido le inflaría los km y, con
 * ellos, la gasolina que la app le descuenta.
 */
export function kmFromSamples(points) {
  const ordered = orderSamples(points);
  let km = 0, prev = null;
  for (const point of ordered) {
    const here = {
      lat: coordenada(point.latitude, 90),
      lon: coordenada(point.longitude, 180),
      continuity: String(point.continuityId || ""),
    };
    if (prev && prev.continuity === here.continuity) km += haversineKm(prev, here);
    prev = here;
  }
  return km;
}

/**
 * Cobra los puntos pendientes y devuelve los kilómetros nuevos.
 *
 * El último punto se deja SIN confirmar a propósito: es el ancla que une esta
 * tanda con la siguiente. Si se confirmara, el tramo entre una lectura y otra
 * se perdería y la jornada acabaría midiendo de menos.
 */
export async function drainNativeKm(userId) {
  if (!userId) return 0;
  const result = await nativeTracking.readPending(userId, 1000);
  const ordered = orderSamples(result?.points);
  if (ordered.length < 2) return 0;
  const km = kmFromSamples(ordered);
  const ids = ordered.slice(0, -1).map(p => p.sampleId).filter(Boolean);
  if (ids.length) await nativeTracking.ack(userId, ids);
  return km;
}

/**
 * Deja el rastreo nativo corriendo para la jornada abierta.
 *
 * Hace falta al iniciar el turno y también al volver a abrir la app: Android
 * pudo haber matado el servicio, o la app pudo reiniciarse con una jornada ya
 * abierta. Sin un tramo iniciado el servicio tira todos los puntos.
 */
export async function ensureNativeShift(userId, sessionId) {
  if (!userId || !sessionId) return null;
  const status = await nativeTracking.status().catch(() => null);
  if (!status?.supported) return status;
  if (!status.running) {
    await nativeTracking.startSession({ userId, sessionId });
    await nativeTracking.startSegment("shift");
    return nativeTracking.status().catch(() => null);
  }
  if (!status.segmentId) {
    await nativeTracking.startSegment("shift");
    return nativeTracking.status().catch(() => null);
  }
  return status;
}
