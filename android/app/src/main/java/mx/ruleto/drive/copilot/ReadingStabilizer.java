package mx.ruleto.drive.copilot;

import java.util.ArrayDeque;
import java.util.Iterator;

/**
 * Evita que el copiloto cambie de opinion con cada cuadro. El OCR de una misma pantalla
 * puede variar entre lecturas (una coma perdida, "km" leido como "m"), y si se anunciara
 * cada una el conductor oiria "buen viaje" y "no conviene" alternados. Una lectura solo
 * se acepta cuando se repite en cuadros seguidos durante un tiempo minimo y ocupa al menos
 * dos tercios de la ventana reciente.
 */
final class ReadingStabilizer {
    static final String NONE = "";

    private static final class Reading {
        final String key;
        final long at;

        Reading(String key, long at) {
            this.key = key;
            this.at = at;
        }
    }

    private final long windowMs;
    private final long minStableMs;
    private final int minHits;
    private final ArrayDeque<Reading> readings = new ArrayDeque<>();

    ReadingStabilizer(long windowMs, long minStableMs, int minHits) {
        this.windowMs = windowMs;
        this.minStableMs = minStableMs;
        this.minHits = minHits;
    }

    /**
     * Registra la lectura del cuadro actual (NONE si no hubo oferta) y devuelve true si
     * esa misma lectura ya es estable.
     */
    boolean offer(String key, long now) {
        String value = key == null ? NONE : key;
        readings.addLast(new Reading(value, now));
        while (!readings.isEmpty() && now - readings.peekFirst().at > windowMs) readings.removeFirst();
        if (NONE.equals(value)) return false;

        // El cuadro anterior debe confirmar este: dos lecturas alternadas nunca son estables.
        Reading[] all = readings.toArray(new Reading[0]);
        if (all.length < 2 || !all[all.length - 2].key.equals(value)) return false;

        int hits = 0;
        long firstSeen = now;
        Iterator<Reading> iterator = readings.iterator();
        while (iterator.hasNext()) {
            Reading reading = iterator.next();
            if (!reading.key.equals(value)) continue;
            hits += 1;
            firstSeen = Math.min(firstSeen, reading.at);
        }
        return hits >= minHits
            && now - firstSeen >= minStableMs
            && hits * 3 >= readings.size() * 2;
    }
}
