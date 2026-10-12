package mx.ruleto.drive.copilot;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ReadingStabilizerTest {
    private ReadingStabilizer stabilizer() {
        return new ReadingStabilizer(2_600, 1_200, 2);
    }

    @Test
    public void waitsAboutASecondBeforeAcceptingAReading() {
        ReadingStabilizer gate = stabilizer();
        assertFalse(gate.offer("viaje-a", 0));
        assertFalse(gate.offer("viaje-a", 650));
        assertTrue(gate.offer("viaje-a", 1_300));
        assertTrue(gate.offer("viaje-a", 1_950));
    }

    @Test
    public void doesNotFlipBetweenAlternatingReadings() {
        ReadingStabilizer gate = stabilizer();
        boolean anyStable = false;
        for (int frame = 0; frame < 10; frame++) {
            anyStable |= gate.offer(frame % 2 == 0 ? "bueno" : "malo", frame * 650L);
        }
        assertFalse(anyStable);
    }

    @Test
    public void toleratesASingleMisreadFrame() {
        ReadingStabilizer gate = stabilizer();
        gate.offer("viaje-a", 0);
        gate.offer("viaje-a", 650);
        gate.offer("ruido", 1_300);
        assertFalse(gate.offer("viaje-a", 1_950));
        assertTrue(gate.offer("viaje-a", 2_600));
    }

    @Test
    public void screensWithoutOfferAreNeverStable() {
        ReadingStabilizer gate = stabilizer();
        assertFalse(gate.offer(ReadingStabilizer.NONE, 0));
        assertFalse(gate.offer(ReadingStabilizer.NONE, 2_000));
    }
}
