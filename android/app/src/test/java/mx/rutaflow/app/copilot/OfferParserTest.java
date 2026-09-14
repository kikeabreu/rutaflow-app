package mx.rutaflow.app.copilot;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

public class OfferParserTest {
    private CopilotConfig config(String hint) {
        Map<String, Double> commissions = new HashMap<>();
        commissions.put("didi", 12.0);
        commissions.put("uber", 25.0);
        commissions.put("indrive", 10.0);
        return new CopilotConfig(24.0, 12.0, 200.0, 0.50, commissions, hint);
    }

    @Test
    public void parsesDidiPickupAndTrip() {
        OfferAnalysis offer = OfferParser.parse(
            "DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min",
            config("didi")
        );
        assertNotNull(offer);
        assertEquals("didi", offer.platform);
        assertEquals(180.0, offer.fare, 0.01);
        assertEquals(3.2, offer.pickupKm, 0.01);
        assertEquals(12.5, offer.tripKm, 0.01);
        assertEquals(119.15, offer.net, 0.01);
        assertTrue(offer.confidence >= 0.9);
    }

    @Test
    public void usesSelectedPlatformWhenCardDoesNotShowItsName() {
        OfferAnalysis offer = OfferParser.parse(
            "$95.50\n2.0 km 5 min\nDestino 7.8 km 19 min",
            config("uber")
        );
        assertNotNull(offer);
        assertEquals("uber", offer.platform);
        assertEquals(5.0, offer.pickupMin, 0.01);
    }

    @Test
    public void ignoresScreensWithoutACompleteOffer() {
        assertNull(OfferParser.parse("Ganancias de hoy $840.00", config("didi")));
    }
}
