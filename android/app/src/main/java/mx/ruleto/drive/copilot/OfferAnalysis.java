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
    final double energyCostPerKm;
    final String vehicleType;
    final double commissionPct;
    final double wearPerKm;
    final double fixedCostPerHour;

    OfferAnalysis(String platform, double fare, double pickupKm, double pickupMin,
                  double tripKm, double tripMin, double net, double hourly,
                  double perKm, double confidence, String verdict, String explanation) {
        this(platform, fare, pickupKm, pickupMin, tripKm, tripMin, net, hourly, perKm,
            confidence, verdict, explanation, Double.NaN, "combustion", Double.NaN, Double.NaN, Double.NaN);
    }

    OfferAnalysis(String platform, double fare, double pickupKm, double pickupMin,
                  double tripKm, double tripMin, double net, double hourly,
                  double perKm, double confidence, String verdict, String explanation,
                  double energyCostPerKm, String vehicleType, double commissionPct,
                  double wearPerKm, double fixedCostPerHour) {
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
        this.energyCostPerKm = energyCostPerKm;
        this.vehicleType = vehicleType;
        this.commissionPct = commissionPct;
        this.wearPerKm = wearPerKm;
        this.fixedCostPerHour = fixedCostPerHour;
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
            if (Double.isFinite(energyCostPerKm)) value.put("operatingEnergyCostPerKm", energyCostPerKm);
            value.put("vehicleType", vehicleType);
            if (Double.isFinite(commissionPct)) value.put("commissionPct", commissionPct);
            if (Double.isFinite(wearPerKm)) value.put("wearPerKm", wearPerKm);
            if (Double.isFinite(fixedCostPerHour)) value.put("fixedCostPerHour", fixedCostPerHour);
            value.put("signature", signature());
        } catch (JSONException ignored) {}
        return value;
    }

    String signature() {
        return platform + ':' + Math.round(fare * 100) + ':' + Math.round(pickupKm * 10)
            + ':' + Math.round(tripKm * 10) + ':' + Math.round((pickupMin + tripMin) * 10);
    }

    /**
     * Misma oferta leida con pequenas diferencias de OCR: misma tarifa y distancia total
     * parecida. Sirve para no volver a anunciar el viaje que ya se anuncio.
     */
    boolean sameTripAs(OfferAnalysis other) {
        if (other == null || !platform.equals(other.platform)) return false;
        if (Math.abs(fare - other.fare) > 0.5) return false;
        double km = pickupKm + tripKm, otherKm = other.pickupKm + other.tripKm;
        return Math.abs(km - otherKm) <= Math.max(0.3, otherKm * 0.10);
    }

    /** Misma tarjeta en pantalla: misma plataforma y misma tarifa. */
    boolean sameCardAs(OfferAnalysis other) {
        return other != null && platform.equals(other.platform) && Math.abs(fare - other.fare) <= 0.5;
    }

    /**
     * Primero la decision (veredicto y rendimiento contra la meta activa) y despues los datos
     * que se leyeron de la pantalla: tarifa, distancia a la recogida, km y minutos totales.
     * Asi el conductor comprueba de oido que el copiloto leyo bien la tarjeta antes de
     * fiarse del veredicto. El detalle con netos queda en la notificacion expandida.
     */
    String spokenText(boolean perKmGoal) {
        String lead;
        switch (verdict) {
            case "good": lead = "Buen viaje"; break;
            case "maybe": lead = "Aceptable"; break;
            default: lead = "No conviene";
        }
        Locale mx = Locale.forLanguageTag("es-MX");
        String rate = perKmGoal
            ? String.format(mx, "%s por kilómetro", km(perKm))
            : String.format(mx, "%.0f por hora", hourly);
        return String.format(mx, "%s, %s. %.0f pesos, recoges a %s kilómetros, %s en total, %.0f minutos.",
            lead, rate, fare, km(pickupKm), km(pickupKm + tripKm), pickupMin + tripMin);
    }

    /** "2.4" para distancias cortas, "12" para las largas: lo que se alcanza a oir. */
    static String km(double value) {
        double rounded = value < 10 ? Math.round(value * 10) / 10.0 : Math.round(value);
        return rounded == Math.rint(rounded)
            ? String.format(Locale.forLanguageTag("es-MX"), "%.0f", rounded)
            : String.format(Locale.forLanguageTag("es-MX"), "%.1f", rounded);
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
