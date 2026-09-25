package mx.ruleto.drive.copilot;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

final class OfferAnalysis {
    final String platform;
    final double fare;
    final double pickupKm;
    final double pickupMin;
    final double tripKm;
    final double tripMin;
    final double net;
    final double hourly;
    final double perKm;
    final double confidence;
    final String verdict;
    final String explanation;

    OfferAnalysis(String platform, double fare, double pickupKm, double pickupMin,
                  double tripKm, double tripMin, double net, double hourly,
                  double perKm, double confidence, String verdict, String explanation) {
        this.platform = platform;
        this.fare = fare;
        this.pickupKm = pickupKm;
        this.pickupMin = pickupMin;
        this.tripKm = tripKm;
        this.tripMin = tripMin;
        this.net = net;
        this.hourly = hourly;
        this.perKm = perKm;
        this.confidence = confidence;
        this.verdict = verdict;
        this.explanation = explanation;
    }

    JSONObject toJson() {
        JSONObject value = new JSONObject();
        try {
            value.put("platform", platform);
            value.put("fare", round(fare));
            value.put("pickupKm", round(pickupKm));
            value.put("pickupMin", round(pickupMin));
            value.put("tripKm", round(tripKm));
            value.put("tripMin", round(tripMin));
            value.put("net", round(net));
            value.put("hourly", round(hourly));
            value.put("perKm", round(perKm));
            value.put("confidence", round(confidence));
            value.put("verdict", verdict);
            value.put("explanation", explanation);
            value.put("signature", signature());
        } catch (JSONException ignored) {}
        return value;
    }

    String signature() {
        return platform + ':' + Math.round(fare * 100) + ':' + Math.round(pickupKm * 10)
            + ':' + Math.round(tripKm * 10) + ':' + Math.round((pickupMin + tripMin) * 10);
    }

    /**
     * Frase minima para que quepa completa antes de que llegue la siguiente oferta:
     * veredicto, tarifa y el rendimiento contra la meta activa (por hora o por km),
     * sin relleno. El detalle completo queda en la notificacion expandida, no en la voz.
     */
    String spokenText(boolean perKmGoal) {
        String lead;
        switch (verdict) {
            case "good": lead = "Buen viaje"; break;
            case "maybe": lead = "Aceptable"; break;
            default: lead = "No conviene";
        }
        return perKmGoal
            ? String.format(Locale.forLanguageTag("es-MX"), "%s. %.0f pesos. %.1f por kilometro.", lead, fare, perKm)
            : String.format(Locale.forLanguageTag("es-MX"), "%s. %.0f pesos. %.0f por hora.", lead, fare, hourly);
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
