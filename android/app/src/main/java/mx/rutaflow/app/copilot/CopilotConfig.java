package mx.rutaflow.app.copilot;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;

final class CopilotConfig {
    final double gasPrice;
    final double kmPerLiter;
    final double targetHourlyRate;
    final double wearPerKm;
    final Map<String, Double> commissions;
    final String platformHint;

    CopilotConfig(double gasPrice, double kmPerLiter, double targetHourlyRate,
                  double wearPerKm, Map<String, Double> commissions, String platformHint) {
        this.gasPrice = positiveOr(gasPrice, 24.0);
        this.kmPerLiter = positiveOr(kmPerLiter, 12.0);
        this.targetHourlyRate = positiveOr(targetHourlyRate, 200.0);
        this.wearPerKm = Math.max(0, wearPerKm);
        this.commissions = commissions == null ? new HashMap<>() : commissions;
        this.platformHint = platformHint == null || platformHint.isEmpty() ? "otra" : platformHint;
    }

    static CopilotConfig fromJson(String json) {
        try {
            JSONObject value = new JSONObject(json == null ? "{}" : json);
            JSONObject commissionJson = value.optJSONObject("commissions");
            Map<String, Double> commissionMap = new HashMap<>();
            if (commissionJson != null) {
                Iterator<String> keys = commissionJson.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    commissionMap.put(key.toLowerCase(Locale.ROOT), commissionJson.optDouble(key, 0.0));
                }
            }
            return new CopilotConfig(
                value.optDouble("gasPricePerLiter", 24.0),
                value.optDouble("kmPerLiter", 12.0),
                value.optDouble("targetHourlyRate", 200.0),
                value.optDouble("wearPerKm", 0.0),
                commissionMap,
                value.optString("platformHint", "otra")
            );
        } catch (JSONException ignored) {
            return defaults();
        }
    }

    static CopilotConfig defaults() {
        Map<String, Double> commissions = new HashMap<>();
        commissions.put("uber", 25.0);
        commissions.put("didi", 12.0);
        commissions.put("indrive", 10.0);
        return new CopilotConfig(24.0, 12.0, 200.0, 0.0, commissions, "otra");
    }

    double commissionFor(String platform) {
        return Math.max(0, commissions.getOrDefault(platform, 0.0));
    }

    private static double positiveOr(double value, double fallback) {
        return Double.isFinite(value) && value > 0 ? value : fallback;
    }
}
