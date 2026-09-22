package mx.rutaflow.app.copilot;

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
        } catch (JSONException ignored) {}
        return value;
    }

    String signature() {
        return platform + ':' + Math.round(fare * 100) + ':' + Math.round(pickupKm * 10)
            + ':' + Math.round(tripKm * 10) + ':' + Math.round((pickupMin + tripMin) * 10);
    }

    /**
     * Veredicto primero para que el conductor decida sin esperar el resto, luego el monto
     * ofrecido para confirmar de oido que hablamos del viaje que tiene en pantalla. La
     * explicacion queda en la notificacion expandida: al volante, una frase larga se
     * pierde antes de que termine de sonar.
     */
    String spokenText() {
        String lead;
        switch (verdict) {
            case "good": lead = "Buen viaje"; break;
            case "maybe": lead = "Viaje aceptable"; break;
            default: lead = "No conviene";
        }
        return String.format(Locale.forLanguageTag("es-MX"), "%s. Ofrecen %.0f pesos, %.0f por hora.",
            lead, fare, hourly);
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
