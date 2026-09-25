package mx.ruleto.drive.location;

import android.location.Location;

final class LocationFilter {
    static final float MAX_ACCURACY_METERS = 60f;
    static final long MAX_AGE_MS = 15_000L;
    static final long GAP_MS = 120_000L;
    private static final float MIN_DISTANCE_METERS = 3f;
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

    private Location previous;

    Decision evaluate(Location value, long nowMs) {
        if (value == null || !value.hasAccuracy() || value.getAccuracy() <= 0 || value.getAccuracy() > MAX_ACCURACY_METERS) return new Decision(false, false, 0f);
        if (value.getTime() <= 0 || nowMs - value.getTime() > MAX_AGE_MS || value.getTime() - nowMs > 5_000L) return new Decision(false, false, 0f);
        if (previous == null) { previous = new Location(value); return new Decision(true, true, 0f); }
        long elapsedMs = value.getElapsedRealtimeNanos() > 0 && previous.getElapsedRealtimeNanos() > 0
            ? (value.getElapsedRealtimeNanos() - previous.getElapsedRealtimeNanos()) / 1_000_000L
            : value.getTime() - previous.getTime();
        if (elapsedMs <= 0) return new Decision(false, false, 0f);
        if (elapsedMs > GAP_MS) { previous = new Location(value); return new Decision(true, true, 0f); }
        float distance = previous.distanceTo(value);
        if (distance < MIN_DISTANCE_METERS) return new Decision(false, false, 0f);
        float allowed = Math.max(250f, MAX_SPEED_METERS_PER_SECOND * elapsedMs / 1000f);
        if (distance > allowed) return new Decision(false, false, 0f);
        previous = new Location(value);
        return new Decision(true, false, distance);
    }

    void reset() { previous = null; }
}
