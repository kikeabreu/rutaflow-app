package mx.ruleto.drive.copilot;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class OfferParser {
    private static final Pattern MONEY = Pattern.compile("(?:mx\\s*)?\\$\\s*(\\d{1,4}(?:[.,]\\d{1,2})?)|(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(?:mxn|pesos?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern ACCEPT_MONEY = Pattern.compile("aceptar\\s*(?:mx\\s*)?\\$\\s*(\\d{1,4}(?:[.,]\\d{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern KM_OR_M = Pattern.compile("(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*(k(?:m|rn)|m\\b)", Pattern.CASE_INSENSITIVE);
    private static final Pattern MIN = Pattern.compile("(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*min(?:uto)?s?", Pattern.CASE_INSENSITIVE);
    private static final Pattern PICKUP = Pattern.compile("recog|recolec|pasajer|llegar|hacia el punto|a recoger|de distancia", Pattern.CASE_INSENSITIVE);
    private static final Pattern TRIP = Pattern.compile("viaje|destino|trayecto|duracion|incluye", Pattern.CASE_INSENSITIVE);
    // Marca el final de una tarjeta de oferta en una lista con varias ofertas visibles a la vez.
    private static final Pattern CARD_END = Pattern.compile("tomar\\s+viaje|aceptar\\s*(?:mx\\s*)?\\$", Pattern.CASE_INSENSITIVE);
    // Nuestra propia notificacion (voz/heads-up) queda dentro de la captura de pantalla; si no la
    // excluimos, sus numeros del viaje anterior contaminan la lectura del viaje que sigue.
    private static final Pattern OWN_VOICE = Pattern.compile("no conviene|buen viaje|viaje aceptable", Pattern.CASE_INSENSITIVE);

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
        List<Block> sorted = new ArrayList<>(blocks);
        Collections.sort(sorted, (a, b) -> Integer.compare(a.top, b.top));

        List<List<Block>> clusters = new ArrayList<>();
        List<Block> current = new ArrayList<>();
        for (Block block : sorted) {
            String normalized = normalize(block.text);
            if (OWN_VOICE.matcher(normalized).find()) continue;
            current.add(block);
            if (CARD_END.matcher(normalized).find()) {
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
            StringBuilder text = new StringBuilder();
            int left = Integer.MAX_VALUE, top = Integer.MAX_VALUE, right = Integer.MIN_VALUE, bottom = Integer.MIN_VALUE;
            boolean anyBounds = false;
            for (Block block : cluster) {
                if (text.length() > 0) text.append('\n');
                text.append(block.text);
                if (block.hasBounds()) {
                    left = Math.min(left, block.left);
                    top = Math.min(top, block.top);
                    right = Math.max(right, block.right);
                    bottom = Math.max(bottom, block.bottom);
                    anyBounds = true;
                }
            }
            OfferAnalysis analysis = parse(text.toString(), config);
            if (analysis == null || analysis.confidence < 0.60) continue;
            results.add(anyBounds
                ? new DetectedOffer(analysis, left, top, right, bottom)
                : new DetectedOffer(analysis, 0, 0, 0, 0));
        }
        return results;
    }

    static OfferAnalysis parse(String rawText, CopilotConfig config) {
        if (rawText == null || rawText.trim().isEmpty()) return null;
        String normalized = normalize(rawText);
        String platform = platform(normalized);
        if ("otra".equals(platform)) platform = config.platformHint;
        double fare = extractFare(normalized);
        if (fare <= 0) return null;

        List<Double> allKm = new ArrayList<>();
        List<Double> allMin = new ArrayList<>();
        double pickupKm = 0, pickupMin = 0, tripKm = 0, tripMin = 0;
        for (String line : normalized.split("\\n")) {
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

        double totalKm = pickupKm + tripKm;
        double totalMin = pickupMin + tripMin;
        // Require both distances and times or strict complete metrics
        if (fare <= 0 || pickupKm <= 0 || tripKm <= 0 || pickupMin <= 0 || tripMin <= 0) return null;

        double commission = fare * config.commissionFor(platform) / 100.0;
        double fuel = totalKm / config.kmPerLiter * config.gasPrice;
        double wear = totalKm * config.wearPerKm;
        double net = fare - commission - fuel - wear;
        double hourly = totalMin > 0 ? net / (totalMin / 60.0) : 0;
        double perKm = totalKm > 0 ? net / totalKm : 0;

        double confidence = 0.50;
        if (!"otra".equals(platform)) confidence += 0.15;
        if (pickupKm > 0 && tripKm > 0) confidence += 0.20;
        if (pickupMin > 0 && tripMin > 0) confidence += 0.15;
        confidence = Math.min(1.0, confidence);

        double goalValue = config.perKmGoal ? perKm : hourly;
        double goalTarget = config.goalTarget();
        String verdict = goalValue >= goalTarget ? "good"
            : goalValue >= goalTarget * 0.75 && net > 0 ? "maybe" : "bad";
        String explanation;
        if (pickupKm > 4 || pickupMin > 10) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "La recogida es larga: %.1f km y %.0f min.", pickupKm, pickupMin);
        } else if (wear > 0 && (fuel + wear) > fare * 0.25) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Gasolina y desgaste consumirían cerca de $%.0f.", fuel + wear);
        } else if (fuel > fare * 0.25) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Gasolina consumiría cerca de $%.0f.", fuel);
        } else if (commission > fare * 0.18) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "La comisión de %s es de $%.0f.", platform.toUpperCase(), commission);
        } else {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Dejaría $%.0f netos en %.0f minutos.", net, totalMin);
        }
        return new OfferAnalysis(platform, fare, pickupKm, pickupMin, tripKm, tripMin,
            net, hourly, perKm, confidence, verdict, explanation);

    }

    private static String platform(String text) {
        if (text.contains("didi")) return "didi";
        if (text.contains("indrive") || text.contains("in drive")) return "indrive";
        if (text.contains("uber")) return "uber";
        return "otra";
    }

    private static double extractFare(String text) {
        Matcher acceptMatcher = ACCEPT_MONEY.matcher(text);
        if (acceptMatcher.find()) {
            double value = number(acceptMatcher.group(1));
            if (value >= 10 && value <= 5000) return value;
        }

        Matcher matcher = MONEY.matcher(text);
        while (matcher.find()) {
            double value = number(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
            // First plausible top-down fare (ignore sub-10 gas surcharges or tiny tokens)
            if (value >= 10 && value <= 5000) return value;
        }
        return 0;
    }

    private static List<Double> distanceValues(String text) {
        List<Double> result = new ArrayList<>();
        Matcher matcher = KM_OR_M.matcher(text);
        while (matcher.find()) {
            double value = number(matcher.group(1));
            String unit = matcher.group(2) != null ? matcher.group(2).toLowerCase(Locale.ROOT) : "km";
            if ("m".equals(unit)) {
                value = value / 1000.0;
            }
            if (value > 0) result.add(value);
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
