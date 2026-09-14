package mx.rutaflow.app.copilot;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class OfferParser {
    private static final Pattern MONEY = Pattern.compile("(?:mx\\s*)?\\$\\s*(\\d{1,4}(?:[.,]\\d{1,2})?)|(\\d{1,4}(?:[.,]\\d{1,2})?)\\s*(?:mxn|pesos?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern KM = Pattern.compile("(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*k(?:m|rn)", Pattern.CASE_INSENSITIVE);
    private static final Pattern MIN = Pattern.compile("(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*min(?:uto)?s?", Pattern.CASE_INSENSITIVE);
    private static final Pattern PICKUP = Pattern.compile("recog|recolec|pasajer|llegar|hacia el punto|a recoger|de distancia", Pattern.CASE_INSENSITIVE);
    private static final Pattern TRIP = Pattern.compile("viaje|destino|trayecto|duracion|incluye", Pattern.CASE_INSENSITIVE);

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
            List<Double> lineKm = values(KM, line);
            List<Double> lineMin = values(MIN, line);
            allKm.addAll(lineKm);
            allMin.addAll(lineMin);
            if (PICKUP.matcher(line).find()) {
                if (!lineKm.isEmpty()) pickupKm = lineKm.get(0);
                if (!lineMin.isEmpty()) pickupMin = lineMin.get(0);
            }
            if (TRIP.matcher(line).find()) {
                if (!lineKm.isEmpty()) tripKm = lineKm.get(lineKm.size() - 1);
                if (!lineMin.isEmpty()) tripMin = lineMin.get(lineMin.size() - 1);
            }
        }

        // Common offer cards put pickup first and passenger trip second.
        if (tripKm <= 0 && !allKm.isEmpty()) tripKm = allKm.get(allKm.size() - 1);
        if (tripMin <= 0 && !allMin.isEmpty()) tripMin = allMin.get(allMin.size() - 1);
        if (pickupKm <= 0 && allKm.size() >= 2) pickupKm = allKm.get(0);
        if (pickupMin <= 0 && allMin.size() >= 2) pickupMin = allMin.get(0);

        double totalKm = pickupKm + tripKm;
        double totalMin = pickupMin + tripMin;
        if (totalKm <= 0 && totalMin <= 0) return null;

        double commission = fare * config.commissionFor(platform) / 100.0;
        double fuel = totalKm / config.kmPerLiter * config.gasPrice;
        double wear = totalKm * config.wearPerKm;
        double net = fare - commission - fuel - wear;
        // Distance-only cards use a conservative city-speed estimate.
        double evaluatedMinutes = totalMin > 0 ? totalMin : totalKm / 24.0 * 60.0;
        double hourly = evaluatedMinutes > 0 ? net / (evaluatedMinutes / 60.0) : 0;
        double perKm = totalKm > 0 ? net / totalKm : 0;

        double confidence = 0.45;
        if (!"otra".equals(platform)) confidence += 0.15;
        if (totalKm > 0) confidence += 0.15;
        if (totalMin > 0) confidence += 0.15;
        if (allKm.size() >= 2 || allMin.size() >= 2) confidence += 0.10;
        confidence = Math.min(1, confidence);

        String verdict = hourly >= config.targetHourlyRate ? "good"
            : hourly >= config.targetHourlyRate * 0.75 && net > 0 ? "maybe" : "bad";
        String explanation;
        if (pickupKm > 4 || pickupMin > 10) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "La recogida es larga: %.1f kilómetros y %.0f minutos.", pickupKm, pickupMin);
        } else if (fuel + wear > fare * 0.25) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Gasolina y desgaste consumirían cerca de %.0f pesos.", fuel + wear);
        } else if (commission > fare * 0.18) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "La comisión estimada es de %.0f pesos.", commission);
        } else if (totalMin > 0) {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Dejaría %.0f pesos netos en aproximadamente %.0f minutos.", net, totalMin);
        } else {
            explanation = String.format(Locale.forLanguageTag("es-MX"), "Dejaría %.0f pesos netos después de costos.", net);
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
        Matcher matcher = MONEY.matcher(text);
        double best = 0;
        while (matcher.find()) {
            double value = number(matcher.group(1) != null ? matcher.group(1) : matcher.group(2));
            // Ignore tiny currency-like values but don't pick implausible four-digit map labels.
            if (value >= 10 && value <= 5000) best = Math.max(best, value);
        }
        return best;
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
