package mx.ruleto.drive.copilot;

/**
 * Evita que el copiloto cambie de opinion con cada cuadro. El OCR de una misma pantalla
 * puede variar entre lecturas (una coma perdida, "km" leido como "m") y mientras la tarjeta
 * entra animada se leen datos a medias. Una lectura solo se acepta cuando sale identica en
 * varios cuadros seguidos durante un tiempo minimo: cualquier lectura distinta reinicia la
 * cuenta. Un cuadro sin oferta (OCR fallido) no reinicia, pero tampoco suma; si la tarjeta
 * deja de verse mas de la ventana, se olvida.
 */
final class ReadingStabilizer {
    static final String NONE = "";

    private final long windowMs;
    private final long minStableMs;
    private final int minHits;
    private String key = NONE;
    private int hits;
    private long firstAt;
    private long lastAt;

    ReadingStabilizer(long windowMs, long minStableMs, int minHits) {
        this.windowMs = windowMs;
        this.minStableMs = minStableMs;
        this.minHits = minHits;
    }

    /**
     * Registra la lectura del cuadro actual (NONE si no hubo oferta) y devuelve true si
     * esa misma lectura ya es estable.
     */
    boolean offer(String reading, long now) {
        String value = reading == null ? NONE : reading;
        if (!NONE.equals(key) && now - lastAt > windowMs) key = NONE;
        if (NONE.equals(value)) return false;
        if (!value.equals(key)) {
            key = value;
            hits = 0;
            firstAt = now;
        }
        hits += 1;
        lastAt = now;
        return hits >= minHits && now - firstAt >= minStableMs;
    }
}
