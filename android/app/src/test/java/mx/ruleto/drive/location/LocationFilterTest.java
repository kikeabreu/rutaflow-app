package mx.ruleto.drive.location;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Random;
import org.junit.Test;

public class LocationFilterTest {
    // Mérida. Un metro de latitud son ~0.000009 grados.
    private static final double LAT = 20.97, LON = -89.62, M = 1 / 111_195d;

    private static LocationFilter.Fix gps(double northMeters, float accuracy, long ms) {
        return new LocationFilter.Fix(true, LAT + northMeters * M, LON, accuracy, 5f, ms, ms);
    }

    private static LocationFilter.Fix network(double northMeters, float accuracy, long ms) {
        return new LocationFilter.Fix(false, LAT + northMeters * M, LON, accuracy, -1f, ms, ms);
    }

    private static float sum(LocationFilter filter, LocationFilter.Fix... fixes) {
        float total = 0;
        for (LocationFilter.Fix fix : fixes) {
            LocationFilter.Decision d = filter.evaluate(fix, fix.timeMs);
            if (d.accepted) total += d.distanceMeters;
        }
        return total;
    }

    private static float parked(double spreadMeters, float accuracy, float speed) {
        LocationFilter filter = new LocationFilter();
        Random random = new Random(7);
        float total = 0;
        for (long t = 0; t <= 20 * 60_000L; t += 3_000L) {
            double north = (random.nextDouble() - 0.5) * spreadMeters, east = (random.nextDouble() - 0.5) * spreadMeters;
            LocationFilter.Fix fix = new LocationFilter.Fix(true, LAT + north * M, LON + east * M, accuracy, speed, 1_000_000L + t, 1_000_000L + t);
            LocationFilter.Decision d = filter.evaluate(fix, fix.timeMs);
            if (d.accepted) total += d.distanceMeters;
        }
        return total;
    }

    // Antes: este ruido sumaba ~4 km sin pasajero en veinte minutos de espera.
    @Test
    public void parkedTwentyMinutesAddsNothing() {
        assertEquals(0f, parked(30, 15f, 0.3f), 0.01f);
    }

    @Test
    public void parkedWithoutSpeedRelaysOnTheAccuracyCircle() {
        assertEquals(0f, parked(20, 15f, -1f), 0.01f);
    }

    @Test
    public void slowTrafficStillAccumulatesAgainstTheAnchor() {
        LocationFilter filter = new LocationFilter();
        LocationFilter.Fix[] fixes = new LocationFilter.Fix[41];
        for (int i = 0; i <= 40; i++) fixes[i] = gps(i * 4, 8f, 1_000_000L + i * 3_000L); // 4 m cada 3 s
        float total = sum(filter, fixes);
        assertTrue("midió " + total, total >= 140f && total <= 160f);
    }

    @Test
    public void networkFixesAreIgnoredWhileGpsIsFresh() {
        LocationFilter filter = new LocationFilter();
        float total = sum(filter,
            gps(0, 8f, 1_000_000L), network(45, 40f, 1_002_000L), gps(0, 8f, 1_003_000L),
            network(-45, 40f, 1_005_000L), gps(0, 8f, 1_006_000L));
        assertEquals(0f, total, 0.01f);
    }

    @Test
    public void networkFixesCountWhenGpsIsLost() {
        LocationFilter filter = new LocationFilter();
        float total = sum(filter, gps(0, 8f, 1_000_000L), network(500, 40f, 1_030_000L));
        assertEquals(500f, total, 2f);
    }

    @Test
    public void longSilenceStartsANewContinuity() {
        LocationFilter filter = new LocationFilter();
        filter.evaluate(gps(0, 8f, 1_000_000L), 1_000_000L);
        LocationFilter.Decision d = filter.evaluate(gps(2_000, 8f, 1_200_000L), 1_200_000L);
        assertTrue(d.accepted);
        assertTrue(d.startsContinuity);
        assertEquals(0f, d.distanceMeters, 0.01f);
    }

    @Test
    public void parkedLongerThanTheGapDoesNotBreakContinuity() {
        LocationFilter filter = new LocationFilter();
        filter.evaluate(gps(0, 8f, 1_000_000L), 1_000_000L);
        for (long t = 3_000L; t <= 300_000L; t += 3_000L) filter.evaluate(gps(2, 8f, 1_000_000L + t), 1_000_000L + t);
        LocationFilter.Decision d = filter.evaluate(gps(50, 8f, 1_303_000L), 1_303_000L);
        assertTrue(d.accepted);
        assertFalse(d.startsContinuity);
        assertEquals(50f, d.distanceMeters, 1f);
    }

    @Test
    public void rejectsImpossibleJumps() {
        LocationFilter filter = new LocationFilter();
        filter.evaluate(gps(0, 8f, 1_000_000L), 1_000_000L);
        assertFalse(filter.evaluate(gps(5_000, 8f, 1_003_000L), 1_003_000L).accepted);
    }
}
