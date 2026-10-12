package mx.ruleto.drive.copilot;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ReadingStabilizerTest {
    private static final long FRAME = 450;

    private ReadingStabilizer stabilizer() {
        return new ReadingStabilizer(1_500, 800, 3);
    }

    @Test
    public void acceptsAfterThreeIdenticalFramesInUnderASecond() {
        ReadingStabilizer gate = stabilizer();
        assertFalse(gate.offer("viaje-a", 0));
        assertFalse(gate.offer("viaje-a", FRAME));
        assertTrue(gate.offer("viaje-a", 2 * FRAME));
        assertTrue(gate.offer("viaje-a", 3 * FRAME));
    }

    @Test
    public void doesNotFlipBetweenAlternatingReadings() {
        ReadingStabilizer gate = stabilizer();
        boolean anyStable = false;
        for (int frame = 0; frame < 12; frame++) {
            anyStable |= gate.offer(frame % 2 == 0 ? "bueno" : "malo", frame * FRAME);
        }
        assertFalse(anyStable);
    }

    // Una lectura distinta en medio prueba que el OCR todavia no se pone de acuerdo:
    // la cuenta empieza de nuevo en lugar de anunciar con dos de tres.
    @Test
    public void aDifferentReadingRestartsTheCount() {
        ReadingStabilizer gate = stabilizer();
        gate.offer("viaje-a", 0);
        gate.offer("viaje-a", FRAME);
        gate.offer("ruido", 2 * FRAME);
        assertFalse(gate.offer("viaje-a", 3 * FRAME));
        assertFalse(gate.offer("viaje-a", 4 * FRAME));
        assertTrue(gate.offer("viaje-a", 5 * FRAME));
    }

    @Test
    public void aFrameWithoutOfferNeitherCountsNorResets() {
        ReadingStabilizer gate = stabilizer();
        gate.offer("viaje-a", 0);
        gate.offer("viaje-a", FRAME);
        assertFalse(gate.offer(ReadingStabilizer.NONE, 2 * FRAME));
        assertTrue(gate.offer("viaje-a", 3 * FRAME));
    }

    @Test
    public void forgetsAReadingThatStoppedShowing() {
        ReadingStabilizer gate = stabilizer();
        gate.offer("viaje-a", 0);
        gate.offer("viaje-a", FRAME);
        assertFalse(gate.offer("viaje-a", 5_000));
    }

    @Test
    public void screensWithoutOfferAreNeverStable() {
        ReadingStabilizer gate = stabilizer();
        assertFalse(gate.offer(ReadingStabilizer.NONE, 0));
        assertFalse(gate.offer(ReadingStabilizer.NONE, 2_000));
    }
}
