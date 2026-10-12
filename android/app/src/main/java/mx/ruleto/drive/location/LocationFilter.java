package mx.ruleto.drive.location;

import android.location.Location;
import android.location.LocationManager;

/**
 * Decide qué lecturas de ubicación cuentan como distancia manejada.
 *
 * Estacionado, el punto del GPS "baila" dentro de su margen de error. Si cada
 * baile se sumara, una espera de veinte minutos le inventaría kilómetros sin
 * pasajero al conductor. Por eso la distancia se mide desde un ancla (el
 * último punto aceptado) y solo se avanza cuando el salto supera el margen de
 * error de las dos lecturas: el ruido nunca sale del círculo, el movimiento
 * real sí, y lo recorrido despacio se acumula contra el ancla sin perderse.
 *
 * El ruido de un GPS parado a veces se sale de su propio margen de error, así
 * que además se usa la velocidad que reporta el GPS (efecto Doppler, no
 * depende de la posición): si dice que el auto está quieto, no se avanza.
 */
final class LocationFilter {
    static final float MAX_ACCURACY_METERS = 60f;
    static final long MAX_AGE_MS = 15_000L;
    static final long GAP_MS = 120_000L;
    /** Con señal de red sola se aceptan sus lecturas; con GPS reciente, no. */
    static final long GPS_PREFERRED_MS = 15_000L;
    static final float MIN_MOVE_METERS = 10f;
    /** Por debajo de ~4 km/h el GPS está parado o arrastrándose en un semáforo. */
    static final float STOPPED_SPEED_METERS_PER_SECOND = 1.1f;
    private static final float MAX_SPEED_METERS_PER_SECOND = 55f;

    static final class Decision {
        final boolean accepted;
        final boolean startsContinuity;
        final float distanceMeters;
        Decision(boolean accepted, boolean startsContinuity, float distanceMeters) {
            this.accepted = accepted;
            this.startsContinuity = startsContinuity;
            this.distanceMeters = distanceMeters;
        }
    }

    /** Una lectura reducida a lo que el filtro necesita. */
    static final class Fix {
        final boolean gps;
        final double lat, lon;
        final float accuracy;
        final float speed;      // m/s; negativa si la lectura no trae velocidad
        final long timeMs;      // hora de reloj de la lectura
        final long monotonicMs; // reloj que no salta con cambios de hora
        Fix(boolean gps, double lat, double lon, float accuracy, float speed, long timeMs, long monotonicMs) {
            this.gps = gps; this.lat = lat; this.lon = lon; this.accuracy = accuracy; this.speed = speed;
            this.timeMs = timeMs; this.monotonicMs = monotonicMs;
        }
        static Fix of(Location value) {
            long mono = value.getElapsedRealtimeNanos() > 0 ? value.getElapsedRealtimeNanos() / 1_000_000L : value.getTime();
            return new Fix(LocationManager.GPS_PROVIDER.equals(value.getProvider()), value.getLatitude(), value.getLongitude(),
                value.hasAccuracy() ? value.getAccuracy() : 0f, value.hasSpeed() ? value.getSpeed() : -1f, value.getTime(), mono);
        }
    }

    private Fix anchor;   // de aquí se mide la distancia
    private Fix lastSeen; // última lectura válida, aunque no se haya movido: marca los huecos
    private Fix lastGps;

    Decision evaluate(Location value, long nowMs) {
        return value == null ? reject() : evaluate(Fix.of(value), nowMs);
    }

    Decision evaluate(Fix value, long nowMs) {
        if (value.accuracy <= 0 || value.accuracy > MAX_ACCURACY_METERS) return reject();
        if (value.timeMs <= 0 || nowMs - value.timeMs > MAX_AGE_MS || value.timeMs - nowMs > 5_000L) return reject();
        // Las lecturas de red (wifi/antenas) caen a decenas de metros de las del
        // GPS; intercaladas dibujan un zigzag que suma kilómetros inexistentes.
        if (!value.gps && lastGps != null && value.monotonicMs - lastGps.monotonicMs < GPS_PREFERRED_MS) return reject();
        if (value.gps) lastGps = value;

        if (anchor == null) { anchor = value; lastSeen = value; return new Decision(true, true, 0f); }
        long sinceSeen = value.monotonicMs - lastSeen.monotonicMs;
        if (sinceSeen <= 0) return reject();
        if (sinceSeen > GAP_MS) { anchor = value; lastSeen = value; return new Decision(true, true, 0f); }

        float distance = (float) distanceMeters(anchor, value);
        float allowed = Math.max(250f, MAX_SPEED_METERS_PER_SECOND * (value.monotonicMs - anchor.monotonicMs) / 1000f);
        if (distance > allowed) return reject();
        lastSeen = value;
        if (value.gps && value.speed >= 0 && value.speed < STOPPED_SPEED_METERS_PER_SECOND) return reject();
        if (distance < Math.max(MIN_MOVE_METERS, anchor.accuracy + value.accuracy)) return reject();
        anchor = value;
        return new Decision(true, false, distance);
    }

    void reset() { anchor = null; lastSeen = null; lastGps = null; }

    private static Decision reject() { return new Decision(false, false, 0f); }

    static double distanceMeters(Fix a, Fix b) {
        double rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
        double h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin(dLon / 2), 2);
        return 6_371_000d * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }
}
