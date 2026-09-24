package mx.rutaflow.app.copilot;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RutaFlowCopilot")
public class CopilotPlugin extends Plugin {
    private BroadcastReceiver eventReceiver;

    @Override
    public void load() {
        eventReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String event = intent.getStringExtra(CopilotCaptureService.EXTRA_EVENT);
                String payload = intent.getStringExtra(CopilotCaptureService.EXTRA_PAYLOAD);
                JSObject data = new JSObject();
                try {
                    if (payload != null) data = new JSObject(payload);
                } catch (Exception ignored) {
                    data.put("message", payload == null ? "" : payload);
                }
                notifyListeners(event == null ? "status" : event, data);
            }
        };
        ContextCompat.registerReceiver(
            getContext(), eventReceiver,
            new IntentFilter(CopilotCaptureService.ACTION_EVENT),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    protected void handleOnDestroy() {
        if (eventReceiver != null) {
            try { getContext().unregisterReceiver(eventReceiver); }
            catch (IllegalArgumentException ignored) {}
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("platform", "android");
        result.put("canDrawOverlays", android.provider.Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (android.provider.Settings.canDrawOverlays(getContext())) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        Intent intent = new Intent(
            android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject res = new JSObject();
        res.put("requested", true);
        call.resolve(res);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE);
        boolean desired = prefs.getBoolean(CopilotCaptureService.PREF_DESIRED, false);
        boolean running = prefs.getBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false) && isServiceRunning();
        boolean needsConsent = prefs.getBoolean(CopilotCaptureService.PREF_NEEDS_CONSENT, false);
        String stopReason = prefs.getString(CopilotCaptureService.PREF_STOP_REASON, "");
        if (!running && prefs.getBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false)) {
            needsConsent = desired;
            stopReason = desired ? "service_not_running" : "user_stopped";
            prefs.edit()
                .putBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false)
                .putBoolean(CopilotCaptureService.PREF_NEEDS_CONSENT, needsConsent)
                .putString(CopilotCaptureService.PREF_STOP_REASON, stopReason)
                .apply();
        }
        JSObject result = new JSObject();
        result.put("running", running);
        result.put("desired", desired);
        result.put("needs_consent", needsConsent);
        result.put("stop_reason", stopReason == null ? "" : stopReason);
        result.put("canDrawOverlays", android.provider.Settings.canDrawOverlays(getContext()));
        result.put("message", running ? "Copiloto escuchando ofertas"
            : needsConsent ? "La captura requiere autorización. Toca iniciar el copiloto." : "Copiloto apagado");
        String lastOffer = prefs.getString(CopilotCaptureService.PREF_LAST_OFFER, "");
        if (lastOffer != null && !lastOffer.isEmpty()) {
            try { result.put("lastOffer", new JSObject(lastOffer)); }
            catch (Exception ignored) {}
        }
        call.resolve(result);
    }

    @PluginMethod
    public void updateConfig(PluginCall call) {
        String config = call.getString("config", "{}");
        getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
            .edit().putString(CopilotCaptureService.PREF_CONFIG, config).apply();
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        String config = call.getString("config", "{}");
        getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(CopilotCaptureService.PREF_CONFIG, config)
            .putBoolean(CopilotCaptureService.PREF_DESIRED, true)
            .putBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false)
            .putBoolean(CopilotCaptureService.PREF_NEEDS_CONSENT, true)
            .putString(CopilotCaptureService.PREF_STOP_REASON, "awaiting_consent")
            .apply();
        MediaProjectionManager manager = (MediaProjectionManager)
            getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false)
                .putBoolean(CopilotCaptureService.PREF_NEEDS_CONSENT, false)
                .putString(CopilotCaptureService.PREF_STOP_REASON, "projection_unavailable")
                .apply();
            call.reject("Este teléfono no permite compartir la pantalla.");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "capturePermissionResult");
    }

    @ActivityCallback
    private void capturePermissionResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false)
                .putBoolean(CopilotCaptureService.PREF_NEEDS_CONSENT, true)
                .putString(CopilotCaptureService.PREF_STOP_REASON, "consent_denied")
                .apply();
            call.reject("Necesitamos permiso de captura para leer las ofertas.");
            return;
        }
        Intent service = new Intent(getContext(), CopilotCaptureService.class);
        service.setAction(CopilotCaptureService.ACTION_START);
        service.putExtra(CopilotCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        service.putExtra(CopilotCaptureService.EXTRA_RESULT_DATA, result.getData());
        ContextCompat.startForegroundService(getContext(), service);
        JSObject response = new JSObject();
        // The service publishes running=true only after MediaProjection and its
        // VirtualDisplay are live. Omitting running here also avoids overwriting that
        // broadcast if startup completes before this plugin call resolves.
        response.put("starting", true);
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(CopilotCaptureService.PREF_DESIRED, false)
            .putBoolean(CopilotCaptureService.PREF_CAPTURE_ACTIVE, false)
            .putBoolean(CopilotCaptureService.PREF_NEEDS_CONSENT, false)
            .putString(CopilotCaptureService.PREF_STOP_REASON, "user_stopped")
            .apply();
        getContext().stopService(new Intent(getContext(), CopilotCaptureService.class));
        JSObject response = new JSObject();
        response.put("running", false);
        response.put("busy", false);
        response.put("needs_consent", false);
        response.put("stop_reason", "user_stopped");
        response.put("message", "Copiloto apagado");
        call.resolve(response);
    }

    private boolean isServiceRunning() {
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return false;
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (CopilotCaptureService.class.getName().equals(service.service.getClassName())) return true;
        }
        return false;
    }
}
