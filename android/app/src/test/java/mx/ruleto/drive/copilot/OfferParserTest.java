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
    public void deductsConfiguredRentAndInsuranceFromTheOffer() {
        Map<String, Double> commissions = new HashMap<>();
        commissions.put("didi", 12.0);
        CopilotConfig withFixedCosts = new CopilotConfig(
            24.0, 12.0, 200.0, 8.0, false, 0.50, 30.0, commissions, "didi"
        );
        OfferAnalysis offer = OfferParser.parse(
            "DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min",
            withFixedCosts
        );
        assertNotNull(offer);
        assertEquals(103.15, offer.net, 0.01);
    }

    @Test
    public void electricCostMatchesPwaAndAllowsFreeCharging() {
        Map<String, Double> commissions = new HashMap<>();
        commissions.put("didi", 12.0);
        String card = "DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min";
        CopilotConfig electric = new CopilotConfig(24, 12, 200, 8, false,
            0.50, 0, commissions, "didi", 0.49, "electric");
        OfferAnalysis offer = OfferParser.parse(card, electric);
        assertNotNull(offer);
        assertEquals(180 - 21.6 - 15.7 * (0.49 + 0.50), offer.net, 0.01);
        assertEquals(0.49, offer.energyCostPerKm, 0.0001);
        assertEquals("electric", offer.vehicleType);

        CopilotConfig free = new CopilotConfig(24, 12, 200, 8, false,
            0.50, 0, commissions, "didi", 0, "electric");
        OfferAnalysis freeOffer = OfferParser.parse(card, free);
        assertNotNull(freeOffer);
        assertEquals(180 - 21.6 - 15.7 * 0.50, freeOffer.net, 0.01);
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

    // Solicitud individual de inDrive (captura real): etiqueta azul junto a A = recogida,
    // verde junto a B = destino, y "~1,6 km" repetido bajo el mapa.
    private List<OfferParser.Block> inDriveSingleOffer(String pickupKm) {
        return Arrays.asList(
            new OfferParser.Block("6:42", 55, 30, 110, 60),
            new OfferParser.Block("Libre", 435, 128, 495, 158),
            new OfferParser.Block("Solicitud de viaje", 180, 212, 560, 258),
            new OfferParser.Block("4 min\n" + pickupKm, 515, 285, 600, 365),
            new OfferParser.Block("15 min\n8,5 km", 40, 375, 135, 455),
            new OfferParser.Block("A", 540, 388, 575, 420),
            new OfferParser.Block("Progreso", 438, 440, 545, 468),
            new OfferParser.Block("B", 70, 480, 105, 510),
            new OfferParser.Block("NUEVA\nYUCALPETEN", 205, 465, 325, 503),
            new OfferParser.Block("Isabella", 25, 770, 98, 790),
            new OfferParser.Block("0.0 (0)\n55 seg.", 22, 805, 105, 852),
            new OfferParser.Block("~1,6 km", 125, 685, 235, 715),
            new OfferParser.Block("MXN62.40", 125, 730, 365, 780),
            new OfferParser.Block("A", 125, 805, 160, 838),
            new OfferParser.Block("Ubicación actual", 178, 805, 420, 838),
            new OfferParser.Block("B", 125, 870, 160, 903),
            new OfferParser.Block("Sin título", 178, 870, 305, 903),
            new OfferParser.Block("Viaje", 125, 925, 215, 962),
            new OfferParser.Block("Aceptar por MXN62.40", 160, 1095, 580, 1140),
            new OfferParser.Block("Ofrece tu tarifa", 248, 1215, 490, 1250),
            new OfferParser.Block("MXN69", 80, 1325, 200, 1362),
            new OfferParser.Block("MXN75", 310, 1325, 428, 1362),
            new OfferParser.Block("MXN82", 540, 1325, 660, 1362),
            new OfferParser.Block("Omitir", 315, 1465, 425, 1500)
        );
    }

    @Test
    public void readsInDriveSingleRequestWithCurrencyBeforeTheAmount() {
        List<OfferParser.DetectedOffer> offers = OfferParser.parseBlocks(inDriveSingleOffer("1,6 km"), config("didi"));

        assertEquals(1, offers.size());
        OfferAnalysis offer = offers.get(0).offer;
        assertEquals("indrive", offer.platform);
        assertEquals(62.40, offer.fare, 0.01);
        assertEquals(1.6, offer.pickupKm, 0.01);
        assertEquals(4, offer.pickupMin, 0.01);
        assertEquals(8.5, offer.tripKm, 0.01);
        assertEquals(15, offer.tripMin, 0.01);
        assertEquals(1.0, offer.confidence, 0.001);
    }

    @Test
    public void recoversInDriveDecimalCommaLostByOcr() {
        // "1,6 km" leido como "16 km": 16 km en 4 min seria 240 km/h, imposible.
        List<OfferParser.DetectedOffer> offers = OfferParser.parseBlocks(inDriveSingleOffer("16 km"), config("indrive"));

        assertEquals(1, offers.size());
        assertEquals(1.6, offers.get(0).offer.pickupKm, 0.01);
        assertEquals(8.5, offers.get(0).offer.tripKm, 0.01);
    }

    @Test
    public void usesABMarkersWhenInDriveCardDistanceIsMissing() {
        // Destino arriba y recogida abajo: sin "~X km", se decide por cercania a A y B.
        List<OfferParser.Block> blocks = Arrays.asList(
            new OfferParser.Block("22 min\n11,2 km", 480, 280, 600, 360),
            new OfferParser.Block("B", 520, 370, 555, 400),
            new OfferParser.Block("3 min\n900 m", 60, 520, 160, 600),
            new OfferParser.Block("A", 90, 610, 125, 640),
            new OfferParser.Block("MXN120", 125, 730, 365, 780),
            new OfferParser.Block("Aceptar por MXN120", 160, 1095, 580, 1140)
        );

        OfferAnalysis offer = OfferParser.parseBlocks(blocks, config("indrive")).get(0).offer;
        assertEquals(0.9, offer.pickupKm, 0.001);
        assertEquals(3, offer.pickupMin, 0.01);
        assertEquals(11.2, offer.tripKm, 0.01);
        assertEquals(22, offer.tripMin, 0.01);
    }

    @Test
    public void joinsInDriveMinutesAndKilometersSplitIntoSeparateBlocks() {
        List<OfferParser.Block> blocks = Arrays.asList(
            new OfferParser.Block("4 min", 515, 285, 600, 320),
            new OfferParser.Block("1,6 km", 515, 328, 600, 365),
            new OfferParser.Block("15 min", 40, 375, 135, 410),
            new OfferParser.Block("8,5 km", 40, 418, 135, 455),
            new OfferParser.Block("~1,6 km", 125, 685, 235, 715),
            new OfferParser.Block("MXN62.40", 125, 730, 365, 780),
            new OfferParser.Block("Aceptar por MXN62.40", 160, 1095, 580, 1140)
        );

        OfferAnalysis offer = OfferParser.parseBlocks(blocks, config("indrive")).get(0).offer;
        assertEquals(1.6, offer.pickupKm, 0.01);
        assertEquals(15, offer.tripMin, 0.01);
    }

    @Test
    public void doesNotGuessFromTheInDriveRequestList() {
        // La lista solo trae la distancia a la recogida; "2 min." es la antiguedad de la
        // solicitud. No debe salir un veredicto inventado.
        List<OfferParser.Block> blocks = Arrays.asList(
            new OfferParser.Block("Libre", 435, 128, 495, 158),
            new OfferParser.Block("Resuelve estos problemas para\nevitar perder las mejores solicitudes", 100, 228, 630, 300),
            new OfferParser.Block("gisly", 40, 448, 85, 470),
            new OfferParser.Block("4.69\n(140)\n2 min.", 30, 482, 95, 556),
            new OfferParser.Block("~1,3 km", 125, 355, 235, 388),
            new OfferParser.Block("MXN75", 125, 405, 290, 450),
            new OfferParser.Block("C. 39 321 (Feliciano Canul Reyes)", 125, 470, 615, 505),
            new OfferParser.Block("Viaje", 125, 772, 215, 810),
            new OfferParser.Block("Georgina", 20, 942, 105, 965),
            new OfferParser.Block("5.0 (0)\n8 min.", 20, 975, 105, 1025),
            new OfferParser.Block("~5,4 km", 125, 850, 240, 882),
            new OfferParser.Block("MXN41", 125, 900, 282, 945),
            new OfferParser.Block("C. 29 408 (Miguel Hidalgo Chicxulub)", 125, 965, 680, 1000),
            new OfferParser.Block("PROGRESO CENTRO (Calle 35, Centro,\nProgreso, Yuc.)", 125, 1010, 690, 1085),
            new OfferParser.Block("Viaje", 125, 1108, 215, 1145),
            new OfferParser.Block("Solicitudes de viaje", 15, 1525, 230, 1555),
            new OfferParser.Block("Demanda", 315, 1525, 420, 1555)
        );

        assertTrue(OfferParser.parseBlocks(blocks, config("indrive")).isEmpty());
        assertTrue(OfferParser.parseBlocks(blocks, config("didi")).isEmpty());
    }

    @Test
    public void distinguishesMetersFromKilometers() {
        assertEquals(0.85, OfferParser.distanceValues("850 m").get(0), 0.001);
        assertEquals(1.6, OfferParser.distanceValues("1,6 m").get(0), 0.001);
        assertEquals(1.6, OfferParser.distanceValues("1,6 krn").get(0), 0.001);
        assertEquals(12.0, OfferParser.distanceValues("12 km").get(0), 0.001);
        assertTrue(OfferParser.distanceValues("15 min").isEmpty());
    }

    @Test
    public void readsTripDurationsGivenInHours() {
        OfferAnalysis offer = OfferParser.parse(
            "DiDi\nMX$420.00\nA recoger 2.0 km · 6 min\nViaje 48 km · 1 h 5 min",
            config("didi")
        );
        assertNotNull(offer);
        assertEquals(65, offer.tripMin, 0.01);
    }

    @Test
    public void sameTripIgnoresSmallOcrDifferences() {
        OfferAnalysis a = OfferParser.parse("DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min", config("didi"));
        OfferAnalysis b = OfferParser.parse("DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.8 km · 25 min", config("didi"));
        OfferAnalysis other = OfferParser.parse("DiDi\nMX$95.00\nA recoger 1.0 km · 3 min\nViaje 6 km · 12 min", config("didi"));
        assertTrue(a.sameTripAs(b));
        assertTrue(!a.sameTripAs(other));
    }

    // Tarjeta de Uber sin importe en el boton: la tarifa no sale de "Aceptar por".
    private List<OfferParser.Block> uberCard(OfferParser.Block... extraAbove) {
        List<OfferParser.Block> blocks = new java.util.ArrayList<>(Arrays.asList(extraAbove));
        blocks.add(new OfferParser.Block("UberX", 40, 1200, 300, 1240));
        blocks.add(new OfferParser.Block("MX$85.00", 40, 1250, 400, 1310));
        blocks.add(new OfferParser.Block("4 min (1.2 km) de distancia", 40, 1330, 700, 1370));
        blocks.add(new OfferParser.Block("Viaje de 15 min (8.0 km)", 40, 1380, 700, 1420));
        blocks.add(new OfferParser.Block("Aceptar", 40, 1500, 700, 1580));
        return blocks;
    }

    private static void assertUberCard(List<OfferParser.DetectedOffer> offers) {
        assertEquals(1, offers.size());
        OfferAnalysis offer = offers.get(0).offer;
        assertEquals(85.0, offer.fare, 0.01);
        assertEquals(1.2, offer.pickupKm, 0.01);
        assertEquals(4, offer.pickupMin, 0.01);
        assertEquals(8.0, offer.tripKm, 0.01);
        assertEquals(15, offer.tripMin, 0.01);
    }

    @Test
    public void readsAnUberCardWithoutAmountOnTheButton() {
        assertUberCard(OfferParser.parseBlocks(uberCard(), config("uber")));
    }

    // Lo que causaba "buen viaje" y segundos despues otro veredicto: la notificacion del
    // anuncio (separada por ML Kit en titulo y cuerpo) y la etiqueta sobre la tarjeta
    // aparecen en la captura siguiente. Sus netos y minutos no deben mezclarse.
    @Test
    public void ignoresItsOwnNotificationBodyAndCardLabel() {
        List<OfferParser.Block> blocks = uberCard(
            new OfferParser.Block("BUEN VIAJE · $85 · $350/h", 30, 20, 700, 60),
            new OfferParser.Block("$60 netos · 9.2 km · 19 min", 30, 70, 700, 100),
            new OfferParser.Block("Ofrecen $85 · UBER\n$60 netos · 9.2 km · 19 min\nDejaría $60 netos en 19 minutos.", 30, 110, 700, 220),
            new OfferParser.Block("$85 · $350/h", 40, 1150, 300, 1190)
        );
        assertUberCard(OfferParser.parseBlocks(blocks, config("uber")));
    }

    @Test
    public void takesTheFareNextToTheTripNotTheDailyEarnings() {
        List<OfferParser.Block> blocks = uberCard(
            new OfferParser.Block("MX$840.00", 280, 150, 460, 200),
            new OfferParser.Block("Ganancias de hoy MX$1,240.50", 200, 220, 600, 260)
        );
        assertUberCard(OfferParser.parseBlocks(blocks, config("uber")));
    }

    @Test
    public void ownLabelFilterKeepsRealCardsThatShowPricePerKm() {
        assertTrue(OfferParser.isOwnText("$85 · $350/h"));
        assertTrue(OfferParser.isOwnText("$85 · $7.6/km"));
        assertTrue(!OfferParser.isOwnText("MX$85.00 · MX$5.20/km"));
        assertTrue(!OfferParser.isOwnText("MX$85.00"));
    }

    // "24 min" leido como "2 min": antes la distancia se "corregia" a 1.25 km y salian
    // miles de pesos por hora. Una lectura imposible no se anuncia.
    @Test
    public void rejectsReadingsThatDescribeAnImpossibleTrip() {
        assertNull(OfferParser.parse("DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 2 min", config("didi")));
        assertNull(OfferParser.parse("DiDi\nMX$180.00\nA recoger 3.2 km · 1 min\nViaje 1.5 km · 2 min", config("didi")));
        assertNull(OfferParser.parse("DiDi\nMX$18.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min", config("didi")));
    }

    @Test
    public void stillRecoversALostDecimalComma() {
        OfferAnalysis offer = OfferParser.parse("DiDi\nMX$95.00\nA recoger 16 km · 4 min\nViaje 8.5 km · 15 min", config("didi"));
        assertNotNull(offer);
        assertEquals(1.6, offer.pickupKm, 0.01);
    }

    @Test
    public void voiceSaysTheDataItReadSoTheDriverCanCheckIt() {
        OfferAnalysis offer = OfferParser.parse("DiDi\nMX$180.00\nA recoger 3.2 km · 8 min\nViaje 12.5 km · 24 min", config("didi"));
        assertNotNull(offer);
        String spoken = offer.spokenText(false);
        assertTrue(spoken, spoken.startsWith("Buen viaje, 223 por hora."));
        assertTrue(spoken, spoken.contains("180 pesos, recoges a 3.2 kilómetros, 16 en total, 32 minutos."));
    }
}
