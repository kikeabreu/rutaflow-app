package mx.ruleto.drive.copilot;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class OfferParserTest {
    private CopilotConfig config(String hint) {
        Map<String, Double> commissions = new HashMap<>();
        commissions.put("didi", 12.0);
        commissions.put("uber", 25.0);
        commissions.put("indrive", 10.0);
        return new CopilotConfig(24.0, 12.0, 200.0, 0.50, commissions, hint);
    }

    private CopilotConfig kmConfig(String hint, double targetKmRate) {
        Map<String, Double> commissions = new HashMap<>();
        commissions.put("didi", 12.0);
        commissions.put("uber", 25.0);
        commissions.put("indrive", 10.0);
        return new CopilotConfig(24.0, 12.0, 200.0, targetKmRate, true, 0.50, commissions, hint);
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

    @Test
    public void usesPerKmGoalWhenConfiguredInsteadOfHourly() {
        // net = 119.15 sobre 15.7 km => ~7.59 $/km. Con meta de 200/hr esto seria "bad"
        // (hourly = 119.15/(32/60) ~= 223, que si alcanzaria, asi que se prueba con una
        // meta por km que el viaje SI alcanza para confirmar que se usa esa meta y no la hora).
        OfferAnalysis offer = OfferParser.parse(
            "DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min",
            kmConfig("didi", 5.0)
        );
        assertNotNull(offer);
        assertEquals("good", offer.verdict);

        OfferAnalysis belowTarget = OfferParser.parse(
            "DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min",
            kmConfig("didi", 15.0)
        );
        assertNotNull(belowTarget);
        assertEquals("bad", belowTarget.verdict);
    }

    @Test
    public void detectsEachCardWhenSeveralOffersAreListedTogether() {
        List<OfferParser.Block> blocks = Arrays.asList(
            new OfferParser.Block("Express Nuevo", 0, 0, 300, 30),
            new OfferParser.Block("$57.00", 0, 40, 300, 70),
            new OfferParser.Block("(10 min 3.7 km) Macroplaza, Sin Nombre de Col 5, Merida", 0, 80, 300, 110),
            new OfferParser.Block("(9 min 4.1 km) Calle 29 3883, Francisco Villa, Kanasin", 0, 120, 300, 150),
            new OfferParser.Block("Tomar viaje", 0, 160, 300, 200),
            new OfferParser.Block("Pon Tu Precio", 0, 240, 300, 270),
            new OfferParser.Block("$108.00", 0, 280, 300, 310),
            new OfferParser.Block("(8 min 3.6 km) Calle 26 502a, Maya, Merida", 0, 320, 300, 350),
            new OfferParser.Block("(31 min 13 km) Calle 11 607, Residencial Pensiones V, Merida", 0, 360, 300, 390),
            new OfferParser.Block("Aceptar $108.00", 0, 400, 300, 440)
        );

        List<OfferParser.DetectedOffer> offers = OfferParser.parseBlocks(blocks, config("didi"));

        assertEquals(2, offers.size());
        assertEquals(57.0, offers.get(0).offer.fare, 0.01);
        assertEquals(0, offers.get(0).top);
        assertEquals(200, offers.get(0).bottom);
        assertEquals(108.0, offers.get(1).offer.fare, 0.01);
        assertEquals(240, offers.get(1).top);
        assertEquals(440, offers.get(1).bottom);
    }

    @Test
    public void treatsWholeScreenAsOneOfferWhenNoCardHasAnAcceptButton() {
        List<OfferParser.Block> blocks = Arrays.asList(
            new OfferParser.Block("DiDi", 0, 0, 300, 30),
            new OfferParser.Block("MX$180.00", 0, 40, 300, 70),
            new OfferParser.Block("A recoger 3.2 km · 8 min", 0, 80, 300, 110),
            new OfferParser.Block("Viaje 12.5 km · 24 min", 0, 120, 300, 150)
        );

        List<OfferParser.DetectedOffer> offers = OfferParser.parseBlocks(blocks, config("didi"));

        assertEquals(1, offers.size());
        assertEquals(180.0, offers.get(0).offer.fare, 0.01);
    }

    @Test
    public void ignoresItsOwnSpokenNotificationLeftOverInTheScreenshot() {
        List<OfferParser.Block> blocks = Arrays.asList(
            // Notificacion heads-up de Ruleto del viaje anterior, todavia visible en pantalla.
            new OfferParser.Block("No conviene · $97 · $103/h · ahora", 0, 0, 300, 30),
            new OfferParser.Block("Express Nuevo", 0, 40, 300, 70),
            new OfferParser.Block("$57.00", 0, 80, 300, 110),
            new OfferParser.Block("(10 min 3.7 km) Macroplaza", 0, 120, 300, 150),
            new OfferParser.Block("(9 min 4.1 km) Calle 29", 0, 160, 300, 190),
            new OfferParser.Block("Tomar viaje", 0, 200, 300, 240)
        );

        List<OfferParser.DetectedOffer> offers = OfferParser.parseBlocks(blocks, config("didi"));

        assertEquals(1, offers.size());
        assertEquals(57.0, offers.get(0).offer.fare, 0.01);
    }
}
