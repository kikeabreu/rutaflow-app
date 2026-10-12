package mx.ruleto.drive.copilot;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class OfferParser {
    // inDrive escribe la moneda antes del numero ("MXN62.40"); DiDi/Uber usan "MX$" o "$".
    private static final String CURRENCY = "(?:mx\\s*\\$|mxn|\\$)";
    private static final String AMOUNT = "(\\d{1,4}(?:[.,]\\d{1,2})?)";
    private static final Pattern MONEY = Pattern.compile(CURRENCY + "\\s*" + AMOUNT + "|" + AMOUNT + "\\s*(?:mxn|pesos?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern ACCEPT_MONEY = Pattern.compile("aceptar(?:\\s+por)?\\s*" + CURRENCY + "\\s*" + AMOUNT, Pattern.CASE_INSENSITIVE);
    private static final Pattern KM_OR_M = Pattern.compile("(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(k(?:m|rn)s?|m)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern MIN = Pattern.compile("(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*min(?:uto)?s?", Pattern.CASE_INSENSITIVE);
    // "1 h 10 min" o "1 hr" se convierten a minutos antes de leer.
    private static final Pattern HOURS = Pattern.compile("(\\d{1,2})\\s*(?:h|hr|hrs|hora|horas)\\b\\.?\\s*(?:(\\d{1,2})\\s*min(?:uto)?s?\\.?)?", Pattern.CASE_INSENSITIVE);
    // Distancia "~1,6 km" que inDrive muestra junto al precio: es la distancia a la recogida.
    private static final Pattern APPROX_DISTANCE = Pattern.compile("^\\s*[~\u223c\u2248\\-]\\s*\\d");
    private static final Pattern DISTANCE_ONLY = Pattern.compile("^\\s*[~\u223c\u2248\\-]?\\s*\\d{1,4}(?:[.,]\\d{1,3})?\\s*(?:k(?:m|rn)s?|m)\\s*$");
    // Textos fijos de la tarjeta de inDrive, que no siempre escribe el nombre de la app.
    private static final Pattern INDRIVE_MARKERS = Pattern.compile("indrive|in drive|aceptar por|ofrece tu tarifa|solicitudes? de viaje");
    private static final Pattern PICKUP = Pattern.compile("recog|recolec|pasajer|llegar|hacia el punto|a recoger|de distancia", Pattern.CASE_INSENSITIVE);
    private static final Pattern TRIP = Pattern.compile("viaje|destino|trayecto|duracion|incluye", Pattern.CASE_INSENSITIVE);
    // Marca el final de una tarjeta de oferta en una lista con varias ofertas visibles a la vez.
    private static final Pattern CARD_END = Pattern.compile("tomar\\s+viaje|aceptar(?:\\s+por)?\\s*" + CURRENCY, Pattern.CASE_INSENSITIVE);
    // Lo que el copiloto dibuja en pantalla (notificacion, alerta expandida y la etiqueta
    // "$85 · $350/h" sobre la tarjeta) sale en la captura. ML Kit separa la notificacion en
    // bloques: el titulo trae "buen viaje", pero el cuerpo ("$60 netos · 25 min") no. Si se
    // leyera, sus netos y minutos se mezclarian con la oferta y el copiloto se contradiria
    // segundos despues de anunciar. Se reconoce por frases y formatos que solo usa Ruleto.
    private static final Pattern OWN_TEXT = Pattern.compile(
        "no conviene|buen viaje|viaje aceptable|netos|ofrecen \\$|escuchando ofertas|ruleto"
            + "|la recogida es larga|desgaste consumirian|energia consumiria|la comision de|dejaria \\$",
        Pattern.CASE_INSENSITIVE);
    // La etiqueta sobre la tarjeta es exactamente "$85 · $350/h" (o "$85 · $7.6/km"). Se
    // compara el bloque completo para no descartar una tarjeta real que muestre "$/km".
    private static final Pattern OWN_LABEL = Pattern.compile(
        "^\\$\\s*\\d+\\s*\\W{0,3}\\s*\\$\\s*\\d[\\d.,]*\\s*/\\s*(?:h|km)$");
    // Importes que no son la tarifa: ganancias del dia, saldo, metas.
    private static final Pattern NOT_FARE = Pattern.compile("ganancia|ganaste|saldo|semana|meta|objetivo|promocion|hoy");

    /** Un bloque de texto reconocido con su posicion en pantalla. Sin dependencias de Android/ML Kit para poder probarlo. */
    static final class Block {
        final String text;
        final int left, top, right, bottom;

        Block(String text, int left, int top, int right, int bottom) {
            this.text = text == null ? "" : text;
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }

        boolean hasBounds() {
            return right > left && bottom > top;
        }
    }

    /** Una oferta detectada junto con la region de pantalla que ocupa su tarjeta. */
    static final class DetectedOffer {
        final OfferAnalysis offer;
        final int left, top, right, bottom;

        DetectedOffer(OfferAnalysis offer, int left, int top, int right, int bottom) {
            this.offer = offer;
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }

        boolean hasBounds() {
            return right > left && bottom > top;
        }
    }

    /**
     * Agrupa los bloques de OCR por tarjeta de oferta (una pantalla de lista puede mostrar
     * varios viajes a la vez) y analiza cada una por separado. Si ninguna tarjeta trae un boton
     * de aceptar, se trata toda la pantalla como una sola oferta (pantalla de un solo viaje).
     */
    static List<DetectedOffer> parseBlocks(List<Block> blocks, CopilotConfig config) {
        List<Block> sorted = new ArrayList<>();
        StringBuilder screen = new StringBuilder();
        for (Block block : blocks) {
            if (isOwnText(block.text)) continue;
            sorted.add(block);
            screen.append(normalize(block.text)).append('\n');
        }
        Collections.sort(sorted, (a, b) -> Integer.compare(a.top, b.top));
        // La plataforma se decide con toda la pantalla: en inDrive "Ofrece tu tarifa" queda
        // debajo del boton de aceptar, fuera de la tarjeta que se analiza.
        String screenPlatform = platform(screen.toString());

        List<List<Block>> clusters = new ArrayList<>();
        List<Block> current = new ArrayList<>();
        for (Block block : sorted) {
            current.add(block);
            if (CARD_END.matcher(normalize(block.text)).find()) {
                clusters.add(current);
                current = new ArrayList<>();
            }
        }
        if (!current.isEmpty() && clusters.isEmpty()) {
            // Ninguna tarjeta trajo boton de aceptar: es una pantalla de una sola oferta.
            clusters.add(current);
        }

        List<DetectedOffer> results = new ArrayList<>();
        for (List<Block> cluster : clusters) {
            int left = Integer.MAX_VALUE, top = Integer.MAX_VALUE, right = Integer.MIN_VALUE, bottom = Integer.MIN_VALUE;
            boolean anyBounds = false;
            for (Block block : cluster) {
                if (block.hasBounds()) {
                    left = Math.min(left, block.left);
                    top = Math.min(top, block.top);
                    right = Math.max(right, block.right);
                    bottom = Math.max(bottom, block.bottom);
                    anyBounds = true;
                }
            }
            OfferAnalysis analysis = parseCluster(cluster, config, screenPlatform);
            if (analysis == null || analysis.confidence < 0.60) continue;
            results.add(anyBounds
                ? new DetectedOffer(analysis, left, top, right, bottom)
                : new DetectedOffer(analysis, 0, 0, 0, 0));
        }
        return results;
    }

    static boolean isOwnText(String text) {
        String value = normalize(text == null ? "" : text).trim();
        return OWN_TEXT.matcher(value).find() || OWN_LABEL.matcher(value).matches();
    }

    /** Analiza texto plano: cada linea se trata como un bloque sin posicion. */
    static OfferAnalysis parse(String rawText, CopilotConfig config) {
        if (rawText == null || rawText.trim().isEmpty()) return null;
        List<Block> lines = new ArrayList<>();
        for (String line : rawText.split("\\n")) lines.add(new Block(line, 0, 0, 0, 0));
        return parseCluster(lines, config, "otra");
    }

    private static OfferAnalysis parseCluster(List<Block> cluster, CopilotConfig config, String screenPlatform) {
        StringBuilder joined = new StringBuilder();
        for (Block block : cluster) {
            if (joined.length() > 0) joined.append('\n');
            joined.append(block.text);
        }
        String normalized = normalize(joined.toString());
        if (normalized.trim().isEmpty()) return null;
        String platform = platform(normalized);
        if ("otra".equals(platform)) platform = screenPlatform == null ? "otra" : screenPlatform;
        if ("otra".equals(platform)) platform = config.platformHint;
        double fare = extractFare(cluster);
        if (fare <= 0) return null;
        if ("indrive".equals(platform)) return parseInDrive(cluster, fare, config);

        List<Double> allKm = new ArrayList<>();
        List<Double> allMin = new ArrayList<>();
        double pickupKm = 0, pickupMin = 0, tripKm = 0, tripMin = 0;
        for (String line : normalized.split("\\n")) {
            line = hoursToMinutes(line);
            List<Double> lineKm = distanceValues(line);
            List<Double> lineMin = values(MIN, line);
            allKm.addAll(lineKm);
            allMin.addAll(lineMin);
            if (PICKUP.matcher(line).find()) {
                if (!lineKm.isEmpty() && pickupKm <= 0) pickupKm = lineKm.get(0);
                if (!lineMin.isEmpty() && pickupMin <= 0) pickupMin = lineMin.get(0);
            }
            if (TRIP.matcher(line).find()) {
                if (!lineKm.isEmpty() && tripKm <= 0) tripKm = lineKm.get(0);
                if (!lineMin.isEmpty() && tripMin <= 0) tripMin = lineMin.get(0);
            }
        }

        // For list of offers (or multi-block), prioritize first pair as pickup and second pair as trip
        if (pickupKm <= 0 && !allKm.isEmpty()) pickupKm = allKm.get(0);
        if (pickupMin <= 0 && !allMin.isEmpty()) pickupMin = allMin.get(0);
        if (tripKm <= 0 && allKm.size() >= 2) tripKm = allKm.get(1);
        if (tripMin <= 0 && allMin.size() >= 2) tripMin = allMin.get(1);
        if (pickupKm <= 0 || tripKm <= 0 || pickupMin <= 0 || tripMin <= 0) return null;
        pickupKm = plausibleKm(pickupKm, pickupMin);
        tripKm = plausibleKm(tripKm, tripMin);

        double confidence = 0.50;
        if (!"otra".equals(platform)) confidence += 0.15;
        confidence += 0.35;
        return analyze(platform, fare, pickupKm, pickupMin, tripKm, tripMin, Math.min(1.0, confidence), config);
    }

    /** Par minutos/km de una etiqueta del mapa de inDrive ("4 min / 1,6 km"). */
    private static final class Leg {
        final double km, min;
        final int left, top, right, bottom;

        Leg(double km, double min, int left, int top, int right, int bottom) {
            this.km = km;
            this.min = min;
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }

        double distanceTo(Block marker) {
            double cx = (marker.left + marker.right) / 2.0, cy = (marker.top + marker.bottom) / 2.0;
            double dx = Math.max(0, Math.max(left - cx, cx - right));
            double dy = Math.max(0, Math.max(top - cy, cy - bottom));
            return Math.hypot(dx, dy);
        }
    }

    /**
     * inDrive pone en el mapa dos etiquetas "min / km": la azul junto al punto A (recogida)
     * y la verde junto al punto B (destino). Debajo del mapa repite la distancia a la
     * recogida como "~1,6 km". La lista de solicitudes no trae estas etiquetas, asi que ahi
     * no se emite veredicto: los "2 min." de esa lista son la antiguedad de la solicitud,
     * no el tiempo del viaje.
     */
    private static OfferAnalysis parseInDrive(List<Block> cluster, double fare, CopilotConfig config) {
        List<Block> minOnly = new ArrayList<>();
        List<Block> kmOnly = new ArrayList<>();
        List<Block> markersA = new ArrayList<>();
        List<Block> markersB = new ArrayList<>();
        List<Leg> legs = new ArrayList<>();
        double approxPickupKm = 0;

        for (Block block : cluster) {
            // "~1,6 km" puede venir en el mismo bloque que el precio: se separa por linea.
            StringBuilder rest = new StringBuilder();
            for (String line : hoursToMinutes(normalize(block.text)).split("\\n")) {
                if (APPROX_DISTANCE.matcher(line).find() && DISTANCE_ONLY.matcher(line).matches()) {
                    List<Double> km = distanceValues(line);
                    if (!km.isEmpty() && approxPickupKm <= 0) approxPickupKm = km.get(0);
                    continue;
                }
                if (rest.length() > 0) rest.append('\n');
                rest.append(line.trim());
            }
            String text = rest.toString().trim();
            if (text.isEmpty()) continue;
            if ("a".equals(text)) { markersA.add(block); continue; }
            if ("b".equals(text)) { markersB.add(block); continue; }
            List<Double> km = distanceValues(text);
            List<Double> min = values(MIN, text);
            if (km.size() == 1 && min.size() == 1) {
                legs.add(new Leg(km.get(0), min.get(0), block.left, block.top, block.right, block.bottom));
            } else if (km.size() == 1 && min.isEmpty() && DISTANCE_ONLY.matcher(text).matches()) {
                kmOnly.add(block);
            } else if (min.size() == 1 && km.isEmpty() && text.matches("^\\d{1,3}\\s*min\\w*\\.?$")) {
                minOnly.add(block);
            }
        }

        // ML Kit a veces separa "4 min" y "1,6 km" en dos bloques: se unen si estan uno
        // sobre otro en la misma columna (o seguidos, cuando no hay posiciones).
        List<Block> unpairedKm = new ArrayList<>(kmOnly);
        for (Block minBlock : minOnly) {
            Block match = null;
            for (Block kmBlock : unpairedKm) {
                if (stacked(minBlock, kmBlock, cluster)) { match = kmBlock; break; }
            }
            if (match == null) continue;
            unpairedKm.remove(match);
            double km = distanceValues(normalize(match.text)).get(0);
            double min = values(MIN, hoursToMinutes(normalize(minBlock.text))).get(0);
            legs.add(new Leg(km, min,
                Math.min(minBlock.left, match.left), Math.min(minBlock.top, match.top),
                Math.max(minBlock.right, match.right), Math.max(minBlock.bottom, match.bottom)));
        }
        // Si el OCR no leyo la tilde de "~1,6 km", la distancia suelta que queda es esa.
        if (approxPickupKm <= 0 && unpairedKm.size() == 1) {
            approxPickupKm = distanceValues(normalize(unpairedKm.get(0).text)).get(0);
        }
        if (legs.isEmpty()) return null;

        Leg pickup = null;
        if (approxPickupKm > 0) {
            for (Leg leg : legs) {
                if (sameDistance(leg.km, approxPickupKm)) { pickup = leg; break; }
            }
        }
        if (pickup == null && legs.size() >= 2 && !markersA.isEmpty() && !markersB.isEmpty()) {
            double best = Double.MAX_VALUE;
            for (Leg leg : legs) {
                double score = nearest(leg, markersA) - nearest(leg, markersB);
                if (score < best) { best = score; pickup = leg; }
            }
        }

        double pickupKm, pickupMin, tripKm = 0, tripMin = 0;
        double confidence = 0.75;
        if (pickup != null) {
            pickupKm = plausibleKm(pickup.km, pickup.min);
            pickupMin = pickup.min;
            for (Leg leg : legs) {
                if (leg == pickup) continue;
                tripKm += plausibleKm(leg.km, leg.min);
                tripMin += leg.min;
            }
            confidence = 1.0;
        } else if (legs.size() == 1 && approxPickupKm > 0) {
            // Solo se leyo la etiqueta del destino: la recogida se toma de "~X km" y sus
            // minutos se estiman con la misma velocidad del viaje.
            Leg trip = legs.get(0);
            tripKm = plausibleKm(trip.km, trip.min);
            tripMin = trip.min;
            pickupKm = approxPickupKm;
            pickupMin = Math.max(1, Math.round(pickupKm * tripMin / tripKm));
            confidence = 0.80;
        } else if (legs.size() >= 2) {
            // Sin pistas: la recogida suele ser el tramo mas corto.
            Leg first = legs.get(0), second = legs.get(1);
            Leg shorter = first.km <= second.km ? first : second;
            Leg longer = shorter == first ? second : first;
            pickupKm = plausibleKm(shorter.km, shorter.min);
            pickupMin = shorter.min;
            tripKm = plausibleKm(longer.km, longer.min);
            tripMin = longer.min;
            confidence = 0.75;
        } else {
            return null;
        }
        if (pickupKm <= 0 || tripKm <= 0 || pickupMin <= 0 || tripMin <= 0) return null;
        return analyze("indrive", fare, pickupKm, pickupMin, tripKm, tripMin, confidence, config);
    }

    private static boolean stacked(Block a, Block b, List<Block> order) {
        if (!a.hasBounds() || !b.hasBounds()) {
            return Math.abs(order.indexOf(a) - order.indexOf(b)) == 1;
        }
        boolean overlapX = Math.min(a.right, b.right) > Math.max(a.left, b.left);
        int height = Math.max(a.bottom - a.top, b.bottom - b.top);
        int gap = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
        return overlapX && gap <= height;
    }

    private static double nearest(Leg leg, List<Block> markers) {
        double best = Double.MAX_VALUE;
        for (Block marker : markers) best = Math.min(best, leg.distanceTo(marker));
        return best;
    }

    private static boolean sameDistance(double a, double b) {
        return Math.abs(a - b) <= Math.max(0.15, b * 0.08);
    }

    /**
     * Corrige la coma decimal que el OCR pierde ("1,6 km" leido como "16 km"): ningun
     * tramo urbano va a mas de 110 km/h, asi que si la velocidad implicita es imposible
     * y dividir entre diez da una velocidad razonable, se usa esa lectura.
     */
    static double plausibleKm(double km, double min) {
        // Una coma perdida deja un entero ("16"). Si el numero trae decimales ("12.5") la
        // coma si se leyo, y lo que esta mal son los minutos: no se "corrige" la distancia.
        if (km <= 0 || min <= 0 || km != Math.rint(km)) return km;
        double speed = km / (min / 60.0);
        double corrected = (km / 10.0) / (min / 60.0);
        if (speed > 110 && corrected >= 4) return km / 10.0;
        return km;
    }

    /**
     * Un veredicto equivocado es peor que ninguno. Una lectura solo cuenta si describe un
     * viaje posible: cada tramo a una velocidad de ciudad o carretera, y una tarifa por km
     * dentro de lo que cobra cualquier plataforma. Un minuto perdido ("15 min" leido como
     * "1 min") o un importe ajeno a la tarjeta producen numeros como $3,000 por hora y se
     * descartan aqui en vez de anunciarse.
     */
    static boolean plausible(double fare, double pickupKm, double pickupMin, double tripKm, double tripMin) {
        if (fare < 10 || pickupMin < 1 || tripMin < 1 || pickupMin > 90 || tripMin > 300) return false;
        if (!plausibleLeg(pickupKm, pickupMin) || !plausibleLeg(tripKm, tripMin)) return false;
        double perKm = fare / (pickupKm + tripKm);
        double grossPerHour = fare / ((pickupMin + tripMin) / 60.0);
        return perKm >= 2 && perKm <= 150 && grossPerHour <= 2000;
    }

    private static boolean plausibleLeg(double km, double min) {
        double speed = km / (min / 60.0);
        return km > 0 && speed >= 1.5 && speed <= 100;
    }

    private static OfferAnalysis analyze(String platform, double fare, double pickupKm, double pickupMin,
                                         double tripKm, double tripMin, double confidence, CopilotConfig config) {
        if (!plausible(fare, pickupKm, pickupMin, tripKm, tripMin)) return null;
        double totalKm = pickupKm + tripKm;
        double totalMin = pickupMin + tripMin;
        double commission = fare * config.commissionFor(platform) / 100.0;
        double fuel = totalKm * config.operatingEnergyCostPerKm;
        double wear = totalKm * config.wearPerKm;
        double fixed = (totalMin / 60.0) * config.fixedCostPerHour;
        double net = fare - commission - fuel - wear - fixed;
        double hourly = totalMin > 0 ? net / (totalMin / 60.0) : 0;
        double perKm = totalKm > 0 ? net / totalKm : 0;

        double goalValue = config.perKmGoal ? perKm : hourly;
        double goalTarget = config.goalTarget();
        String verdict = goalValue >= goalTarget ? "good"
            : goalValue >= goalTarget * 0.75 && net > 0 ? "maybe" : "bad";
        String explanation;
        if (pickupKm > 4 || pickupMin > 10) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "La recogida es larga: %.1f km y %.0f min.", pickupKm, pickupMin);
        } else if (wear > 0 && (fuel + wear) > fare * 0.25) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Energía y desgaste consumirían cerca de $%.0f.", fuel + wear);
        } else if (fuel > fare * 0.25) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Energía consumiría cerca de $%.0f.", fuel);
        } else if (commission > fare * 0.18) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "La comisión de %s es de $%.0f.", platform.toUpperCase(), commission);
        } else {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Dejaría $%.0f netos en %.0f minutos.", net, totalMin);
        }
        return new OfferAnalysis(platform, fare, pickupKm, pickupMin, tripKm, tripMin,
            net, hourly, perKm, confidence, verdict, explanation,
            config.operatingEnergyCostPerKm, config.vehicleType, config.commissionFor(platform),
            config.wearPerKm, config.fixedCostPerHour);
    }

    private static String platform(String text) {
        if (text.contains("didi")) return "didi";
        if (INDRIVE_MARKERS.matcher(text).find()) return "indrive";
        if (text.contains("uber")) return "uber";
        return "otra";
    }

    /**
     * La tarifa de la tarjeta. Si el boton dice "Aceptar por $X", esa es. Si no, se toma el
     * importe mas cercano a los datos del viaje (km/min) y por encima de ellos: en Uber la
     * pantalla tambien muestra, mas arriba, las ganancias del dia, y tomar el primer importe
     * de la pantalla hacia que el copiloto calculara con ese numero en algunos cuadros.
     */
    private static double extractFare(List<Block> cluster) {
        for (Block block : cluster) {
            Matcher accept = ACCEPT_MONEY.matcher(normalize(block.text));
            if (accept.find()) {
                double value = number(accept.group(1));
                if (value >= 10 && value <= 5000) return value;
            }
        }
        Block anchor = null;
        for (Block block : cluster) {
            String text = hoursToMinutes(normalize(block.text));
            if (!distanceValues(text).isEmpty() || !values(MIN, text).isEmpty()) { anchor = block; break; }
        }
        double best = 0;
        long bestScore = Long.MAX_VALUE;
        for (int i = 0; i < cluster.size(); i++) {
            Block block = cluster.get(i);
            double value = blockFare(block);
            if (value <= 0) continue;
            if (anchor == null || !anchor.hasBounds() || !block.hasBounds()) {
                // Sin posiciones: el primer importe, de arriba hacia abajo.
                if (best <= 0) best = value;
                continue;
            }
            long gap = block.bottom <= anchor.bottom
                ? Math.max(0, anchor.top - block.bottom)
                : 1_000_000L + (block.top - anchor.bottom); // debajo de los datos: ultimo recurso
            if (gap < bestScore) { bestScore = gap; best = value; }
        }
        return best;
    }

    private static double blockFare(Block block) {
        String text = normalize(block.text);
        if (NOT_FARE.matcher(text).find()) return 0;
        Matcher matcher = MONEY.matcher(text);
        while (matcher.find()) {
            double value = number(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
            // Se ignoran recargos menores a $10 y tokens sueltos.
            if (value >= 10 && value <= 5000) return value;
        }
        return 0;
    }

    private static String hoursToMinutes(String text) {
        Matcher matcher = HOURS.matcher(text);
        StringBuffer out = new StringBuffer();
        while (matcher.find()) {
            int minutes = Integer.parseInt(matcher.group(1)) * 60
                + (matcher.group(2) != null ? Integer.parseInt(matcher.group(2)) : 0);
            matcher.appendReplacement(out, minutes + " min");
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /**
     * Distancias en km. "850 m" son metros; pero "1,6 m" o "3 m" no existen como distancia
     * de un viaje: es "km" mal leido por el OCR, asi que se toman como kilometros.
     */
    static List<Double> distanceValues(String text) {
        List<Double> result = new ArrayList<>();
        Matcher matcher = KM_OR_M.matcher(text);
        while (matcher.find()) {
            String raw = matcher.group(1);
            double value = number(raw);
            String unit = matcher.group(2).toLowerCase(Locale.ROOT);
            if ("m".equals(unit)) {
                boolean hasDecimals = raw.contains(",") || raw.contains(".");
                if (!hasDecimals && value >= 10) value = value / 1000.0;
            }
            if (value > 0 && value < 500) result.add(value);
        }
        return result;
    }

    private static List<Double> values(Pattern pattern, String text) {
        List<Double> result = new ArrayList<>();
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            double value = number(matcher.group(1));
            if (value > 0) result.add(value);
        }
        return result;
    }

    private static double number(String value) {
        if (value == null) return 0;
        try { return Double.parseDouble(value.replace(',', '.')); }
        catch (NumberFormatException ignored) { return 0; }
    }

    private static String normalize(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return Normalizer.normalize(lower, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .replace('\u00a0', ' ');
    }
}
